import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui/misc";
import { fmtDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage() {
  await requirePermission("audit.view");
  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { username: true } } },
  });
  return (
    <>
      <PageHeader title="Audit log" description="The latest 200 administrative actions and sign-ins." />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-zinc-600">{fmtDateTime(l.createdAt)}</td>
                  <td className="font-medium">{l.actor ? `@${l.actor.username}` : "system"}</td>
                  <td><code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">{l.action}</code></td>
                  <td className="text-zinc-600">{l.entity}</td>
                  <td className="max-w-md truncate font-mono text-xs text-zinc-500">{l.details ? JSON.stringify(l.details) : "—"}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-zinc-500">Nothing logged yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
