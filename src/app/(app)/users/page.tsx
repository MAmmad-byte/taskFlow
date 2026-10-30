import Link from "next/link";
import { ExportMenu } from "@/components/ui/export-menu";
import type { Metadata } from "next";
import { KeyRound, Search } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, userScope } from "@/lib/auth";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { fromNow, sp } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("user.view");
  const params = await searchParams;
  const q = sp(params.q)?.trim();
  const role = sp(params.role);
  const status = sp(params.status);

  const where: Prisma.UserWhereInput = {
    AND: [
      userScope(user),
      role ? { roleId: role } : {},
      status === "vacant" ? { employeeId: null } : status === "disabled" ? { isActive: false } : {},
      q
        ? {
            OR: [
              { username: { contains: q, mode: "insensitive" } },
              { displayTitle: { contains: q, mode: "insensitive" } },
              { employee: { name: { contains: q, mode: "insensitive" } } },
              { employee: { employeeCode: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
  const [users, roles] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: [{ role: { level: "desc" } }, { username: "asc" }],
      include: {
        role: { select: { name: true, key: true } },
        department: { select: { name: true } },
        employee: { select: { name: true, employeeCode: true, email: true } },
        memberships: { include: { team: { select: { name: true } } } },
      },
    }),
    db.role.findMany({ orderBy: { level: "desc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Users"
        description="Login accounts (seats). Each seat is held by an employee and carries its tasks."
        actions={
          <>
            <ExportMenu base="/api/export/users" params={q ? { q } : undefined} />
            {can(user, "user.manage") && <LinkButton href="/users/new"><KeyRound className="size-4" /> New user</LinkButton>}
          </>
        }
      />

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input name="q" defaultValue={q} placeholder="Search username, name, employee ID" className="input h-9 pl-9 text-[13px]" />
        </div>
        <select name="role" defaultValue={role ?? ""} className="input h-9 w-auto py-1 text-[13px]">
          <option value="">All roles</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select name="status" defaultValue={status ?? ""} className="input h-9 w-auto py-1 text-[13px]">
          <option value="">Any status</option>
          <option value="vacant">Vacant seats</option>
          <option value="disabled">Disabled</option>
        </select>
        <button className="h-9 rounded-lg bg-zinc-900 px-3 text-[13px] font-medium text-white">Filter</button>
      </form>

      <Card className="overflow-hidden">
        {users.length === 0 ? (
          <EmptyState icon={KeyRound} title="No users found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>User</th><th>Employee</th><th>Role</th><th>Teams</th><th>Status</th><th>Last sign-in</th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="relative">
                    <td>
                      <Link href={`/users/${u.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                        <Avatar name={u.employee?.name ?? u.username} />
                        <div>
                          <p className="font-medium text-zinc-900">@{u.username}</p>
                          <p className="text-xs text-zinc-500">{u.displayTitle ?? "—"}</p>
                        </div>
                      </Link>
                    </td>
                    <td>
                      {u.employee ? (
                        <div>
                          <p className="text-zinc-800">{u.employee.name}</p>
                          <p className="text-xs text-zinc-500">{u.employee.employeeCode} · {u.employee.email}</p>
                        </div>
                      ) : <Badge tone="orange">Vacant</Badge>}
                    </td>
                    <td>
                      <Badge tone={u.role.key === "ADMIN" ? "red" : u.role.key === "HOD" ? "violet" : u.role.key === "TEAM_LEAD" ? "amber" : "slate"}>{u.role.name}</Badge>
                      {u.department && <p className="mt-1 text-xs text-zinc-500">{u.department.name}</p>}
                    </td>
                    <td className="max-w-48 text-xs text-zinc-600">{u.memberships.map((m) => `${m.team.name}${m.isLead ? " (lead)" : ""}`).join(", ") || "—"}</td>
                    <td>{u.isActive ? <Badge tone="green" dot>Active</Badge> : <Badge dot>Disabled</Badge>}</td>
                    <td className="whitespace-nowrap text-xs text-zinc-500">{u.lastLoginAt ? fromNow(u.lastLoginAt) : "Never"}</td>
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
