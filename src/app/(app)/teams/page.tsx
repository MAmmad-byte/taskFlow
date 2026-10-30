import Link from "next/link";
import type { Metadata } from "next";
import { subDays } from "date-fns";
import { Plus, UsersRound } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeLevel, teamScope } from "@/lib/auth";
import { Avatar, Badge, Card, EmptyState, PageHeader, ProgressBar } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { TeamForm } from "@/components/admin/forms";
import { DONE_STATUSES, OPEN_STATUSES } from "@/lib/workflow";
import { pct } from "@/lib/utils";

export const metadata: Metadata = { title: "Teams" };

export default async function TeamsPage() {
  const user = await requirePermission("team.view");
  const since = subDays(new Date(), 30);
  const [teams, departments] = await Promise.all([
    db.team.findMany({
      where: teamScope(user),
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        department: { select: { name: true } },
        members: {
          where: { user: { isActive: true } },
          include: { user: { select: { username: true, displayTitle: true, employee: { select: { name: true } } } } },
          orderBy: { isLead: "desc" },
        },
      },
    }),
    scopeLevel(user) === "all" ? db.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
  ]);
  const ids = teams.map((t) => t.id);
  const [openCounts, doneCounts, createdCounts] = await Promise.all([
    db.task.groupBy({ by: ["teamId"], where: { teamId: { in: ids }, status: { in: OPEN_STATUSES } }, _count: { _all: true } }),
    db.task.groupBy({ by: ["teamId"], where: { teamId: { in: ids }, status: { in: DONE_STATUSES }, completedAt: { gte: since } }, _count: { _all: true } }),
    db.task.groupBy({ by: ["teamId"], where: { teamId: { in: ids }, createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const count = (rows: { teamId: string; _count: { _all: number } }[], id: string) => rows.find((r) => r.teamId === id)?._count._all ?? 0;

  return (
    <>
      <PageHeader
        title="Teams"
        description={scopeLevel(user) === "team" ? "Teams you belong to" : "Teams, their leads and current workload"}
        actions={
          can(user, "team.manage") && (
            <Modal trigger={<><Plus className="size-4" /> New team</>} title="Create a team" description="Teams belong to a department and hold members and tasks.">
              <TeamForm departments={departments} />
            </Modal>
          )
        }
      />
      {teams.length === 0 ? (
        <Card><EmptyState icon={UsersRound} title="No teams yet" description="Create the first team to start assigning work." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((t) => {
            const leads = t.members.filter((m) => m.isLead);
            const open = count(openCounts, t.id);
            const done = count(doneCounts, t.id);
            const created = count(createdCounts, t.id);
            return (
              <Link key={t.id} href={`/teams/${t.id}`} className="card group flex flex-col p-5 transition hover:border-zinc-300 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-zinc-900 group-hover:text-brand-800">{t.name}</h3>
                      {!t.isActive && <Badge>Inactive</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">{t.code} · {t.department.name}</p>
                  </div>
                  <div className="flex -space-x-2">
                    {t.members.slice(0, 4).map((m) => (
                      <Avatar key={m.id} name={m.user.employee?.name ?? m.user.username} size="sm" className="ring-2 ring-white" />
                    ))}
                    {t.members.length > 4 && <span className="grid size-6 place-items-center rounded-full bg-zinc-100 text-[10px] font-medium text-zinc-600 ring-2 ring-white">+{t.members.length - 4}</span>}
                  </div>
                </div>
                {t.description && <p className="mt-3 line-clamp-2 text-sm text-zinc-600">{t.description}</p>}
                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-zinc-50 p-3 text-center">
                  <div><p className="text-lg font-semibold tabular-nums">{t.members.length}</p><p className="text-[11px] text-zinc-500">Members</p></div>
                  <div><p className="text-lg font-semibold tabular-nums">{open}</p><p className="text-[11px] text-zinc-500">Open</p></div>
                  <div><p className="text-lg font-semibold tabular-nums">{done}</p><p className="text-[11px] text-zinc-500">Done · 30d</p></div>
                </div>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-zinc-500">
                    <span>Throughput (30 days)</span>
                    <span className="tabular-nums">{done}/{created} · {pct(done, created)}%</span>
                  </div>
                  <ProgressBar value={pct(done, Math.max(created, done))} />
                </div>
                <p className="mt-4 text-xs text-zinc-500">
                  Lead: <span className="font-medium text-zinc-700">{leads.length ? leads.map((l) => l.user.employee?.name ?? l.user.username).join(", ") : "Not set"}</span>
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
