"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { can, requireUser, scopeLevel } from "@/lib/auth";
import { fail, formObject, success, zodFail, type ActionState } from "@/lib/action-result";
import { applicationSchema, departmentSchema, employeeSchema, roleSchema } from "@/lib/validators";
import { audit } from "@/lib/audit";

// ───────────────────────── Employees ─────────────────────────

export async function saveEmployee(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireUser();
  if (!can(me, "employee.manage")) return fail("You don't have permission to manage employees.");
  const id = String(formData.get("id") ?? "") || null;
  const parsed = employeeSchema.safeParse(formObject(formData));
  if (!parsed.success) return zodFail(parsed.error);
  const d = parsed.data;

  const departmentId = scopeLevel(me) === "all" ? d.departmentId ?? me.departmentId : me.departmentId;
  if (!departmentId) return fail("Choose a department.", { departmentId: "Required" });

  if (id) {
    const existing = await db.employee.findUnique({ where: { id } });
    if (!existing) return fail("Employee not found.");
    if (scopeLevel(me) !== "all" && existing.departmentId !== me.departmentId) return fail("Employee belongs to another department.");
  }
  const clash = await db.employee.findFirst({
    where: { OR: [{ employeeCode: d.employeeCode }, { email: d.email.toLowerCase() }], ...(id ? { NOT: { id } } : {}) },
  });
  if (clash) {
    return clash.employeeCode === d.employeeCode
      ? fail("Employee ID already exists.", { employeeCode: "Already exists" })
      : fail("Email already exists.", { email: "Already exists" });
  }

  const data = {
    employeeCode: d.employeeCode, name: d.name, email: d.email.toLowerCase(), phone: d.phone ?? null,
    designation: d.designation ?? null, departmentId,
    ...(id ? { isActive: formData.get("isActive") === "on" } : {}),
  };
  const emp = id ? await db.employee.update({ where: { id }, data }) : await db.employee.create({ data });
  await audit(me.id, id ? "employee.update" : "employee.create", "Employee", emp.id, { code: emp.employeeCode });
  revalidatePath("/employees");
  return success(id ? "Employee updated." : "Employee added.");
}

// ───────────────────────── Departments ─────────────────────────

export async function saveDepartment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireUser();
  if (!can(me, "department.manage")) return fail("You don't have permission to manage departments.");
  const id = String(formData.get("id") ?? "") || null;
  const parsed = departmentSchema.safeParse(formObject(formData));
  if (!parsed.success) return zodFail(parsed.error);
  const clash = await db.department.findFirst({ where: { code: parsed.data.code, ...(id ? { NOT: { id } } : {}) } });
  if (clash) return fail("Code already used.", { code: "Already used" });

  const data = { ...parsed.data, description: parsed.data.description ?? null, ...(id ? { isActive: formData.get("isActive") === "on" } : {}) };
  const dep = id ? await db.department.update({ where: { id }, data }) : await db.department.create({ data });
  await audit(me.id, id ? "department.update" : "department.create", "Department", dep.id, { code: dep.code });
  revalidatePath("/admin/departments");
  return success("Department saved.");
}

// ───────────────────────── Applications ─────────────────────────

export async function saveApplication(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireUser();
  if (!can(me, "application.manage")) return fail("You don't have permission to manage applications.");
  const id = String(formData.get("id") ?? "") || null;
  const parsed = applicationSchema.safeParse(formObject(formData));
  if (!parsed.success) return zodFail(parsed.error);
  const clash = await db.application.findFirst({ where: { code: parsed.data.code, ...(id ? { NOT: { id } } : {}) } });
  if (clash) return fail("Code already used.", { code: "Already used" });

  const data = { ...parsed.data, description: parsed.data.description ?? null, ...(id ? { isActive: formData.get("isActive") === "on" } : {}) };
  const app = id ? await db.application.update({ where: { id }, data }) : await db.application.create({ data });
  await audit(me.id, id ? "application.update" : "application.create", "Application", app.id, { code: app.code });
  revalidatePath("/admin/applications");
  return success("Application saved.");
}

// ───────────────────────── Roles & permissions ─────────────────────────

export async function createRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireUser();
  if (!can(me, "role.manage")) return fail("You don't have permission to manage roles.");
  const parsed = roleSchema.safeParse(formObject(formData));
  if (!parsed.success) return zodFail(parsed.error);
  if (await db.role.findUnique({ where: { key: parsed.data.key } })) return fail("Role key already exists.", { key: "Already exists" });
  const role = await db.role.create({ data: { ...parsed.data, description: parsed.data.description ?? null } });
  await audit(me.id, "role.create", "Role", role.id, { key: role.key });
  revalidatePath("/admin/roles");
  return success(`Role “${role.name}” created. Tick its permissions in the matrix and save.`);
}

/** Saves the whole permission matrix. Checkbox names are `perm:<roleId>:<permissionId>`. */
export async function saveRoleMatrix(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireUser();
  if (!can(me, "role.manage")) return fail("You don't have permission to manage roles.");

  const roles = await db.role.findMany();
  const permissions = await db.permission.findMany();
  const validPerm = new Set(permissions.map((p) => p.id));
  const selected = new Map<string, string[]>(roles.map((r) => [r.id, []]));
  for (const key of formData.keys()) {
    const [prefix, roleId, permissionId] = key.split(":");
    if (prefix === "perm" && roleId && permissionId && selected.has(roleId) && validPerm.has(permissionId)) {
      selected.get(roleId)!.push(permissionId);
    }
  }

  // Safety: administrators always keep role management so nobody gets locked out
  const adminRole = roles.find((r) => r.key === "ADMIN");
  const roleManage = permissions.find((p) => p.key === "role.manage");
  if (adminRole && roleManage && !selected.get(adminRole.id)!.includes(roleManage.id)) {
    selected.get(adminRole.id)!.push(roleManage.id);
  }

  await db.$transaction([
    db.rolePermission.deleteMany({}),
    db.rolePermission.createMany({
      data: [...selected.entries()].flatMap(([roleId, ids]) => ids.map((permissionId) => ({ roleId, permissionId }))),
    }),
  ]);
  await audit(me.id, "role.matrix.save", "Role", null);
  revalidatePath("/", "layout");
  return success("Permissions saved. Changes apply immediately.");
}

// ───────────────────────── Notifications ─────────────────────────

export async function markNotificationsRead(formData: FormData) {
  const me = await requireUser();
  const id = formData.get("id");
  await db.notification.updateMany({
    where: { userId: me.id, readAt: null, ...(id ? { id: String(id) } : {}) },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
}
