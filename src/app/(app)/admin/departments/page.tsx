import type { Metadata } from "next";
import { Pencil, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { Badge, Card, PageHeader } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { DepartmentForm } from "@/components/admin/forms";

export const metadata: Metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  await requirePermission("department.manage");
  const departments = await db.department.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { teams: true, employees: true, users: true } },
      users: { where: { role: { key: "HOD" }, isActive: true }, select: { username: true, employee: { select: { name: true } } } },
    },
  });

  return (
    <>
      <PageHeader
        title="Departments"
        description="Each department has its own HOD, teams, employees and users."
        actions={<Modal trigger={<><Plus className="size-4" /> New department</>} title="New department"><DepartmentForm /></Modal>}
      />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Department</th><th>HOD</th><th className="text-right">Teams</th><th className="text-right">Employees</th><th className="text-right">Users</th><th>Status</th><th /></tr></thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.id}>
                  <td><p className="font-medium">{d.name}</p><p className="text-xs text-zinc-500">{d.code}{d.description ? ` · ${d.description}` : ""}</p></td>
                  <td className="text-zinc-700">{d.users.map((u) => u.employee?.name ?? u.username).join(", ") || <span className="text-xs text-amber-700">Not set</span>}</td>
                  <td className="text-right tabular-nums">{d._count.teams}</td>
                  <td className="text-right tabular-nums">{d._count.employees}</td>
                  <td className="text-right tabular-nums">{d._count.users}</td>
                  <td>{d.isActive ? <Badge tone="green" dot>Active</Badge> : <Badge dot>Inactive</Badge>}</td>
                  <td className="text-right">
                    <Modal trigger={<Pencil className="size-4" />} triggerVariant="ghost" triggerSize="icon" title={`Edit ${d.name}`}>
                      <DepartmentForm dep={d} />
                    </Modal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-3 text-xs text-zinc-500">To set a HOD, create a user with the Head of Department role in that department.</p>
    </>
  );
}
