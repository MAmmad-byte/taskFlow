import type { Metadata } from "next";
import { Pencil, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { Badge, Card, PageHeader } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { ApplicationForm } from "@/components/admin/forms";
import { OPEN_STATUSES } from "@/lib/workflow";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage() {
  await requirePermission("application.manage");
  const [apps, open] = await Promise.all([
    db.application.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { tasks: true } } } }),
    db.task.groupBy({ by: ["applicationId"], where: { status: { in: OPEN_STATUSES } }, _count: { _all: true } }),
  ]);
  return (
    <>
      <PageHeader
        title="Applications"
        description="Systems your teams support. Tasks are tagged with the application they relate to."
        actions={<Modal trigger={<><Plus className="size-4" /> New application</>} title="New application"><ApplicationForm /></Modal>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {apps.map((a) => (
          <Card key={a.id} className="p-5">
            <div className="flex items-start justify-between">
              <span className="grid size-10 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: a.color }}>{a.code.slice(0, 2)}</span>
              <Modal trigger={<Pencil className="size-4" />} triggerVariant="ghost" triggerSize="icon" title={`Edit ${a.name}`}>
                <ApplicationForm app={a} />
              </Modal>
            </div>
            <p className="mt-3 font-semibold">{a.name} {!a.isActive && <Badge>Inactive</Badge>}</p>
            <p className="text-xs text-zinc-500">{a.description ?? a.code}</p>
            <div className="mt-4 flex gap-6 text-sm">
              <div><p className="font-semibold tabular-nums">{open.find((o) => o.applicationId === a.id)?._count._all ?? 0}</p><p className="text-xs text-zinc-500">Open</p></div>
              <div><p className="font-semibold tabular-nums">{a._count.tasks}</p><p className="text-xs text-zinc-500">All time</p></div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
