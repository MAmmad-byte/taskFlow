import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { canViewTask, getCurrentUser } from "@/lib/auth";
import { PdfReport } from "@/lib/export/pdf";
import { buildXlsx } from "@/lib/export/xlsx";
import { badRequest, exportFormat, fileName, fileResponse, ORG } from "@/lib/export/respond";
import { PRIORITY_META, SOURCE_META, STATUS_META, TYPE_META, taskCode } from "@/lib/workflow";
import { fmtDate, fmtDateTime } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/export/tasks/:id?format=pdf|xlsx — task sheet with its full history (e.g. for UAT sign-off files). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return badRequest("Not signed in", 401);
  const fmt = exportFormat(req.nextUrl.searchParams.get("format")) ?? "pdf";
  const { id } = await params;

  const task = await db.task.findUnique({
    where: { id },
    include: {
      team: { select: { id: true, name: true, departmentId: true } },
      application: { select: { name: true } },
      assignee: { select: { username: true, displayTitle: true, employee: { select: { name: true, employeeCode: true } } } },
      createdBy: { select: { username: true, employee: { select: { name: true } } } },
      completedByEmployee: { select: { name: true, employeeCode: true } },
      activities: {
        orderBy: { createdAt: "asc" },
        include: {
          actor: { select: { username: true, employee: { select: { name: true } } } },
          actorEmployee: { select: { name: true, employeeCode: true } },
        },
      },
    },
  });
  if (!task || !canViewTask(user, task)) return badRequest("Task not found", 404);

  const ids = [...new Set(task.activities.flatMap((a) => [a.fromAssigneeId, a.toAssigneeId]).filter((x): x is string => !!x))];
  const people = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, employee: { select: { name: true } } } });
  const nameOf = (uid: string | null) => {
    if (!uid) return "nobody";
    const u = people.find((p) => p.id === uid);
    return u ? u.employee?.name ?? u.username : "a removed user";
  };
  const describe = (a: (typeof task.activities)[number]) => {
    switch (a.type) {
      case "CREATED": return "Logged the task";
      case "ASSIGNED": return `Assigned${a.fromAssigneeId ? ` from ${nameOf(a.fromAssigneeId)}` : ""} to ${nameOf(a.toAssigneeId)}`;
      case "STATUS_CHANGE": return `${a.fromStatus ? STATUS_META[a.fromStatus].label : "—"} -> ${a.toStatus ? STATUS_META[a.toStatus].label : "—"}`;
      case "COMMENT": return a.progress !== null ? `Progress ${a.progress}%` : "Comment";
      default: return "Updated details";
    }
  };
  const history = task.activities.map((a) => ({
    when: a.createdAt,
    who: a.actorEmployee?.name ?? a.actor.employee?.name ?? a.actor.username,
    employeeCode: a.actorEmployee?.employeeCode ?? "",
    action: describe(a),
    note: a.type === "UPDATED" || a.type === "CREATED" ? "" : a.note ?? "",
  }));

  const code = taskCode(task.number);
  const assignee = task.assignee ? `${task.assignee.employee?.name ?? task.assignee.displayTitle ?? task.assignee.username} (@${task.assignee.username}${task.assignee.employee ? ", " + task.assignee.employee.employeeCode : ""})` : "Unassigned";
  const details = [
    { label: "Status", value: STATUS_META[task.status].label },
    { label: "Priority", value: PRIORITY_META[task.priority].label },
    { label: "Type", value: TYPE_META[task.type].label },
    { label: "Application", value: task.application?.name ?? "—" },
    { label: "Team", value: task.team.name },
    { label: "Assignee", value: assignee },
    { label: "Progress", value: `${task.progress}%` },
    { label: "Logged by", value: task.createdBy.employee?.name ?? task.createdBy.username },
    { label: "Logged on", value: fmtDateTime(task.createdAt) },
    { label: "Start date", value: fmtDate(task.startDate) },
    { label: "Due date", value: fmtDate(task.dueDate) },
    { label: "Completed", value: task.completedAt ? `${fmtDate(task.completedAt)}${task.completedByEmployee ? " · " + task.completedByEmployee.name : ""}` : "—" },
    { label: "Closed", value: fmtDate(task.closedAt) },
    { label: "Requested by", value: task.requesterName ?? "—" },
    { label: "Office", value: task.requesterOffice ?? "—" },
    { label: "Contact", value: task.requesterContact ?? "—" },
    { label: "Received via", value: SOURCE_META[task.source].label },
  ];

  if (fmt === "xlsx") {
    const bytes = await buildXlsx([
      {
        name: "Task", title: `${code} — ${task.title}`, subtitle: task.description ?? undefined,
        columns: [{ header: "Field", key: "label", width: 18 }, { header: "Value", key: "value", width: 70 }],
        rows: details,
      },
      {
        name: "History", title: `${code} history`,
        columns: [
          { header: "When", key: "when", width: 18, type: "datetime" },
          { header: "By", key: "who", width: 22 },
          { header: "Employee ID", key: "employeeCode", width: 13 },
          { header: "Action", key: "action", width: 34 },
          { header: "Note", key: "note", width: 60 },
        ],
        rows: history,
      },
    ]);
    return fileResponse(bytes, fileName(code, fmt), fmt);
  }

  const pdf = await PdfReport.create({ title: `${code} · ${task.title}`, subtitle: `${task.team.name} · ${STATUS_META[task.status].label}`, org: ORG(), generatedBy: user.displayName });
  pdf.heading("Details");
  pdf.keyValues(details);
  pdf.heading("Description");
  pdf.paragraph(task.description || "No description provided.");
  pdf.heading("History");
  pdf.table(
    [{ header: "When", width: 1.3 }, { header: "By", width: 1.3 }, { header: "Action", width: 1.6 }, { header: "Note", width: 2.6 }],
    history.map((h) => [fmtDateTime(h.when), h.employeeCode ? `${h.who} (${h.employeeCode})` : h.who, h.action, h.note || "—"]),
  );
  pdf.spacer(24);
  pdf.keyValues([
    { label: "Verified by (name / sign)", value: " " },
    { label: "Date", value: " " },
  ]);
  return fileResponse(await pdf.save(), fileName(code, fmt), fmt);
}
