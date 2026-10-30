import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma, TaskPriority, TaskStatus, TaskType } from "@prisma/client";
import { endOfDay, endOfWeek, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser, scopeLevel, taskScope, teamScope } from "@/lib/auth";
import { Card, EmptyState, PageHeader, Avatar, ProgressBar } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { TaskFilters } from "@/components/tasks/task-filters";
import { DueLabel, PriorityBadge, StatusBadge } from "@/components/tasks/badges";
import {
  OPEN_STATUSES, PRIORITY_META, STATUS_META, STATUS_ORDER, TYPE_META, taskCode, type Phase,
} from "@/lib/workflow";
import { fmtDate, sp } from "@/lib/utils";

export const metadata: Metadata = { title: "Tasks" };
const PAGE_SIZE = 25;

type SP = Record<string, string | string[] | undefined>;

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const raw = await searchParams;
  const p = (k: string) => sp(raw[k]);

  const supervisor = scopeLevel(user) !== "team" || user.leadTeamIds.length > 0;
  const views = [
    { value: "mine", label: "Assigned to me" },
    { value: "created", label: "Logged by me" },
    { value: "scope", label: scopeLevel(user) === "all" ? "All tasks" : scopeLevel(user) === "department" ? "Department" : supervisor ? "My teams" : "Team" },
  ];
  const view = p("view") ?? (supervisor ? "scope" : "mine");

  // ── build the where clause ──
  const and: Prisma.TaskWhereInput[] = [taskScope(user)];
  if (view === "mine") and.push({ assigneeId: user.id });
  if (view === "created") and.push({ createdById: user.id });

  const status = p("status");
  if (status && STATUS_ORDER.includes(status as TaskStatus)) and.push({ status: status as TaskStatus });
  const phase = p("phase");
  if (phase === "open_all") and.push({ status: { in: OPEN_STATUSES } });
  else if (phase) {
    const list = STATUS_ORDER.filter((s) => STATUS_META[s].phase === (phase as Phase));
    if (list.length) and.push({ status: { in: list } });
  }
  if (p("team")) and.push({ teamId: p("team") });
  if (p("app")) and.push({ applicationId: p("app") });
  if (p("priority") && p("priority")! in PRIORITY_META) and.push({ priority: p("priority") as TaskPriority });
  if (p("type") && p("type")! in TYPE_META) and.push({ type: p("type") as TaskType });
  if (p("assignee") === "none") and.push({ assigneeId: null });
  else if (p("assignee")) and.push({ assigneeId: p("assignee") });

  const now = new Date();
  const due = p("due");
  if (due === "overdue") and.push({ status: { in: OPEN_STATUSES }, dueDate: { lt: now } });
  if (due === "attention") and.push({ status: { in: OPEN_STATUSES }, dueDate: { lt: new Date(now.getTime() + 48 * 3600_000) } });
  if (due === "week") and.push({ status: { in: OPEN_STATUSES }, dueDate: { gte: startOfDay(now), lte: endOfWeek(now, { weekStartsOn: 1 }) } });
  if (due === "none") and.push({ dueDate: null });

  const from = p("from"), to = p("to");
  if (from || to) {
    and.push({
      createdAt: {
        ...(from && !Number.isNaN(Date.parse(from)) ? { gte: startOfDay(new Date(from)) } : {}),
        ...(to && !Number.isNaN(Date.parse(to)) ? { lte: endOfDay(new Date(to)) } : {}),
      },
    });
  }

  const q = p("q")?.trim();
  if (q) {
    const num = Number(q.replace(/^tsk-?/i, ""));
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { requesterName: { contains: q, mode: "insensitive" } },
        { requesterOffice: { contains: q, mode: "insensitive" } },
        ...(Number.isInteger(num) && num > 0 ? [{ number: num }] : []),
      ],
    });
  }

  const where: Prisma.TaskWhereInput = { AND: and };
  const page = Math.max(1, Number(p("page") ?? 1) || 1);

  const [tasks, total, teams, apps, assignees] = await Promise.all([
    db.task.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        team: { select: { name: true } },
        application: { select: { name: true, color: true } },
        assignee: { select: { username: true, displayTitle: true, employee: { select: { name: true } } } },
      },
    }),
    db.task.count({ where }),
    db.team.findMany({ where: teamScope(user), orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.application.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({
      where: { isActive: true, memberships: { some: { team: teamScope(user) } } },
      orderBy: { username: "asc" },
      select: { id: true, username: true, employee: { select: { name: true } } },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (n: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(raw)) if (typeof v === "string" && k !== "page") qs.set(k, v);
    qs.set("page", String(n));
    return `/tasks?${qs.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Every request and complaint, from logging to sign-off."
        actions={<LinkButton href="/tasks/new">New task</LinkButton>}
      />

      <TaskFilters
        views={views}
        currentView={view}
        teams={teams.map((t) => ({ value: t.id, label: t.name }))}
        apps={apps.map((a) => ({ value: a.id, label: a.name }))}
        assignees={assignees.map((u) => ({ value: u.id, label: u.employee?.name ? `${u.employee.name} (${u.username})` : u.username }))}
        statuses={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label }))}
        priorities={Object.entries(PRIORITY_META).map(([k, v]) => ({ value: k, label: v.label }))}
        types={Object.entries(TYPE_META).map(([k, v]) => ({ value: k, label: v.label }))}
      />

      <Card className="mt-4 overflow-hidden">
        {tasks.length === 0 ? (
          <EmptyState icon={Inbox} title="No tasks match" description="Try a different view or clear some filters." action={<LinkButton href="/tasks/new" variant="outline">Log a task</LinkButton>} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="w-[38%]">Task</th>
                    <th>Status</th>
                    <th>Assignee</th>
                    <th>Team</th>
                    <th>Due</th>
                    <th className="w-28">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => {
                    const who = t.assignee ? t.assignee.employee?.name ?? t.assignee.displayTitle ?? t.assignee.username : null;
                    return (
                      <tr key={t.id} className="relative">
                        <td>
                          <Link href={`/tasks/${t.id}`} className="block after:absolute after:inset-0">
                            <div className="flex items-center gap-2 text-xs text-zinc-400">
                              <span className="font-mono">{taskCode(t.number)}</span>
                              <span>·</span>
                              <span>{TYPE_META[t.type].label}</span>
                              {t.application && (
                                <>
                                  <span>·</span>
                                  <span className="inline-flex items-center gap-1">
                                    <span className="size-1.5 rounded-full" style={{ background: t.application.color }} />
                                    {t.application.name}
                                  </span>
                                </>
                              )}
                            </div>
                            <p className="mt-0.5 line-clamp-1 font-medium text-zinc-900">{t.title}</p>
                          </Link>
                        </td>
                        <td>
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge status={t.status} />
                            <PriorityBadge priority={t.priority} />
                          </div>
                        </td>
                        <td>
                          {who ? (
                            <span className="flex items-center gap-2">
                              <Avatar name={who} size="sm" />
                              <span className="max-w-36 truncate text-zinc-700">{who}</span>
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-amber-700">Unassigned</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap text-zinc-600">{t.team.name}</td>
                        <td className="whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-zinc-700">{fmtDate(t.dueDate)}</span>
                            {t.dueDate && <DueLabel dueDate={t.dueDate} status={t.status} />}
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <ProgressBar value={t.progress} />
                            <span className="w-8 text-right text-xs tabular-nums text-zinc-500">{t.progress}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-zinc-100 md:hidden">
              {tasks.map((t) => {
                const who = t.assignee ? t.assignee.employee?.name ?? t.assignee.username : "Unassigned";
                return (
                  <li key={t.id}>
                    <Link href={`/tasks/${t.id}`} className="block px-4 py-3.5 active:bg-zinc-50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-zinc-400">{taskCode(t.number)}</span>
                        <StatusBadge status={t.status} />
                      </div>
                      <p className="mt-1 font-medium text-zinc-900">{t.title}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                        <PriorityBadge priority={t.priority} />
                        <span>{who}</span>
                        <span>{t.team.name}</span>
                        <DueLabel dueDate={t.dueDate} status={t.status} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 text-sm text-zinc-500">
              <span>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-1">
                {page > 1 ? (
                  <Link href={pageHref(page - 1)} className="rounded-md p-1.5 hover:bg-zinc-100" aria-label="Previous page"><ChevronLeft className="size-4" /></Link>
                ) : <span className="p-1.5 opacity-30"><ChevronLeft className="size-4" /></span>}
                <span className="px-2 tabular-nums">{page} / {pages}</span>
                {page < pages ? (
                  <Link href={pageHref(page + 1)} className="rounded-md p-1.5 hover:bg-zinc-100" aria-label="Next page"><ChevronRight className="size-4" /></Link>
                ) : <span className="p-1.5 opacity-30"><ChevronRight className="size-4" /></span>}
              </div>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
