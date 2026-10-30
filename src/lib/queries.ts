import "server-only";
import {
  addDays, differenceInCalendarDays, eachDayOfInterval, eachWeekOfInterval, endOfDay, format,
  startOfDay, startOfWeek, subDays,
} from "date-fns";
import type { Prisma, TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { taskScope, teamScope, type AuthUser } from "@/lib/auth";
import { DONE_STATUSES, OPEN_STATUSES, STATUS_META, STATUS_ORDER, TERMINAL_STATUSES, type Phase } from "@/lib/workflow";

// ───────────────────────── Date range parsing ─────────────────────────

export type Range = { from: Date; to: Date; key: string };

export const RANGE_PRESETS = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "365d", label: "Last 12 months", days: 365 },
] as const;

export function parseRange(params: { range?: string; from?: string; to?: string }, fallback = "30d"): Range {
  if (params.from && params.to) {
    const from = startOfDay(new Date(params.from));
    const to = endOfDay(new Date(params.to));
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) {
      return { from, to, key: "custom" };
    }
  }
  const preset = RANGE_PRESETS.find((p) => p.key === (params.range ?? fallback)) ?? RANGE_PRESETS[1];
  const to = endOfDay(new Date());
  return { from: startOfDay(subDays(to, preset.days - 1)), to, key: preset.key };
}

// ───────────────────────── Deadline alerts ─────────────────────────

export async function getDeadlineAlerts(user: AuthUser) {
  const hours = Number(process.env.DEADLINE_WARNING_HOURS ?? 48) || 48;
  const now = new Date();
  const horizon = new Date(now.getTime() + hours * 3600_000);
  const or: Prisma.TaskWhereInput[] = [{ assigneeId: user.id }];
  if (user.leadTeamIds.length) or.push({ teamId: { in: user.leadTeamIds } });

  const tasks = await db.task.findMany({
    where: { OR: or, status: { in: OPEN_STATUSES }, dueDate: { not: null, lte: horizon } },
    select: {
      id: true, number: true, title: true, dueDate: true, status: true, priority: true, assigneeId: true,
      team: { select: { name: true } },
      assignee: { select: { username: true, employee: { select: { name: true } } } },
    },
    orderBy: { dueDate: "asc" },
    take: 50,
  });
  const todayEnd = endOfDay(now);
  return {
    hours,
    overdue: tasks.filter((t) => t.dueDate! < now),
    today: tasks.filter((t) => t.dueDate! >= now && t.dueDate! <= todayEnd),
    soon: tasks.filter((t) => t.dueDate! > todayEnd),
    mineCount: tasks.filter((t) => t.assigneeId === user.id).length,
  };
}

export type DeadlineAlerts = Awaited<ReturnType<typeof getDeadlineAlerts>>;

// ───────────────────────── Dashboard ─────────────────────────

export async function getMyStats(user: AuthUser) {
  const now = new Date();
  const monthAgo = subDays(now, 30);
  const [open, overdue, inReview, doneMonth, recent] = await Promise.all([
    db.task.count({ where: { assigneeId: user.id, status: { in: OPEN_STATUSES } } }),
    db.task.count({ where: { assigneeId: user.id, status: { in: OPEN_STATUSES }, dueDate: { lt: now } } }),
    db.task.count({ where: { assigneeId: user.id, status: { in: ["TESTING", "PENDING_UAT", "READY_FOR_DEPLOYMENT"] } } }),
    db.task.count({ where: { assigneeId: user.id, status: { in: DONE_STATUSES }, completedAt: { gte: monthAgo } } }),
    db.task.findMany({
      where: { assigneeId: user.id, status: { in: OPEN_STATUSES } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }],
      take: 6,
      include: { application: { select: { name: true, color: true } }, team: { select: { name: true } } },
    }),
  ]);
  return { open, overdue, inReview, doneMonth, recent };
}

export async function getScopeSummary(user: AuthUser) {
  const now = new Date();
  const scope = taskScope(user);
  const [byStatus, overdue, unassigned, recentActivity] = await Promise.all([
    db.task.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
    db.task.count({ where: { AND: [scope, { status: { in: OPEN_STATUSES }, dueDate: { lt: now } }] } }),
    db.task.count({ where: { AND: [scope, { status: { in: OPEN_STATUSES }, assigneeId: null }] } }),
    db.taskActivity.findMany({
      where: { task: scope, type: { in: ["STATUS_CHANGE", "ASSIGNED", "CREATED"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        task: { select: { id: true, number: true, title: true } },
        actor: { select: { username: true, employee: { select: { name: true } } } },
      },
    }),
  ]);
  const counts = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])) as Partial<Record<TaskStatus, number>>;
  const sum = (list: TaskStatus[]) => list.reduce((a, s) => a + (counts[s] ?? 0), 0);
  return {
    open: sum(OPEN_STATUSES),
    review: sum(["TESTING", "PENDING_UAT", "READY_FOR_DEPLOYMENT"]),
    done: sum(DONE_STATUSES),
    overdue,
    unassigned,
    recentActivity,
  };
}

// ───────────────────────── Reports ─────────────────────────

type ReportTask = {
  id: string; status: TaskStatus; teamId: string; assigneeId: string | null; applicationId: string | null;
  createdAt: Date; completedAt: Date | null; dueDate: Date | null;
};

function bucketer(range: Range) {
  const span = differenceInCalendarDays(range.to, range.from) + 1;
  if (span <= 62) {
    const days = eachDayOfInterval({ start: range.from, end: range.to });
    return {
      unit: "day" as const,
      buckets: days.map((d) => ({ key: format(d, "yyyy-MM-dd"), label: format(d, span <= 14 ? "EEE d" : "d MMM") })),
      keyOf: (d: Date) => format(d, "yyyy-MM-dd"),
    };
  }
  const weeks = eachWeekOfInterval({ start: range.from, end: range.to }, { weekStartsOn: 1 });
  return {
    unit: "week" as const,
    buckets: weeks.map((w) => ({ key: format(w, "yyyy-MM-dd"), label: format(w, "d MMM") })),
    keyOf: (d: Date) => format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd"),
  };
}

export async function getReport(user: AuthUser, range: Range, teamId?: string) {
  const teams = await db.team.findMany({
    where: { ...teamScope(user), ...(teamId ? { id: teamId } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, department: { select: { name: true } } },
  });
  const teamIds = teams.map((t) => t.id);
  const scope: Prisma.TaskWhereInput = { AND: [taskScope(user), { teamId: { in: teamIds } }] };

  const select = { id: true, status: true, teamId: true, assigneeId: true, applicationId: true, createdAt: true, completedAt: true, dueDate: true } as const;
  const [created, completed, openNow, apps] = await Promise.all([
    db.task.findMany({ where: { AND: [scope, { createdAt: { gte: range.from, lte: range.to } }] }, select }),
    db.task.findMany({ where: { AND: [scope, { completedAt: { gte: range.from, lte: range.to } }] }, select }),
    db.task.findMany({ where: { AND: [scope, { status: { in: OPEN_STATUSES } }] }, select }),
    db.application.findMany({ select: { id: true, name: true, color: true } }),
  ]);
  const now = new Date();

  // KPIs
  const onTime = completed.filter((t) => t.dueDate && t.completedAt && t.completedAt <= endOfDay(t.dueDate)).length;
  const withDue = completed.filter((t) => t.dueDate).length;
  const resolutionDays = completed
    .filter((t) => t.completedAt)
    .map((t) => (t.completedAt!.getTime() - t.createdAt.getTime()) / 86_400_000);
  const kpis = {
    created: created.length,
    completed: completed.length,
    open: openNow.length,
    overdue: openNow.filter((t) => t.dueDate && t.dueDate < now).length,
    onTimeRate: withDue ? Math.round((onTime / withDue) * 100) : null,
    avgResolutionDays: resolutionDays.length
      ? Math.round((resolutionDays.reduce((a, b) => a + b, 0) / resolutionDays.length) * 10) / 10
      : null,
  };

  // Team progress: tasks created in range, by current phase
  const phaseOf = (s: TaskStatus): Phase => STATUS_META[s].phase;
  const teamProgress = teams.map((team) => {
    const list = created.filter((t) => t.teamId === team.id);
    const row = { team: team.name, teamId: team.id, open: 0, active: 0, review: 0, done: 0, cancelled: 0, total: list.length };
    for (const t of list) row[phaseOf(t.status)]++;
    return { ...row, completion: row.total - row.cancelled > 0 ? Math.round((row.done / (row.total - row.cancelled)) * 100) : 0 };
  });

  // Trend: created vs completed
  const b = bucketer(range);
  const trendMap = new Map(b.buckets.map((x) => [x.key, { label: x.label, created: 0, completed: 0 }]));
  for (const t of created) {
    const row = trendMap.get(b.keyOf(t.createdAt));
    if (row) row.created++;
  }
  for (const t of completed) {
    const row = trendMap.get(b.keyOf(t.completedAt!));
    if (row) row.completed++;
  }
  const trend = [...trendMap.values()];

  // Status distribution (tasks created in range)
  const statusCounts = STATUS_ORDER.map((s) => ({
    status: s, label: STATUS_META[s].label, phase: STATUS_META[s].phase,
    count: created.filter((t) => t.status === s).length,
  })).filter((r) => r.count > 0);

  // By application
  const appMap = new Map<string, { name: string; color: string }>(apps.map((a) => [a.id, a]));
  const byAppMap = new Map<string, { name: string; color: string; count: number; done: number }>();
  for (const t of created) {
    const key = t.applicationId ?? "none";
    const a = t.applicationId ? appMap.get(t.applicationId) : undefined;
    const row = byAppMap.get(key) ?? { name: a?.name ?? "Unspecified", color: a?.color ?? "#9ca3af", count: 0, done: 0 };
    row.count++;
    if (DONE_STATUSES.includes(t.status)) row.done++;
    byAppMap.set(key, row);
  }
  const byApplication = [...byAppMap.values()].sort((a, b2) => b2.count - a.count);

  // Workload per assignee (open now, completed in range)
  const assigneeIds = [...new Set([...openNow, ...completed].map((t) => t.assigneeId).filter((x): x is string => !!x))];
  const users = await db.user.findMany({
    where: { id: { in: assigneeIds } },
    select: { id: true, username: true, displayTitle: true, employee: { select: { name: true, employeeCode: true } } },
  });
  const workload = users
    .map((u) => {
      const open = openNow.filter((t) => t.assigneeId === u.id);
      return {
        userId: u.id,
        name: u.employee?.name ?? u.displayTitle ?? u.username,
        username: u.username,
        employeeCode: u.employee?.employeeCode ?? null,
        open: open.length,
        overdue: open.filter((t) => t.dueDate && t.dueDate < now).length,
        completed: completed.filter((t) => t.assigneeId === u.id).length,
      };
    })
    .sort((a, b2) => b2.open + b2.completed - (a.open + a.completed));

  return { teams, kpis, teamProgress, trend, trendUnit: b.unit, statusCounts, byApplication, workload };
}

export type ReportData = Awaited<ReturnType<typeof getReport>>;

// ───────────────────────── Personal & employee progress ─────────────────────────

async function progressFor(where: { assigneeId?: string; employeeId?: string }, range: Range) {
  const now = new Date();
  const completedWhere: Prisma.TaskWhereInput = where.employeeId
    ? { completedByEmployeeId: where.employeeId }
    : { assigneeId: where.assigneeId, status: { in: DONE_STATUSES } };

  const [completed, activityCount] = await Promise.all([
    db.task.findMany({
      where: { ...completedWhere, completedAt: { gte: range.from, lte: range.to } },
      select: { id: true, number: true, title: true, completedAt: true, dueDate: true, createdAt: true, status: true, team: { select: { name: true } } },
      orderBy: { completedAt: "desc" },
    }),
    where.employeeId
      ? db.taskActivity.count({ where: { actorEmployeeId: where.employeeId, createdAt: { gte: range.from, lte: range.to } } })
      : db.taskActivity.count({ where: { actorUserId: where.assigneeId, createdAt: { gte: range.from, lte: range.to } } }),
  ]);

  const b = bucketer(range);
  const trendMap = new Map(b.buckets.map((x) => [x.key, { label: x.label, completed: 0 }]));
  for (const t of completed) {
    const row = trendMap.get(b.keyOf(t.completedAt!));
    if (row) row.completed++;
  }
  const withDue = completed.filter((t) => t.dueDate);
  const onTime = withDue.filter((t) => t.completedAt! <= endOfDay(t.dueDate!)).length;
  return {
    completed,
    activityCount,
    trend: [...trendMap.values()],
    onTimeRate: withDue.length ? Math.round((onTime / withDue.length) * 100) : null,
    now,
  };
}

export async function getUserProgress(userId: string, range: Range) {
  const now = new Date();
  const [base, open] = await Promise.all([
    progressFor({ assigneeId: userId }, range),
    db.task.findMany({
      where: { assigneeId: userId, status: { notIn: TERMINAL_STATUSES } },
      select: { id: true, number: true, title: true, status: true, dueDate: true, priority: true, progress: true, team: { select: { name: true } } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
    }),
  ]);
  return { ...base, open, overdue: open.filter((t) => t.dueDate && t.dueDate < now).length };
}

export async function getEmployeeProgress(employeeId: string, range: Range) {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    include: {
      department: { select: { name: true } },
      user: { select: { id: true, username: true, role: { select: { name: true } } } },
      assignments: {
        orderBy: { assignedAt: "desc" },
        include: { user: { select: { username: true } }, assignedBy: { select: { username: true } } },
      },
    },
  });
  if (!employee) return null;
  const base = await progressFor({ employeeId }, range);
  const now = new Date();
  const open = employee.user
    ? await db.task.findMany({
        where: { assigneeId: employee.user.id, status: { notIn: TERMINAL_STATUSES } },
        select: { id: true, number: true, title: true, status: true, dueDate: true, priority: true, progress: true, team: { select: { name: true } } },
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      })
    : [];
  return { employee, ...base, open, overdue: open.filter((t) => t.dueDate && t.dueDate < now).length };
}

export function nextDays(n: number) {
  return addDays(new Date(), n);
}
