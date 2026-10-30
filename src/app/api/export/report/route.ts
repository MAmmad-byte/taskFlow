import type { NextRequest } from "next/server";
import { can, getCurrentUser, scopeLevel } from "@/lib/auth";
import { getReport, parseRange } from "@/lib/queries";
import { PdfReport } from "@/lib/export/pdf";
import { buildXlsx } from "@/lib/export/xlsx";
import { badRequest, exportFormat, fileName, fileResponse, ORG } from "@/lib/export/respond";
import { PHASE_META } from "@/lib/workflow";
import { fmtDate, pct } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/export/report?format=xlsx|pdf&range=30d|from=&to=&team= */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return badRequest("Not signed in", 401);
  if (!can(user, "report.view")) return badRequest("Not allowed", 403);
  const p = req.nextUrl.searchParams;
  const fmt = exportFormat(p.get("format"));
  if (!fmt) return badRequest("format must be xlsx or pdf");

  const range = parseRange({ range: p.get("range") ?? undefined, from: p.get("from") ?? undefined, to: p.get("to") ?? undefined });
  const teamId = p.get("team") || undefined;
  const r = await getReport(user, range, teamId);
  const scope = teamId && r.teams[0] ? r.teams[0].name
    : scopeLevel(user) === "all" ? "All departments" : scopeLevel(user) === "department" ? user.departmentName ?? "Department" : "My teams";
  const period = `${fmtDate(range.from)} – ${fmtDate(range.to)}`;
  const k = r.kpis;

  const kpiRows = [
    { metric: "Tasks logged in period", value: k.created },
    { metric: "Tasks completed in period", value: k.completed },
    { metric: "Open now", value: k.open },
    { metric: "Overdue now", value: k.overdue },
    { metric: "On-time completion rate", value: k.onTimeRate === null ? "—" : `${k.onTimeRate}%` },
    { metric: "Average resolution (days)", value: k.avgResolutionDays ?? "—" },
  ];
  const teamRows = r.teamProgress.map((t) => ({
    team: t.team, total: t.total, open: t.open, active: t.active, review: t.review, done: t.done, cancelled: t.cancelled, completion: t.completion / 100,
  }));

  if (fmt === "xlsx") {
    const sub = `${scope} · ${period}`;
    const bytes = await buildXlsx([
      { name: "Summary", title: "Team performance report", subtitle: sub, columns: [{ header: "Metric", key: "metric", width: 34 }, { header: "Value", key: "value", width: 14 }], rows: kpiRows },
      {
        name: "Team progress", title: "Team progress", subtitle: "Tasks logged in the period, by where they stand now",
        columns: [
          { header: "Team", key: "team", width: 24 }, { header: "Total", key: "total", type: "number" },
          { header: PHASE_META.open.label, key: "open", type: "number" }, { header: PHASE_META.active.label, key: "active", type: "number" },
          { header: PHASE_META.review.label, key: "review", type: "number" }, { header: PHASE_META.done.label, key: "done", type: "number" },
          { header: "Cancelled", key: "cancelled", type: "number" }, { header: "Completion", key: "completion", type: "percent" },
        ],
        rows: teamRows,
      },
      {
        name: "Trend", title: `Logged vs completed (per ${r.trendUnit})`, subtitle: sub,
        columns: [{ header: r.trendUnit === "day" ? "Day" : "Week of", key: "label", width: 14 }, { header: "Logged", key: "created", type: "number" }, { header: "Completed", key: "completed", type: "number" }],
        rows: r.trend,
      },
      {
        name: "By status", title: "Current status of tasks logged in the period",
        columns: [{ header: "Status", key: "label", width: 22 }, { header: "Tasks", key: "count", type: "number" }],
        rows: r.statusCounts,
      },
      {
        name: "By application", title: "Volume per application",
        columns: [{ header: "Application", key: "name", width: 22 }, { header: "Logged", key: "count", type: "number" }, { header: "Done", key: "done", type: "number" }, { header: "Done %", key: "pct", type: "percent" }],
        rows: r.byApplication.map((a) => ({ ...a, pct: a.count ? a.done / a.count : 0 })),
      },
      {
        name: "Workload", title: "Workload by person", subtitle: "Open now, and completed in the period",
        columns: [
          { header: "Name", key: "name", width: 24 }, { header: "User", key: "username", width: 16 }, { header: "Employee ID", key: "employeeCode", width: 13 },
          { header: "Open", key: "open", type: "number" }, { header: "Overdue", key: "overdue", type: "number" }, { header: "Completed", key: "completed", type: "number" },
        ],
        rows: r.workload,
      },
    ]);
    return fileResponse(bytes, fileName(`report-${scope}`, fmt), fmt);
  }

  const pdf = await PdfReport.create({ title: "Team performance report", subtitle: `${scope} · ${period}`, org: ORG(), generatedBy: user.displayName });
  pdf.stats([
    { label: "Logged", value: String(k.created) },
    { label: "Completed", value: String(k.completed), color: "#027a48" },
    { label: "Open now", value: String(k.open) },
    { label: "Overdue now", value: String(k.overdue), color: k.overdue ? "#d03b3b" : undefined },
    { label: "On-time rate", value: k.onTimeRate === null ? "—" : `${k.onTimeRate}%` },
    { label: "Avg. resolution", value: k.avgResolutionDays === null ? "—" : `${k.avgResolutionDays} days` },
    { label: "Teams", value: String(r.teams.length) },
    { label: "People with work", value: String(r.workload.length) },
  ]);

  pdf.heading("Team progress");
  pdf.paragraph("Tasks logged in the period, split by where they stand now.", 9);
  const phases = (["open", "active", "review", "done"] as const).map((key) => ({ key, label: PHASE_META[key].label, color: PHASE_META[key].color }));
  pdf.stackedBars(phases, r.teamProgress.map((t) => ({ label: t.team, values: { open: t.open, active: t.active, review: t.review, done: t.done } })));
  pdf.table(
    [{ header: "Team", width: 2.2 }, ...phases.map((ph) => ({ header: ph.label, width: 1, align: "right" as const })), { header: "Total", width: 0.8, align: "right" }, { header: "Completion", width: 1, align: "right" }],
    r.teamProgress.map((t) => [t.team, String(t.open), String(t.active), String(t.review), String(t.done), String(t.total), `${t.completion}%`]),
  );

  pdf.heading("Workload by person");
  pdf.table(
    [{ header: "Name", width: 2.2 }, { header: "User", width: 1.4 }, { header: "Open", width: 0.8, align: "right" }, { header: "Overdue", width: 0.8, align: "right" }, { header: "Completed", width: 0.9, align: "right" }],
    r.workload.map((w) => [w.name, w.username, String(w.open), w.overdue ? { text: String(w.overdue), color: "#d03b3b", bold: true } : "0", String(w.completed)]),
    { empty: "No assigned work in this period." },
  );

  pdf.heading("By application");
  pdf.table(
    [{ header: "Application", width: 2 }, { header: "Logged", width: 1, align: "right" }, { header: "Done", width: 1, align: "right" }, { header: "Done %", width: 1, align: "right" }],
    r.byApplication.map((a) => [a.name, String(a.count), String(a.done), `${pct(a.done, a.count)}%`]),
  );

  pdf.heading("Where tasks stand");
  pdf.table([{ header: "Status", width: 2 }, { header: "Tasks", width: 1, align: "right" }], r.statusCounts.map((s) => [s.label, String(s.count)]));

  pdf.heading(`Logged vs completed (per ${r.trendUnit})`);
  pdf.table(
    [{ header: r.trendUnit === "day" ? "Day" : "Week of", width: 1.5 }, { header: "Logged", width: 1, align: "right" }, { header: "Completed", width: 1, align: "right" }],
    r.trend.filter((t) => t.created || t.completed).map((t) => [t.label, String(t.created), String(t.completed)]),
    { empty: "No activity in this period." },
  );
  return fileResponse(await pdf.save(), fileName(`report-${scope}`, fmt), fmt);
}
