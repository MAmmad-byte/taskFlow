import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Prisma, Task } from "@prisma/client";
import { db } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session-token";
import type { PermissionKey } from "@/lib/permissions";
import { RESTRICTED_SOURCES, RESTRICTED_TARGETS } from "@/lib/workflow";
import type { TaskStatus } from "@prisma/client";

export type CurrentUser = Awaited<ReturnType<typeof loadUser>>;
export type ScopeLevel = "all" | "department" | "team";

async function loadUser(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      employee: true,
      department: true,
      memberships: { include: { team: { select: { id: true, name: true, departmentId: true, isActive: true } } } },
    },
  });
  if (!user || !user.isActive) return null;

  const permissions = new Set(user.role.permissions.map((rp) => rp.permission.key as PermissionKey));
  const departmentId = user.departmentId ?? user.employee?.departmentId ?? null;
  const activeMemberships = user.memberships.filter((m) => m.team.isActive);

  return {
    id: user.id,
    username: user.username,
    displayName: user.employee?.name ?? user.displayTitle ?? user.username,
    email: user.employee?.email ?? null,
    employee: user.employee,
    role: { id: user.role.id, key: user.role.key, name: user.role.name, level: user.role.level },
    departmentId,
    departmentName: user.department?.name ?? null,
    mustChangePassword: user.mustChangePassword,
    permissions,
    teamIds: activeMemberships.map((m) => m.teamId),
    leadTeamIds: activeMemberships.filter((m) => m.isLead).map((m) => m.teamId),
    teams: activeMemberships.map((m) => ({ id: m.team.id, name: m.team.name, isLead: m.isLead })),
  };
}

/** Current signed-in user (memoised per request), or null. */
export const getCurrentUser = cache(async () => {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return loadUser(session.sub);
});

export type AuthUser = NonNullable<CurrentUser>;

/** Use in pages/actions that require a signed-in user. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function can(user: AuthUser, perm: PermissionKey) {
  return user.permissions.has(perm);
}

export function canAny(user: AuthUser, perms: PermissionKey[]) {
  return perms.some((p) => user.permissions.has(p));
}

/** Use in pages that require a permission; shows the 403 page otherwise. */
export async function requirePermission(perm: PermissionKey | PermissionKey[]) {
  const user = await requireUser();
  const list = Array.isArray(perm) ? perm : [perm];
  if (!canAny(user, list)) redirect("/forbidden");
  return user;
}

export function scopeLevel(user: AuthUser): ScopeLevel {
  if (can(user, "task.view.all")) return "all";
  if (can(user, "task.view.department") && user.departmentId) return "department";
  return "team";
}

export function isAdmin(user: AuthUser) {
  return user.role.key === "ADMIN" || can(user, "task.view.all");
}

// ─────────────── Row-level scopes (Prisma where clauses) ───────────────

/** Tasks this user may see. */
export function taskScope(user: AuthUser): Prisma.TaskWhereInput {
  const level = scopeLevel(user);
  if (level === "all") return {};
  if (level === "department") return { team: { departmentId: user.departmentId! } };

  const or: Prisma.TaskWhereInput[] = [{ assigneeId: user.id }, { createdById: user.id }];
  if (user.leadTeamIds.length) or.push({ teamId: { in: user.leadTeamIds } });
  if (can(user, "task.view.team") && user.teamIds.length) or.push({ teamId: { in: user.teamIds } });
  return { OR: or };
}

/** Teams this user may see. */
export function teamScope(user: AuthUser): Prisma.TeamWhereInput {
  const level = scopeLevel(user);
  if (level === "all") return {};
  if (level === "department") return { departmentId: user.departmentId! };
  return { id: { in: user.teamIds } };
}

/** Teams the user can log tasks into / assign within. */
export function assignableTeamScope(user: AuthUser): Prisma.TeamWhereInput {
  return { ...teamScope(user), isActive: true };
}

/** Users the user may see in the user directory. */
export function userScope(user: AuthUser): Prisma.UserWhereInput {
  const level = scopeLevel(user);
  if (level === "all") return {};
  if (level === "department")
    return { OR: [{ departmentId: user.departmentId! }, { employee: { departmentId: user.departmentId! } }] };
  return { memberships: { some: { teamId: { in: user.teamIds } } } };
}

export function employeeScope(user: AuthUser): Prisma.EmployeeWhereInput {
  const level = scopeLevel(user);
  if (level === "all") return {};
  if (user.departmentId) return { departmentId: user.departmentId };
  return { id: "__none__" };
}

// ─────────────── Object-level checks ───────────────

type TeamRef = { id: string; departmentId: string };

/** Can the user manage (rename, members, lead) this team? */
export function canManageTeam(user: AuthUser, team: TeamRef, perm: PermissionKey = "team.manage") {
  if (!can(user, perm)) return false;
  const level = scopeLevel(user);
  if (level === "all") return true;
  if (level === "department") return team.departmentId === user.departmentId;
  return false;
}

/** Does the user have "supervisor" authority over a team (lead, HOD of dept, admin)? */
export function supervisesTeam(user: AuthUser, team: TeamRef) {
  const level = scopeLevel(user);
  if (level === "all") return true;
  if (level === "department" && team.departmentId === user.departmentId) return true;
  return user.leadTeamIds.includes(team.id);
}

type TaskRef = Pick<Task, "assigneeId" | "createdById" | "teamId" | "status"> & { team: TeamRef };

export function canViewTask(user: AuthUser, task: TaskRef) {
  if (supervisesTeam(user, task.team)) return true;
  if (task.assigneeId === user.id || task.createdById === user.id) return true;
  return can(user, "task.view.team") && user.teamIds.includes(task.teamId);
}

/** Which kind of status authority the user has on a task. */
export function statusAuthority(user: AuthUser, task: TaskRef): "full" | "own" | "none" {
  if (can(user, "task.status.team") && supervisesTeam(user, task.team)) return "full";
  if (can(user, "task.update.own") && task.assigneeId === user.id) return "own";
  return "none";
}

export function canMoveTo(user: AuthUser, task: TaskRef, target: TaskStatus) {
  const authority = statusAuthority(user, task);
  if (authority === "none") return false;
  const restricted = RESTRICTED_TARGETS.includes(target) || RESTRICTED_SOURCES.includes(task.status);
  if (restricted) return authority === "full" && can(user, "task.close");
  return true;
}

export function canEditTask(user: AuthUser, task: TaskRef) {
  if (can(user, "task.edit") && supervisesTeam(user, task.team)) return true;
  // creators may fix details of what they logged while it's still new
  return task.createdById === user.id && task.status === "NEW";
}

export function canAssignTask(user: AuthUser, task: TaskRef) {
  if (!can(user, "task.assign")) return false;
  if (supervisesTeam(user, task.team)) return true;
  // members may hand over tasks they own or logged, within their own team
  return user.teamIds.includes(task.teamId) && (task.assigneeId === user.id || task.createdById === user.id || !task.assigneeId);
}

export function canDeleteTask(user: AuthUser, task: TaskRef) {
  return can(user, "task.delete") && supervisesTeam(user, task.team);
}

/** Can the acting user manage a target user account (by department + role level)? */
export function canManageUser(
  actor: AuthUser,
  target: { departmentId: string | null; employee?: { departmentId: string } | null; role: { level: number } },
) {
  if (!can(actor, "user.manage")) return false;
  if (scopeLevel(actor) === "all") return true;
  const dept = target.departmentId ?? target.employee?.departmentId ?? null;
  return dept === actor.departmentId && target.role.level < actor.role.level;
}
