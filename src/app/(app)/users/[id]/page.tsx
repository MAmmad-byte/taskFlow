import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, History } from "lucide-react";
import { db } from "@/lib/db";
import { canManageUser, employeeScope, requirePermission, scopeLevel, userScope } from "@/lib/auth";
import { Avatar, Badge, Card, CardHeader, DescriptionList, PageHeader, StatCard } from "@/components/ui/misc";
import { ResetPasswordForm, SeatAssignForm, UserEditForm } from "@/components/admin/forms";
import { DONE_STATUSES, OPEN_STATUSES } from "@/lib/workflow";
import { fmtDate, fmtDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "User" };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requirePermission("user.view");
  const target = await db.user.findFirst({
    where: { AND: [{ id }, userScope(me)] },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      department: true,
      employee: { include: { department: { select: { name: true } } } },
      memberships: { include: { team: { select: { id: true, name: true } } } },
      assignmentHistory: {
        orderBy: { assignedAt: "desc" },
        include: { employee: { select: { name: true, employeeCode: true } }, assignedBy: { select: { username: true } } },
      },
    },
  });
  if (!target) notFound();
  const manage = canManageUser(me, target);
  const all = scopeLevel(me) === "all";

  const [open, overdue, done, roleRows, departments, freeEmployees] = await Promise.all([
    db.task.count({ where: { assigneeId: id, status: { in: OPEN_STATUSES } } }),
    db.task.count({ where: { assigneeId: id, status: { in: OPEN_STATUSES }, dueDate: { lt: new Date() } } }),
    db.task.count({ where: { assigneeId: id, status: { in: DONE_STATUSES } } }),
    manage ? db.role.findMany({ where: all ? {} : { level: { lt: me.role.level } }, orderBy: { level: "asc" }, select: { id: true, name: true } }) : ([] as { id: string; name: string }[]),
    manage && all ? db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : ([] as { id: string; name: string }[]),
    manage ? db.employee.findMany({ where: { ...employeeScope(me), isActive: true, OR: [{ user: null }, { id: target.employeeId ?? "__" }] }, orderBy: { name: "asc" } }) : [],
  ]);
  // make sure the user's current role is always selectable, even if it's above what the actor may grant
  const roles: { id: string; name: string }[] = roleRows.some((r) => r.id === target.roleId)
    ? roleRows
    : [...roleRows, { id: target.role.id, name: target.role.name }];
  const perms = target.role.permissions.map((rp) => rp.permission).sort((a, b) => a.group.localeCompare(b.group));
  const name = target.employee?.name ?? target.displayTitle ?? target.username;

  return (
    <>
      <Link href="/users" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="size-4" /> Users
      </Link>
      <PageHeader
        title={`@${target.username}`}
        description={<>{target.displayTitle ?? "User seat"} · {target.role.name}{!target.isActive && <> · <Badge>Disabled</Badge></>}</>}
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Open tasks on this seat" value={open} />
        <StatCard label="Overdue" value={overdue} tone={overdue ? "red" : "zinc"} />
        <StatCard label="Completed (all time)" value={done} tone="brand" />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Current employee" description="The person using this account right now" />
            {target.employee ? (
              <div className="flex items-center gap-4 px-5 pt-4">
                <Avatar name={name} size="lg" />
                <div>
                  <p className="font-semibold">{target.employee.name}</p>
                  <p className="text-sm text-zinc-500">{target.employee.designation ?? "—"}</p>
                </div>
              </div>
            ) : (
              <p className="px-5 pt-4 text-sm text-amber-700">This seat is vacant — its open tasks have no one working on them.</p>
            )}
            <div className="py-2">
              <DescriptionList
                items={[
                  { label: "Employee ID", value: target.employee?.employeeCode ?? "—" },
                  { label: "Email", value: target.employee?.email ?? "—" },
                  { label: "Contact", value: target.employee?.phone ?? "—" },
                  { label: "Department", value: target.department?.name ?? target.employee?.department.name ?? "—" },
                  { label: "Teams", value: target.memberships.length ? target.memberships.map((m) => <Link key={m.id} href={`/teams/${m.team.id}`} className="block hover:underline">{m.team.name}{m.isLead ? " (lead)" : ""}</Link>) : "—" },
                  { label: "Last sign-in", value: target.lastLoginAt ? fmtDateTime(target.lastLoginAt) : "Never" },
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Seat history" description="Which employee held this account, and when" action={<History className="size-4 text-zinc-400" />} />
            {target.assignmentHistory.length === 0 ? (
              <p className="px-5 py-6 text-sm text-zinc-500">No employee has been assigned yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead><tr><th>Employee</th><th>From</th><th>Until</th><th>By</th><th>Note</th></tr></thead>
                  <tbody>
                    {target.assignmentHistory.map((h) => (
                      <tr key={h.id}>
                        <td><span className="font-medium">{h.employee.name}</span> <span className="text-xs text-zinc-500">{h.employee.employeeCode}</span></td>
                        <td className="whitespace-nowrap">{fmtDate(h.assignedAt)}</td>
                        <td className="whitespace-nowrap">{h.releasedAt ? fmtDate(h.releasedAt) : <Badge tone="green">Current</Badge>}</td>
                        <td className="text-zinc-500">{h.assignedBy?.username ?? "—"}</td>
                        <td className="text-zinc-500">{h.note ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title={`Permissions — ${target.role.name}`} description="Granted through the role. Administrators can change role permissions." />
            <ul className="grid gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-2">
              {perms.map((p) => (
                <li key={p.id} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-600" />
                  <span><span className="text-zinc-800">{p.name}</span> <span className="text-xs text-zinc-400">· {p.group}</span></span>
                </li>
              ))}
              {perms.length === 0 && <li className="text-sm text-zinc-500">This role has no permissions.</li>}
            </ul>
          </Card>
        </div>

        {manage && (
          <div className="space-y-6">
            <Card>
              <CardHeader title="Assign employee" description="Open tasks follow the seat to the new person" />
              <div className="p-5">
                <SeatAssignForm
                  userId={target.id}
                  currentEmployeeId={target.employeeId}
                  employees={freeEmployees.map((e) => ({ id: e.id, label: `${e.name} — ${e.employeeCode}` }))}
                />
              </div>
            </Card>
            <Card>
              <CardHeader title="Account" />
              <div className="p-5">
                <UserEditForm
                  user={{ id: target.id, displayTitle: target.displayTitle, roleId: target.roleId, departmentId: target.departmentId, isActive: target.isActive }}
                  roles={roles}
                  departments={departments}
                  showDepartment={all}
                  isSelf={target.id === me.id}
                />
              </div>
            </Card>
            <Card>
              <CardHeader title="Reset password" />
              <div className="p-5"><ResetPasswordForm userId={target.id} /></div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
