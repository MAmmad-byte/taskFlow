import Link from "next/link";
import { ExportMenu } from "@/components/ui/export-menu";
import type { Metadata } from "next";
import { TriangleAlert, Activity, CircleCheck, ClipboardList, Search, Target, UserSearch } from "lucide-react";
import { db } from "@/lib/db";
import { can, employeeScope, requireUser } from "@/lib/auth";
import { getEmployeeProgress, getUserProgress, parseRange } from "@/lib/queries";
import { Avatar, Badge, Card, CardHeader, EmptyState, PageHeader, ProgressBar, StatCard } from "@/components/ui/misc";
import { RangePicker } from "@/components/charts/range-picker";
import { CompletedBars } from "@/components/charts/charts";
import { DueLabel, PriorityBadge, StatusBadge } from "@/components/tasks/badges";
import { taskCode } from "@/lib/workflow";
import { fmtDate, sp, toDateInput } from "@/lib/utils";

export const metadata: Metadata = { title: "Progress" };

type OpenTask = Awaited<ReturnType<typeof getUserProgress>>["open"][number];
type DoneTask = Awaited<ReturnType<typeof getUserProgress>>["completed"][number];

export default async function ProgressPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const range = parseRange({ range: sp(params.range), from: sp(params.from), to: sp(params.to) });
  const lookup = can(user, "progress.employee");
  const code = lookup ? sp(params.employee)?.trim() : undefined;

  let header: React.ReactNode;
  let data: { open: OpenTask[]; completed: DoneTask[]; trend: { label: string; completed: number }[]; overdue: number; onTimeRate: number | null; activityCount: number } | null = null;
  let notFoundCode: string | null = null;

  if (code) {
    const emp = await db.employee.findFirst({
      where: { AND: [employeeScope(user), { OR: [{ employeeCode: { equals: code, mode: "insensitive" } }, { email: { equals: code, mode: "insensitive" } }] }] },
      select: { id: true },
    });
    const p = emp ? await getEmployeeProgress(emp.id, range) : null;
    if (!p) notFoundCode = code;
    else {
      data = p;
      const e = p.employee;
      header = (
        <Card className="mb-6 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar name={e.name} size="lg" />
              <div>
                <p className="text-lg font-semibold">{e.name}</p>
                <p className="text-sm text-zinc-500">{e.employeeCode} · {e.designation ?? "—"} · {e.department.name}</p>
                <p className="text-xs text-zinc-500">{e.email}{e.phone ? ` · ${e.phone}` : ""}</p>
              </div>
            </div>
            <div className="text-sm">
              {e.user ? (
                <p>Current seat: <Link href={`/users/${e.user.id}`} className="font-medium text-brand-700 hover:underline">@{e.user.username}</Link> <span className="text-zinc-500">({e.user.role.name})</span></p>
              ) : <Badge tone="orange">No user seat</Badge>}
              {e.assignments.length > 0 && (
                <p className="mt-1 text-xs text-zinc-500">
                  Seats held: {e.assignments.map((a) => `@${a.user.username} (${fmtDate(a.assignedAt, "MMM yyyy")}${a.releasedAt ? `–${fmtDate(a.releasedAt, "MMM yyyy")}` : "–now"})`).join(", ")}
                </p>
              )}
            </div>
          </div>
        </Card>
      );
    }
  } else {
    data = await getUserProgress(user.id, range);
  }

  return (
    <>
      <PageHeader
        title={code && data ? "Employee progress" : "My progress"}
        description={code && data ? "Work completed by this employee across every seat they've held" : `Your work as @${user.username}`}
        actions={
          <>
            <RangePicker from={toDateInput(range.from)} to={toDateInput(range.to)} active={range.key} />
            {(data || !code) && <ExportMenu base="/api/export/progress" params={params} />}
          </>
        }
      />

      {lookup && (
        <form className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-80">
            <UserSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <input name="employee" defaultValue={code ?? ""} placeholder="Employee ID or email, e.g. EMP-1003" className="input h-10 pl-9" />
          </div>
          {sp(params.range) && <input type="hidden" name="range" value={sp(params.range)} />}
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"><Search className="size-4" /> Look up</button>
          {code && <Link href="/progress" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 sm:ml-2">Back to my progress</Link>}
        </form>
      )}

      {notFoundCode && (
        <Card className="mb-6"><EmptyState icon={UserSearch} title={`No employee “${notFoundCode}” in your scope`} description="Check the Employee ID. HODs can look up employees of their own department." /></Card>
      )}

      {header}

      {data && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Open now" value={data.open.length} icon={ClipboardList} tone="blue" />
            <StatCard label="Overdue" value={data.overdue} icon={TriangleAlert} tone={data.overdue ? "red" : "zinc"} />
            <StatCard label="Completed" value={data.completed.length} icon={CircleCheck} tone="brand" hint="In selected period" />
            <StatCard label="On-time rate" value={data.onTimeRate === null ? "—" : `${data.onTimeRate}%`} icon={Target} tone="violet" />
            <StatCard label="Updates made" value={data.activityCount} icon={Activity} hint="Status changes & notes" />
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader title="Completed over time" description={`${fmtDate(range.from)} – ${fmtDate(range.to)}`} />
              <div className="p-5"><CompletedBars data={data.trend} /></div>
            </Card>
            <Card className="xl:col-span-2">
              <CardHeader title="Open tasks" />
              {data.open.length === 0 ? <EmptyState title="Nothing open" /> : (
                <ul className="max-h-80 divide-y divide-zinc-100 overflow-y-auto">
                  {data.open.map((t) => (
                    <li key={t.id}>
                      <Link href={`/tasks/${t.id}`} className="block px-5 py-3 hover:bg-zinc-50">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2"><span className="font-mono text-xs text-zinc-400">{taskCode(t.number)}</span><PriorityBadge priority={t.priority} compact /></span>
                          <StatusBadge status={t.status} />
                        </div>
                        <p className="mt-0.5 truncate text-sm font-medium">{t.title}</p>
                        <div className="mt-1.5 flex items-center gap-3">
                          <ProgressBar value={t.progress} className="flex-1" />
                          <DueLabel dueDate={t.dueDate} status={t.status} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="mt-6 overflow-hidden">
            <CardHeader title="Completed in this period" />
            {data.completed.length === 0 ? <EmptyState title="No completed tasks in this period" /> : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead><tr><th>Task</th><th>Team</th><th>Logged</th><th>Completed</th><th>Due</th><th>On time</th></tr></thead>
                  <tbody>
                    {data.completed.map((t) => {
                      const onTime = t.dueDate ? t.completedAt! <= new Date(new Date(t.dueDate).setHours(23, 59, 59, 999)) : null;
                      return (
                        <tr key={t.id}>
                          <td><Link href={`/tasks/${t.id}`} className="hover:underline"><span className="mr-2 font-mono text-xs text-zinc-400">{taskCode(t.number)}</span>{t.title}</Link></td>
                          <td className="text-zinc-600">{t.team.name}</td>
                          <td className="whitespace-nowrap text-zinc-600">{fmtDate(t.createdAt)}</td>
                          <td className="whitespace-nowrap">{fmtDate(t.completedAt)}</td>
                          <td className="whitespace-nowrap text-zinc-600">{fmtDate(t.dueDate)}</td>
                          <td>{onTime === null ? <span className="text-zinc-400">—</span> : onTime ? <Badge tone="green">On time</Badge> : <Badge tone="red">Late</Badge>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
