import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { TriangleAlert, CircleCheck, ClipboardList, FlaskConical, Inbox, UserX } from "lucide-react";
import { can, requireUser, scopeLevel } from "@/lib/auth";
import { getMyStats, getReport, getScopeSummary, parseRange } from "@/lib/queries";
import { Card, CardHeader, EmptyState, PageHeader, StatCard, Avatar, ProgressBar } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { StatusBadge, PriorityBadge, DueLabel } from "@/components/tasks/badges";
import { TeamProgressChart } from "@/components/charts/charts";
import { STATUS_META, taskCode } from "@/lib/workflow";
import { fromNow } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const supervisor = can(user, "report.view") && (scopeLevel(user) !== "team" || user.leadTeamIds.length > 0);
  const [mine, summary, report] = await Promise.all([
    getMyStats(user),
    supervisor ? getScopeSummary(user) : null,
    supervisor ? getReport(user, parseRange({ range: "30d" })) : null,
  ]);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const scopeLabel = scopeLevel(user) === "all" ? "all departments" : scopeLevel(user) === "department" ? user.departmentName ?? "your department" : "your teams";

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user.displayName.split(" ")[0]}`}
        description={`${format(new Date(), "EEEE, d MMMM yyyy")} · ${user.role.name}${user.teams.length ? ` · ${user.teams.map((t) => t.name).join(", ")}` : ""}`}
        actions={<LinkButton href="/tasks/new">Log a new task</LinkButton>}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="My open tasks" value={mine.open} icon={ClipboardList} tone="blue" href="/tasks?view=mine" />
        <StatCard label="Overdue" value={mine.overdue} icon={TriangleAlert} tone={mine.overdue ? "red" : "zinc"} hint={mine.overdue ? "Past their due date" : "Nothing overdue"} href="/tasks?view=mine&due=overdue" />
        <StatCard label="In testing / UAT" value={mine.inReview} icon={FlaskConical} tone="violet" href="/tasks?view=mine&phase=review" />
        <StatCard label="Completed (30 days)" value={mine.doneMonth} icon={CircleCheck} tone="brand" href="/progress" />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="My work queue" description="Open tasks assigned to you, nearest deadline first" action={<Link href="/tasks?view=mine" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>} />
          {mine.recent.length === 0 ? (
            <EmptyState icon={Inbox} title="No open tasks" description="When work is assigned to you it will show up here." />
          ) : (
            <ul className="divide-y divide-zinc-100">
              {mine.recent.map((t) => (
                <li key={t.id}>
                  <Link href={`/tasks/${t.id}`} className="flex flex-col gap-2 px-5 py-3.5 hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-zinc-400">{taskCode(t.number)}</span>
                        <PriorityBadge priority={t.priority} compact />
                        {t.application && (
                          <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                            <span className="size-2 rounded-full" style={{ background: t.application.color }} />
                            {t.application.name}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-sm font-medium text-zinc-900">{t.title}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="hidden w-24 sm:block"><ProgressBar value={t.progress} /></div>
                      <StatusBadge status={t.status} />
                      <DueLabel dueDate={t.dueDate} status={t.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="My teams" description="Teams you belong to" />
          {user.teams.length === 0 ? (
            <EmptyState title="Not in a team yet" description="Your HOD can add you to a team." />
          ) : (
            <ul className="divide-y divide-zinc-100">
              {user.teams.map((t) => (
                <li key={t.id}>
                  <Link href={`/teams/${t.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-zinc-50">
                    <span className="text-sm font-medium">{t.name}</span>
                    <span className="text-xs text-zinc-500">{t.isLead ? "Team lead" : "Member"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {supervisor && summary && report && (
        <>
          <h2 className="mb-4 mt-10 text-base font-semibold text-zinc-900">Overview — {scopeLabel}</h2>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Open" value={summary.open} href="/tasks?view=scope&phase=open_all" />
            <StatCard label="Testing & UAT" value={summary.review} href="/tasks?view=scope&phase=review" />
            <StatCard label="Done (all time)" value={summary.done} />
            <StatCard label="Overdue" value={summary.overdue} tone={summary.overdue ? "red" : "zinc"} icon={TriangleAlert} href="/tasks?view=scope&due=overdue" />
            <StatCard label="Unassigned" value={summary.unassigned} tone={summary.unassigned ? "amber" : "zinc"} icon={UserX} href="/tasks?view=scope&assignee=none" />
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader
                title="Team progress — last 30 days"
                description="Tasks logged in the period, by where they stand now"
                action={<Link href="/reports" className="text-sm font-medium text-brand-700 hover:underline">Full report</Link>}
              />
              <div className="p-5">
                {report.teamProgress.length ? <TeamProgressChart data={report.teamProgress} /> : <EmptyState title="No teams yet" />}
              </div>
            </Card>
            <Card className="xl:col-span-2">
              <CardHeader title="Recent activity" />
              <ul className="divide-y divide-zinc-100">
                {summary.recentActivity.map((a) => {
                  const who = a.actor.employee?.name ?? a.actor.username;
                  return (
                    <li key={a.id} className="flex gap-3 px-5 py-3">
                      <Avatar name={who} size="sm" className="mt-0.5" />
                      <div className="min-w-0 text-sm">
                        <p className="text-zinc-700">
                          <span className="font-medium text-zinc-900">{who}</span>{" "}
                          {a.type === "CREATED" ? "logged" : a.type === "ASSIGNED" ? "assigned" : `moved to ${a.toStatus ? STATUS_META[a.toStatus].label : "—"}`}{" "}
                          <Link href={`/tasks/${a.task.id}`} className="font-medium text-zinc-900 hover:underline">{taskCode(a.task.number)}</Link>
                        </p>
                        <p className="truncate text-xs text-zinc-500">{a.task.title} · {fromNow(a.createdAt)}</p>
                      </div>
                    </li>
                  );
                })}
                {summary.recentActivity.length === 0 && <li className="px-5 py-8 text-center text-sm text-zinc-500">No activity yet.</li>}
              </ul>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
