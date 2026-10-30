import "server-only";
import type { Prisma, TaskPriority, TaskStatus, TaskType } from "@prisma/client";
import { endOfDay, endOfWeek, startOfDay } from "date-fns";
import { scopeLevel, taskScope, type AuthUser } from "@/lib/auth";
import { OPEN_STATUSES, PRIORITY_META, STATUS_META, STATUS_ORDER, TYPE_META, type Phase } from "@/lib/workflow";

/**
 * Turns the task-list URL parameters into a Prisma where clause, always
 * combined with the user's data scope. Shared by the Tasks page and the
 * task export so an export contains exactly what's on screen (all pages).
 */
export function buildTaskQuery(user: AuthUser, get: (key: string) => string | undefined) {
  const supervisor = scopeLevel(user) !== "team" || user.leadTeamIds.length > 0;
  const view = get("view") ?? (supervisor ? "scope" : "mine");

  const and: Prisma.TaskWhereInput[] = [taskScope(user)];
  if (view === "mine") and.push({ assigneeId: user.id });
  if (view === "created") and.push({ createdById: user.id });

  const status = get("status");
  if (status && STATUS_ORDER.includes(status as TaskStatus)) and.push({ status: status as TaskStatus });
  const phase = get("phase");
  if (phase === "open_all") and.push({ status: { in: OPEN_STATUSES } });
  else if (phase) {
    const list = STATUS_ORDER.filter((s) => STATUS_META[s].phase === (phase as Phase));
    if (list.length) and.push({ status: { in: list } });
  }
  const team = get("team");
  if (team) and.push({ teamId: team });
  const app = get("app");
  if (app) and.push({ applicationId: app });
  const priority = get("priority");
  if (priority && priority in PRIORITY_META) and.push({ priority: priority as TaskPriority });
  const type = get("type");
  if (type && type in TYPE_META) and.push({ type: type as TaskType });
  const assignee = get("assignee");
  if (assignee === "none") and.push({ assigneeId: null });
  else if (assignee) and.push({ assigneeId: assignee });

  const now = new Date();
  const due = get("due");
  if (due === "overdue") and.push({ status: { in: OPEN_STATUSES }, dueDate: { lt: now } });
  if (due === "attention") and.push({ status: { in: OPEN_STATUSES }, dueDate: { lt: new Date(now.getTime() + 48 * 3600_000) } });
  if (due === "week") and.push({ status: { in: OPEN_STATUSES }, dueDate: { gte: startOfDay(now), lte: endOfWeek(now, { weekStartsOn: 1 }) } });
  if (due === "none") and.push({ dueDate: null });

  const from = get("from");
  const to = get("to");
  if (from || to) {
    and.push({
      createdAt: {
        ...(from && !Number.isNaN(Date.parse(from)) ? { gte: startOfDay(new Date(from)) } : {}),
        ...(to && !Number.isNaN(Date.parse(to)) ? { lte: endOfDay(new Date(to)) } : {}),
      },
    });
  }

  const q = get("q")?.trim();
  if (q) {
    const num = Number(q.replace(/^tsk-?/i, ""));
    const or: Prisma.TaskWhereInput[] = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { requesterName: { contains: q, mode: "insensitive" } },
      { requesterOffice: { contains: q, mode: "insensitive" } },
    ];
    if (Number.isInteger(num) && num > 0) or.push({ number: num });
    and.push({ OR: or });
  }

  return { where: { AND: and } as Prisma.TaskWhereInput, view, supervisor };
}

/** Human description of the active filters, for export headers. */
export function describeTaskFilters(get: (key: string) => string | undefined) {
  const parts: string[] = [];
  const view = get("view");
  if (view === "mine") parts.push("Assigned to me");
  if (view === "created") parts.push("Logged by me");
  const status = get("status");
  if (status && status in STATUS_META) parts.push(`Status: ${STATUS_META[status as TaskStatus].label}`);
  const phase = get("phase");
  if (phase) parts.push(`Stage: ${phase === "open_all" ? "All open" : phase}`);
  const due = get("due");
  if (due) parts.push(`Due: ${due}`);
  const priority = get("priority");
  if (priority && priority in PRIORITY_META) parts.push(`Priority: ${PRIORITY_META[priority as TaskPriority].label}`);
  const type = get("type");
  if (type && type in TYPE_META) parts.push(`Type: ${TYPE_META[type as TaskType].label}`);
  if (get("from") || get("to")) parts.push(`Logged ${get("from") ?? "…"} to ${get("to") ?? "…"}`);
  if (get("q")) parts.push(`Search: "${get("q")}"`);
  return parts.join(" · ");
}
