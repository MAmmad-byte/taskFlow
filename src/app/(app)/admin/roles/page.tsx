import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { RoleCreateForm } from "@/components/admin/forms";
import { RoleMatrix } from "./role-matrix";

export const metadata: Metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  await requirePermission("role.manage");
  const [roles, permissions] = await Promise.all([
    db.role.findMany({ orderBy: { level: "desc" }, include: { permissions: true, _count: { select: { users: true } } } }),
    db.permission.findMany({ orderBy: [{ group: "asc" }, { key: "asc" }] }),
  ]);

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="Tick what each role may do. Changes apply to every user with that role immediately."
        actions={<Modal trigger={<><Plus className="size-4" /> New role</>} title="New role" description="Custom roles start with no permissions."><RoleCreateForm /></Modal>}
      />
      <Card className="overflow-hidden">
        <RoleMatrix
          roles={roles.map((r) => ({ id: r.id, key: r.key, name: r.name, level: r.level, users: r._count.users, granted: r.permissions.map((p) => p.permissionId) }))}
          permissions={permissions.map((p) => ({ id: p.id, key: p.key, name: p.name, group: p.group, description: p.description }))}
        />
      </Card>
      <p className="mt-3 text-xs text-zinc-500">
        Data scope comes from the role&apos;s view permissions: <b>View all tasks</b> → every department; <b>View department tasks</b> → own department;
        otherwise the user sees their own tasks plus the teams they belong to (or lead). Authority level controls which roles a HOD can hand out.
      </p>
    </>
  );
}
