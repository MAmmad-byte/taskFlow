import Link from "next/link";
import { ExportMenu } from "@/components/ui/export-menu";
import type { Metadata } from "next";
import { TriangleAlert, CircleCheck, Clock4, Inbox, Target, TimerReset } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeLevel, teamScope } from "@/lib/auth";
import { getReport, parseRange } from "@/lib/queries";
import { Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { RangePicker, TeamSelect } from "@/components/charts/range-picker";
import { TeamProgressChart, TrendChart } from "@/components/charts/charts";
import { PHASE_META } from "@/lib/workflow";
import { fmtDate, pct, sp, toDateInput } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("report.view");
  const params = await searchParams;
  const range = parseRange({ range: sp(params.range), from: sp(params.from), to: sp(params.to) });
  const teamId = sp(params.team) || undefined;

  const [report, allTeams] = await Promise.all([
    getReport(user, range, teamId),
    db.team.findMany({ where: teamScope(user), orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const { kpis } = report;
  const scope = scopeLevel(user) === "all" ? "All departments" : scopeLevel(user) === "department" ? user.departmentName ?? "Department" : "Your teams";
  const teamHref = (id: string) => {
    const qs = new URLSearchParams(range.key === "custom" ? { from: toDateInput(range.from), to: toDateInput(range.to) } : { range: range.key });
    qs.set("team", id);
    return `/reports?${qs.toString()}`;
  };
  const maxStatus = Math.max(1, ...report.statusCounts.map((s) => s.count));
  const maxApp = Math.max(1, ...report.byApplication.map((a) => a.count));

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${scope} · ${fmtDate(range.from)} – ${fmtDate(range.to)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
          <RangePicker
            from={toDateInput(range.from)}
            to={toDateInput(range.to)}
            active={range.key}
            extra={<TeamSelect teams={allTeams} value={teamId} />}
          />
          <ExportMenu base="/api/export/report" params={params} />
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Logged" value={kpis.created} icon={Inbox} tone="blue" hint="New tasks in period" />
        <StatCard label="Completed" value={kpis.completed} icon={CircleCheck} tone="brand" hint="Finished in period" />
        <StatCard label="Open now" value={kpis.open} icon={Clock4} />
        <StatCard label="Overdue now" value={kpis.overdue} icon={TriangleAlert} tone={kpis.overdue ? "red" : "zinc"} />
        <StatCard label="On-time rate" value={kpis.onTimeRate === null ? "—" : `${kpis.onTimeRate}%`} icon={Target} tone="violet" hint="Completed by due date" />
        <StatCard label="Avg. resolution" value={kpis.avgResolutionDays === null ? "—" : `${kpis.avgResolutionDays}d`} icon={TimerReset} tone="amber" hint="Logged → completed" />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Team progress" description="Tasks logged in the period, split by where they stand now" />
          <div className="p-5">
            {report.teamProgress.some((t) => t.total > 0) ? (
              <>
                <TeamProgressChart data={report.teamProgress} />
                <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                  {report.teamProgress.map((t) => (
                    <li key={t.teamId} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm">
                      <Link href={teamHref(t.teamId)} className="font-medium hover:underline">{t.team}</Link>
                      <span className="tabular-nums text-zinc-600">{t.completion}% complete</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : <EmptyState title="No tasks in this period" description="Pick a wider date range." />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Logged vs completed" description="Is the team keeping up with incoming work?" />
          <div className="p-5"><TrendChart data={report.trend} unit={report.trendUnit} /></div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Where tasks stand" description="Current status of tasks logged in the period" />
          <ul className="space-y-2.5 p-5">
            {report.statusCounts.map((s) => (
              <li key={s.status}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-zinc-700">{s.label}</span>
                  <span className="tabular-nums text-zinc-500">{s.count}</span>
                </div>
                <div className="h-2 rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(s.count / maxStatus) * 100}%`, background: s.phase === "cancelled" ? "#a1a1aa" : PHASE_META[s.phase].color }}
                  />
                </div>
              </li>
            ))}
            {report.statusCounts.length === 0 && <li className="text-sm text-zinc-500">No data.</li>}
          </ul>
        </Card>

        <Card>
          <CardHeader title="By application" description="Volume and completion per system" />
          <ul className="space-y-3 p-5">
            {report.byApplication.map((a) => (
              <li key={a.name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-zinc-700"><span className="size-2.5 rounded-sm" style={{ background: a.color }} />{a.name}</span>
                  <span className="tabular-nums text-zinc-500">{a.done}/{a.count} · {pct(a.done, a.count)}%</span>
                </div>
                <div className="h-2 rounded-full bg-zinc-100">
                  <div className="h-full rounded-full bg-zinc-800" style={{ width: `${(a.count / maxApp) * 100}%` }} />
                </div>
              </li>
            ))}
            {report.byApplication.length === 0 && <li className="text-sm text-zinc-500">No data.</li>}
          </ul>
        </Card>

        <Card className="xl:row-span-1">
          <CardHeader title="Workload by person" description="Open now and completed in the period" />
          {report.workload.length === 0 ? <EmptyState title="No assigned work" /> : (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="table-base">
                <thead><tr><th>Person</th><th className="text-right">Open</th><th className="text-right">Overdue</th><th className="text-right">Done</th></tr></thead>
                <tbody>
                  {report.workload.map((w) => (
                    <tr key={w.userId}>
                      <td>
                        {can(user, "progress.employee") && w.employeeCode ? (
                          <Link href={`/progress?employee=${encodeURIComponent(w.employeeCode)}`} className="font-medium hover:underline">{w.name}</Link>
                        ) : <span className="font-medium">{w.name}</span>}
                        <p className="text-xs text-zinc-500">@{w.username}</p>
                      </td>
                      <td className="text-right tabular-nums">{w.open}</td>
                      <td className={`text-right tabular-nums ${w.overdue ? "font-medium text-red-600" : "text-zinc-400"}`}>{w.overdue}</td>
                      <td className="text-right tabular-nums">{w.completed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
