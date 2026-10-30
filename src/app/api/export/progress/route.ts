import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { can, employeeScope, getCurrentUser } from "@/lib/auth";
import { getEmployeeProgress, getUserProgress, parseRange } from "@/lib/queries";
import { PdfReport } from "@/lib/export/pdf";
import { buildXlsx } from "@/lib/export/xlsx";
import { badRequest, exportFormat, fileName, fileResponse, ORG } from "@/lib/export/respond";
import { PRIORITY_META, STATUS_META, taskCode } from "@/lib/workflow";
import { fmtDate } from "@/lib/utils";
import { endOfDay } from "date-fns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/export/progress?format=xlsx|pdf&range=…&employee=<Employee ID> (employee lookup needs progress.employee) */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return badRequest("Not signed in", 401);
  const p = req.nextUrl.searchParams;
  const fmt = exportFormat(p.get("format"));
  if (!fmt) return badRequest("format must be xlsx or pdf");
  const range = parseRange({ range: p.get("range") ?? undefined, from: p.get("from") ?? undefined, to: p.get("to") ?? undefined });
  const code = p.get("employee")?.trim();

  let who: { name: string; line: string };
  let data: Awaited<ReturnType<typeof getUserProgress>>;
  if (code) {
    if (!can(user, "progress.employee")) return badRequest("Not allowed", 403);
    const emp = await db.employee.findFirst({
      where: { AND: [employeeScope(user), { OR: [{ employeeCode: { equals: code, mode: "insensitive" } }, { email: { equals: code, mode: "insensitive" } }] }] },
      select: { id: true },
    });
    const res = emp ? await getEmployeeProgress(emp.id, range) : null;
    if (!res) return badRequest("Employee not found", 404);
    const e = res.employee;
    who = { name: e.name, line: `${e.employeeCode} · ${e.designation ?? "—"} · ${e.department.name}${e.user ? ` · @${e.user.username}` : ""}` };
    data = res;
  } else {
    data = await getUserProgress(user.id, range);
    who = { name: user.displayName, line: `${user.employee?.employeeCode ?? "—"} · @${user.username} · ${user.role.name}` };
  }

  const period = `${fmtDate(range.from)} – ${fmtDate(range.to)}`;
  const completed = data.completed.map((t) => ({
    code: taskCode(t.number), title: t.title, team: t.team.name, createdAt: t.createdAt, completedAt: t.completedAt, dueDate: t.dueDate,
    onTime: t.dueDate && t.completedAt ? (t.completedAt <= endOfDay(t.dueDate) ? "On time" : "Late") : "—",
  }));
  const open = data.open.map((t) => ({
    code: taskCode(t.number), title: t.title, team: t.team.name, status: STATUS_META[t.status].label,
    priority: PRIORITY_META[t.priority].label, progress: t.progress / 100, dueDate: t.dueDate,
    overdue: t.dueDate && t.dueDate < new Date() ? "Yes" : "No",
  }));
  const summary = [
    { metric: "Open now", value: data.open.length },
    { metric: "Overdue now", value: data.overdue },
    { metric: "Completed in period", value: data.completed.length },
    { metric: "On-time rate", value: data.onTimeRate === null ? "—" : `${data.onTimeRate}%` },
    { metric: "Updates made in period", value: data.activityCount },
  ];
  const file = `progress-${code ?? user.username}`;

  if (fmt === "xlsx") {
    const bytes = await buildXlsx([
      { name: "Summary", title: `Progress — ${who.name}`, subtitle: `${who.line} · ${period}`, columns: [{ header: "Metric", key: "metric", width: 30 }, { header: "Value", key: "value", width: 12 }], rows: summary },
      {
        name: "Completed", title: "Completed in period",
        columns: [
          { header: "Task No", key: "code", width: 12 }, { header: "Title", key: "title", width: 44 }, { header: "Team", key: "team", width: 18 },
          { header: "Logged", key: "createdAt", type: "date", width: 13 }, { header: "Completed", key: "completedAt", type: "date", width: 13 },
          { header: "Due", key: "dueDate", type: "date", width: 13 }, { header: "On time", key: "onTime", width: 10 },
        ],
        rows: completed,
      },
      {
        name: "Open", title: "Open tasks now",
        columns: [
          { header: "Task No", key: "code", width: 12 }, { header: "Title", key: "title", width: 44 }, { header: "Team", key: "team", width: 18 },
          { header: "Status", key: "status", width: 16 }, { header: "Priority", key: "priority", width: 10 }, { header: "Progress", key: "progress", type: "percent" },
          { header: "Due", key: "dueDate", type: "date", width: 13 }, { header: "Overdue", key: "overdue", width: 9 },
        ],
        rows: open,
      },
      { name: "Daily", title: "Completed over time", columns: [{ header: "Period", key: "label", width: 14 }, { header: "Completed", key: "completed", type: "number" }], rows: data.trend },
    ]);
    return fileResponse(bytes, fileName(file, fmt), fmt);
  }

  const pdf = await PdfReport.create({ title: `Progress — ${who.name}`, subtitle: `${who.line} · ${period}`, org: ORG(), generatedBy: user.displayName });
  pdf.stats([
    { label: "Open now", value: String(data.open.length) },
    { label: "Overdue now", value: String(data.overdue), color: data.overdue ? "#d03b3b" : undefined },
    { label: "Completed", value: String(data.completed.length), color: "#027a48" },
    { label: "On-time rate", value: data.onTimeRate === null ? "—" : `${data.onTimeRate}%` },
  ]);
  pdf.heading("Completed in this period");
  pdf.table(
    [{ header: "Task No", width: 0.9 }, { header: "Title", width: 3 }, { header: "Team", width: 1.3 }, { header: "Completed", width: 1 }, { header: "Due", width: 1 }, { header: "On time", width: 0.8 }],
    completed.map((c) => [c.code, c.title, c.team, fmtDate(c.completedAt), fmtDate(c.dueDate), c.onTime === "Late" ? { text: "Late", color: "#d03b3b", bold: true } : c.onTime]),
    { empty: "No tasks completed in this period." },
  );
  pdf.heading("Open tasks");
  pdf.table(
    [{ header: "Task No", width: 0.9 }, { header: "Title", width: 3 }, { header: "Status", width: 1.3 }, { header: "Priority", width: 0.8 }, { header: "Progress", width: 0.8, align: "right" }, { header: "Due", width: 1 }],
    open.map((o) => [o.code, o.title, o.status, o.priority, `${Math.round(o.progress * 100)}%`, o.overdue === "Yes" ? { text: fmtDate(o.dueDate), color: "#d03b3b", bold: true } : fmtDate(o.dueDate)]),
    { empty: "Nothing open." },
  );
  return fileResponse(await pdf.save(), fileName(file, fmt), fmt);
}
