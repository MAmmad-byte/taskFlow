import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { can, employeeScope, getCurrentUser, userScope } from "@/lib/auth";
import { exportTable } from "@/lib/export/table";
import { badRequest, exportFormat } from "@/lib/export/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/export/users | /api/export/employees | /api/export/audit  ?format=xlsx|pdf */
export async function GET(req: NextRequest, { params }: { params: Promise<{ list: string }> }) {
  const user = await getCurrentUser();
  if (!user) return badRequest("Not signed in", 401);
  const fmt = exportFormat(req.nextUrl.searchParams.get("format"));
  if (!fmt) return badRequest("format must be xlsx or pdf");
  const { list } = await params;
  const q = req.nextUrl.searchParams.get("q")?.trim();

  if (list === "users") {
    if (!can(user, "user.view")) return badRequest("Not allowed", 403);
    const users = await db.user.findMany({
      where: {
        AND: [
          userScope(user),
          q ? { OR: [{ username: { contains: q, mode: "insensitive" } }, { employee: { name: { contains: q, mode: "insensitive" } } }, { employee: { employeeCode: { contains: q, mode: "insensitive" } } }] } : {},
        ],
      },
      orderBy: [{ role: { level: "desc" } }, { username: "asc" }],
      include: {
        role: { select: { name: true } },
        department: { select: { name: true } },
        employee: { select: { name: true, employeeCode: true, email: true, phone: true } },
        memberships: { include: { team: { select: { name: true } } } },
        _count: { select: { assignedTasks: { where: { status: { notIn: ["DEPLOYED", "COMPLETED", "CLOSED", "CANCELLED"] } } } } },
      },
    });
    return exportTable(fmt, {
      title: "Users", file: "users", generatedBy: user.displayName,
      columns: [
        { header: "Username", key: "username", width: 16, pdf: 1.1 },
        { header: "Seat title", key: "title", width: 22, pdf: false },
        { header: "Role", key: "role", width: 18, pdf: 1.1 },
        { header: "Department", key: "department", width: 20, pdf: false },
        { header: "Employee", key: "employee", width: 22, pdf: 1.4 },
        { header: "Employee ID", key: "code", width: 13, pdf: 0.9 },
        { header: "Email", key: "email", width: 26, pdf: 1.6 },
        { header: "Contact", key: "phone", width: 15, pdf: 1 },
        { header: "Teams", key: "teams", width: 30, pdf: 1.6 },
        { header: "Open tasks", key: "open", type: "number", width: 11, pdf: 0.7 },
        { header: "Status", key: "status", width: 10, pdf: 0.7 },
        { header: "Last sign-in", key: "lastLogin", type: "datetime", width: 18, pdf: false },
      ],
      rows: users.map((u) => ({
        username: u.username, title: u.displayTitle ?? "", role: u.role.name, department: u.department?.name ?? "",
        employee: u.employee?.name ?? "Vacant", code: u.employee?.employeeCode ?? "", email: u.employee?.email ?? "", phone: u.employee?.phone ?? "",
        teams: u.memberships.map((m) => `${m.team.name}${m.isLead ? " (lead)" : ""}`).join(", "),
        open: u._count.assignedTasks, status: u.isActive ? "Active" : "Disabled", lastLogin: u.lastLoginAt,
      })),
    });
  }

  if (list === "employees") {
    if (!can(user, "employee.view")) return badRequest("Not allowed", 403);
    const employees = await db.employee.findMany({
      where: {
        AND: [
          employeeScope(user),
          q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { employeeCode: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {},
        ],
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { department: { select: { name: true } }, user: { select: { username: true, role: { select: { name: true } } } } },
    });
    return exportTable(fmt, {
      title: "Employees", file: "employees", generatedBy: user.displayName,
      columns: [
        { header: "Employee ID", key: "code", width: 13, pdf: 0.9 },
        { header: "Name", key: "name", width: 24, pdf: 1.5 },
        { header: "Designation", key: "designation", width: 26, pdf: 1.5 },
        { header: "Department", key: "department", width: 22, pdf: 1.3 },
        { header: "Email", key: "email", width: 28, pdf: 1.7 },
        { header: "Contact", key: "phone", width: 15, pdf: 1 },
        { header: "User", key: "user", width: 16, pdf: 1 },
        { header: "Role", key: "role", width: 18, pdf: false },
        { header: "Status", key: "status", width: 10, pdf: 0.7 },
      ],
      rows: employees.map((e) => ({
        code: e.employeeCode, name: e.name, designation: e.designation ?? "", department: e.department.name, email: e.email,
        phone: e.phone ?? "", user: e.user?.username ?? "", role: e.user?.role.name ?? "", status: e.isActive ? "Active" : "Inactive",
      })),
    });
  }

  if (list === "audit") {
    if (!can(user, "audit.view")) return badRequest("Not allowed", 403);
    const logs = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 5000, include: { actor: { select: { username: true } } } });
    return exportTable(fmt, {
      title: "Audit log", subtitle: "Latest 5,000 entries", file: "audit-log", generatedBy: user.displayName,
      columns: [
        { header: "When", key: "when", type: "datetime", width: 18, pdf: 1.2 },
        { header: "User", key: "who", width: 16, pdf: 1 },
        { header: "Action", key: "action", width: 24, pdf: 1.4 },
        { header: "Entity", key: "entity", width: 14, pdf: 0.9 },
        { header: "Entity ID", key: "entityId", width: 28, pdf: false },
        { header: "Details", key: "details", width: 60, pdf: 2.5 },
      ],
      rows: logs.map((l) => ({
        when: l.createdAt, who: l.actor ? `@${l.actor.username}` : "system", action: l.action, entity: l.entity,
        entityId: l.entityId ?? "", details: l.details ? JSON.stringify(l.details) : "",
      })),
    });
  }

  return badRequest("Unknown export", 404);
}
