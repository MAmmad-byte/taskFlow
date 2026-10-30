import type { Metadata } from "next";
import { db } from "@/lib/db";
import { employeeScope, requirePermission, scopeLevel, teamScope } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui/misc";
import { UserCreateForm } from "@/components/admin/forms";

export const metadata: Metadata = { title: "New user" };

export default async function NewUserPage() {
  const user = await requirePermission("user.manage");
  const all = scopeLevel(user) === "all";
  const [roles, departments, employees, teams] = await Promise.all([
    db.role.findMany({ where: all ? {} : { level: { lt: user.role.level } }, orderBy: { level: "asc" } }),
    db.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.employee.findMany({ where: { ...employeeScope(user), isActive: true, user: null }, orderBy: { name: "asc" } }),
    db.team.findMany({ where: { ...teamScope(user), isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Create a user"
        description="A user is a login seat (e.g. erp.dev03). Place an employee on it now or later — tasks stay with the seat if the employee changes."
      />
      <Card className="p-5 sm:p-6">
        <UserCreateForm
          roles={roles.map((r) => ({ id: r.id, name: r.name }))}
          departments={departments}
          employees={employees.map((e) => ({ id: e.id, label: `${e.name} — ${e.employeeCode}` }))}
          teams={teams}
          showDepartment={all}
        />
      </Card>
    </div>
  );
}
