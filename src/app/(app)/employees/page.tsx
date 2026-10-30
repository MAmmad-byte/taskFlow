import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { Pencil, Plus, Search, Users } from "lucide-react";
import { db } from "@/lib/db";
import { can, employeeScope, requirePermission, scopeLevel } from "@/lib/auth";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { EmployeeForm } from "@/components/admin/forms";
import { sp } from "@/lib/utils";

export const metadata: Metadata = { title: "Employees" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("employee.view");
  const params = await searchParams;
  const q = sp(params.q)?.trim();
  const all = scopeLevel(user) === "all";
  const manage = can(user, "employee.manage");

  const where: Prisma.EmployeeWhereInput = {
    AND: [
      employeeScope(user),
      q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { employeeCode: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
            ],
          }
        : {},
    ],
  };
  const [employees, departments] = await Promise.all([
    db.employee.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { department: { select: { name: true } }, user: { select: { id: true, username: true, role: { select: { name: true } } } } },
    }),
    db.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Employees"
        description="The employee register. Place an employee on a user seat from the Users screen."
        actions={
          manage && (
            <Modal trigger={<><Plus className="size-4" /> Add employee</>} title="Add employee" size="lg">
              <EmployeeForm departments={departments} showDepartment={all} />
            </Modal>
          )
        }
      />
      <form className="mb-4">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input name="q" defaultValue={q} placeholder="Search name, employee ID, email, phone" className="input h-9 pl-9 text-[13px]" />
        </div>
      </form>

      <Card className="overflow-hidden">
        {employees.length === 0 ? (
          <EmptyState icon={Users} title="No employees found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>Employee</th><th>Employee ID</th><th>Contact</th><th>Department</th><th>User seat</th><th>Status</th>{manage && <th />}</tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={e.name} />
                        <div>
                          <p className="font-medium text-zinc-900">{e.name}</p>
                          <p className="text-xs text-zinc-500">{e.designation ?? "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="font-mono text-xs">{e.employeeCode}</td>
                    <td className="text-xs text-zinc-600"><p>{e.email}</p><p>{e.phone ?? "—"}</p></td>
                    <td className="text-zinc-600">{e.department.name}</td>
                    <td>
                      {e.user ? (
                        <Link href={`/users/${e.user.id}`} className="text-sm font-medium text-brand-700 hover:underline">@{e.user.username}</Link>
                      ) : <span className="text-xs text-zinc-400">No user</span>}
                      {e.user && <p className="text-xs text-zinc-500">{e.user.role.name}</p>}
                    </td>
                    <td>{e.isActive ? <Badge tone="green" dot>Active</Badge> : <Badge dot>Inactive</Badge>}</td>
                    {manage && (
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          {can(user, "progress.employee") && (
                            <Link href={`/progress?employee=${encodeURIComponent(e.employeeCode)}`} className="rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100">Progress</Link>
                          )}
                          <Modal trigger={<Pencil className="size-4" />} triggerVariant="ghost" triggerSize="icon" title={`Edit ${e.name}`} size="lg">
                            <EmployeeForm employee={e} departments={departments} showDepartment={all} />
                          </Modal>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
