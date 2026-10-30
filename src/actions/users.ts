"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, canManageTeam, canManageUser, requireUser, scopeLevel, type AuthUser } from "@/lib/auth";
import { fail, formObject, success, zodFail, type ActionState } from "@/lib/action-result";
import { passwordResetSchema, seatAssignSchema, userCreateSchema, userUpdateSchema } from "@/lib/validators";
import { audit, notify } from "@/lib/audit";

async function checkRole(me: AuthUser, roleId: string) {
  const role = await db.role.findUnique({ where: { id: roleId } });
  if (!role) return { error: "Role not found." };
  if (scopeLevel(me) !== "all" && role.level >= me.role.level)
    return { error: "You can only give roles below your own." };
  return { role };
}

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireUser();
  if (!can(me, "user.manage")) return fail("You don't have permission to create users.");
  const parsed = userCreateSchema.safeParse(formObject(formData));
  if (!parsed.success) return zodFail(parsed.error);
  const d = parsed.data;

  const { error } = await checkRole(me, d.roleId);
  if (error) return fail(error, { roleId: error });

  const departmentId = scopeLevel(me) === "all" ? d.departmentId ?? null : me.departmentId;
  if (!departmentId) return fail("Choose a department.", { departmentId: "Required" });

  if (await db.user.findUnique({ where: { username: d.username } }))
    return fail("This username is taken.", { username: "Already taken" });

  if (d.employeeId) {
    const emp = await db.employee.findUnique({ where: { id: d.employeeId }, include: { user: true } });
    if (!emp) return fail("Employee not found.", { employeeId: "Not found" });
    if (emp.user) return fail(`${emp.name} is already on seat “${emp.user.username}”.`, { employeeId: "Already has a user" });
    if (scopeLevel(me) !== "all" && emp.departmentId !== me.departmentId)
      return fail("Employee belongs to another department.", { employeeId: "Other department" });
  }

  let team = null;
  if (d.teamId) {
    team = await db.team.findUnique({ where: { id: d.teamId } });
    if (!team || !canManageTeam(me, team, "team.members.manage")) return fail("You can't add users to that team.", { teamId: "Not allowed" });
  }

  const user = await db.user.create({
    data: {
      username: d.username, displayTitle: d.displayTitle, roleId: d.roleId, departmentId,
      employeeId: d.employeeId ?? null, passwordHash: await bcrypt.hash(d.password, 10), mustChangePassword: true,
      ...(d.employeeId ? { assignmentHistory: { create: { employeeId: d.employeeId, assignedById: me.id } } } : {}),
      ...(team ? { memberships: { create: { teamId: team.id } } } : {}),
    },
  });
  await audit(me.id, "user.create", "User", user.id, { username: user.username, roleId: d.roleId });
  revalidatePath("/users");
  redirect(`/users/${user.id}?created=1`);
}

export async function updateUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireUser();
  const parsed = userUpdateSchema.safeParse(formObject(formData));
  if (!parsed.success) return zodFail(parsed.error);
  const d = parsed.data;

  const target = await db.user.findUnique({ where: { id: d.userId }, include: { role: true, employee: true } });
  if (!target || !canManageUser(me, target)) return fail("You can't edit this user.");
  if (target.id === me.id && (d.roleId !== target.roleId || !d.isActive))
    return fail("You can't change your own role or disable your own account.");

  const { error } = await checkRole(me, d.roleId);
  if (error) return fail(error, { roleId: error });

  await db.user.update({
    where: { id: d.userId },
    data: {
      displayTitle: d.displayTitle ?? null, roleId: d.roleId, isActive: d.isActive === "on",
      ...(scopeLevel(me) === "all" && d.departmentId ? { departmentId: d.departmentId } : {}),
    },
  });
  await audit(me.id, "user.update", "User", d.userId, { roleId: d.roleId, isActive: d.isActive === "on" });
  revalidatePath(`/users/${d.userId}`);
  revalidatePath("/users");
  return success("User saved.");
}

/**
 * Place an employee on a user seat (or vacate it). Tasks stay with the seat,
 * so whoever holds it now sees — and is shown against — its open work.
 */
export async function assignEmployeeToUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireUser();
  const parsed = seatAssignSchema.safeParse(formObject(formData));
  if (!parsed.success) return zodFail(parsed.error);
  const { userId, employeeId, note } = parsed.data;

  const target = await db.user.findUnique({ where: { id: userId }, include: { role: true, employee: true } });
  if (!target || !canManageUser(me, target)) return fail("You can't change this user.");
  if ((employeeId ?? null) === target.employeeId) return fail("That employee already holds this user.");

  if (employeeId) {
    const emp = await db.employee.findUnique({ where: { id: employeeId }, include: { user: true } });
    if (!emp || !emp.isActive) return fail("Employee not found or inactive.");
    if (emp.user) return fail(`${emp.name} already holds user “${emp.user.username}”. Release it first.`);
    if (scopeLevel(me) !== "all" && emp.departmentId !== me.departmentId)
      return fail("Employee belongs to another department.");
  }

  const now = new Date();
  await db.$transaction([
    db.userAssignment.updateMany({ where: { userId, releasedAt: null }, data: { releasedAt: now } }),
    db.user.update({ where: { id: userId }, data: { employeeId: employeeId ?? null, mustChangePassword: !!employeeId } }),
    ...(employeeId
      ? [db.userAssignment.create({ data: { userId, employeeId, assignedById: me.id, note, assignedAt: now } })]
      : []),
  ]);
  await audit(me.id, employeeId ? "user.seat.assign" : "user.seat.release", "User", userId, {
    from: target.employeeId, to: employeeId ?? null,
  });
  if (employeeId) {
    const open = await db.task.count({ where: { assigneeId: userId, status: { notIn: ["DEPLOYED", "COMPLETED", "CLOSED", "CANCELLED"] } } });
    await notify([userId], {
      title: "You've been given this account",
      body: open ? `${open} open task(s) are now yours.` : "No open tasks yet.",
      link: "/tasks?view=mine",
    });
  }
  revalidatePath(`/users/${userId}`);
  revalidatePath("/users");
  return success(employeeId ? "Employee assigned to this user." : "User seat released.");
}

export async function resetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireUser();
  const parsed = passwordResetSchema.safeParse(formObject(formData));
  if (!parsed.success) return zodFail(parsed.error);
  const target = await db.user.findUnique({ where: { id: parsed.data.userId }, include: { role: true, employee: true } });
  if (!target || !canManageUser(me, target)) return fail("You can't reset this user's password.");
  await db.user.update({
    where: { id: target.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.password, 10), mustChangePassword: true },
  });
  await audit(me.id, "user.password.reset", "User", target.id);
  return success("Password reset. The user will be asked to change it at next login.");
}
