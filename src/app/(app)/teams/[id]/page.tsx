import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Crown, Settings2, UserMinus } from "lucide-react";
import { db } from "@/lib/db";
import { canManageTeam, requirePermission, scopeLevel, supervisesTeam } from "@/lib/auth";
import { removeTeamMember, setTeamLead } from "@/actions/teams";
import { Avatar, Badge, Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { AddMemberForm, TeamForm } from "@/components/admin/forms";
import { LinkButton } from "@/components/ui/button";
import { StatusBadge, DueLabel } from "@/components/tasks/badges";
import { OPEN_STATUSES, TERMINAL_STATUSES, taskCode } from "@/lib/workflow";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("team.view");
  const team = await db.team.findUnique({
    where: { id },
    include: {
      department: true,
      members: {
        orderBy: [{ isLead: "desc" }, { joinedAt: "asc" }],
        include: { user: { include: { employee: true, role: { select: { name: true } } } } },
      },
    },
  });
  if (!team) notFound();
  const visible = scopeLevel(user) === "all" || (scopeLevel(user) === "department" && team.departmentId === user.departmentId) || user.teamIds.includes(team.id);
  if (!visible) redirect("/forbidden");

  const manage = canManageTeam(user, team);
  const manageMembers = canManageTeam(user, team, "team.members.manage");
  const supervisor = supervisesTeam(user, team);
  const now = new Date();

  const memberIds = team.members.map((m) => m.userId);
  const [openByUser, overdueByUser, recent, candidates] = await Promise.all([
    db.task.groupBy({ by: ["assigneeId"], where: { teamId: id, status: { in: OPEN_STATUSES } }, _count: { _all: true } }),
    db.task.groupBy({ by: ["assigneeId"], where: { teamId: id, status: { in: OPEN_STATUSES }, dueDate: { lt: now } }, _count: { _all: true } }),
    db.task.findMany({
      where: { teamId: id, status: { notIn: TERMINAL_STATUSES } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      take: 8,
      include: { assignee: { select: { username: true, employee: { select: { name: true } } } } },
    }),
    manageMembers
      ? db.user.findMany({
          where: {
            isActive: true,
            id: { notIn: memberIds },
            ...(scopeLevel(user) === "all" ? {} : { OR: [{ departmentId: team.departmentId }, { employee: { departmentId: team.departmentId } }] }),
          },
          orderBy: { username: "asc" },
          include: { employee: { select: { name: true } }, role: { select: { name: true } } },
        })
      : [],
  ]);
  const n = (rows: { assigneeId: string | null; _count: { _all: number } }[], uid: string | null) => rows.find((r) => r.assigneeId === uid)?._count._all ?? 0;
  const openTotal = openByUser.reduce((a, r) => a + r._count._all, 0);
  const overdueTotal = overdueByUser.reduce((a, r) => a + r._count._all, 0);

  return (
    <>
      <Link href="/teams" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="size-4" /> Teams
      </Link>
      <PageHeader
        title={team.name}
        description={<>{team.code} · {team.department.name}{!team.isActive && <> · <Badge>Inactive</Badge></>}{team.description && <span className="mt-1 block">{team.description}</span>}</>}
        actions={
          <>
            {supervisor && <LinkButton href={`/reports?team=${team.id}`} variant="outline">Team report</LinkButton>}
            <LinkButton href={`/tasks?view=scope&team=${team.id}`} variant="outline">Team tasks</LinkButton>
            {manage && (
              <Modal trigger={<><Settings2 className="size-4" /> Settings</>} triggerVariant="secondary" title="Team settings">
                <TeamForm team={team} />
              </Modal>
            )}
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Members" value={team.members.length} />
        <StatCard label="Open tasks" value={openTotal} hint={`${n(openByUser, null)} unassigned`} />
        <StatCard label="Overdue" value={overdueTotal} tone={overdueTotal ? "red" : "zinc"} />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Members" description="Team leads can assign work and control task status for this team" />
          {manageMembers && (
            <div className="border-b border-zinc-100 px-5 py-4">
              <AddMemberForm
                teamId={team.id}
                candidates={candidates.map((c) => ({ id: c.id, label: `${c.employee?.name ?? c.displayTitle ?? c.username} — ${c.username} (${c.role.name})` }))}
              />
            </div>
          )}
          {team.members.length === 0 ? (
            <EmptyState title="No members yet" />
          ) : (
            <ul className="divide-y divide-zinc-100">
              {team.members.map((m) => {
                const name = m.user.employee?.name ?? m.user.displayTitle ?? m.user.username;
                return (
                  <li key={m.id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar name={name} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                          {name}
                          {m.isLead && <Badge tone="amber"><Crown className="size-3" /> Lead</Badge>}
                          {!m.user.isActive && <Badge>Disabled</Badge>}
                          {!m.user.employee && <Badge tone="orange">Vacant seat</Badge>}
                        </p>
                        <p className="text-xs text-zinc-500">
                          @{m.user.username} · {m.user.role.name}
                          {m.user.employee ? ` · ${m.user.employee.employeeCode}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right text-xs">
                        <p className="tabular-nums text-zinc-700"><b>{n(openByUser, m.userId)}</b> open</p>
                        {n(overdueByUser, m.userId) > 0 && <p className="tabular-nums text-red-600">{n(overdueByUser, m.userId)} overdue</p>}
                      </div>
                      {manageMembers && (
                        <div className="flex items-center gap-1">
                          <form action={setTeamLead}>
                            <input type="hidden" name="teamId" value={team.id} />
                            <input type="hidden" name="userId" value={m.userId} />
                            <input type="hidden" name="isLead" value={m.isLead ? "false" : "true"} />
                            <button className="rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100" title={m.isLead ? "Remove lead" : "Make lead"}>
                              {m.isLead ? "Unset lead" : "Make lead"}
                            </button>
                          </form>
                          <form action={removeTeamMember}>
                            <input type="hidden" name="teamId" value={team.id} />
                            <input type="hidden" name="userId" value={m.userId} />
                            <button className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600" title="Remove from team" aria-label={`Remove ${name}`}>
                              <UserMinus className="size-4" />
                            </button>
                          </form>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Upcoming deadlines" action={<Link href={`/tasks?view=scope&team=${team.id}&phase=open_all`} className="text-sm font-medium text-brand-700 hover:underline">All open</Link>} />
          {recent.length === 0 ? (
            <EmptyState title="No open tasks" />
          ) : (
            <ul className="divide-y divide-zinc-100">
              {recent.map((t) => (
                <li key={t.id}>
                  <Link href={`/tasks/${t.id}`} className="block px-5 py-3 hover:bg-zinc-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-zinc-400">{taskCode(t.number)}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    <p className="mt-0.5 truncate text-sm font-medium">{t.title}</p>
                    <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                      <span>{t.assignee ? t.assignee.employee?.name ?? t.assignee.username : "Unassigned"}</span>
                      <DueLabel dueDate={t.dueDate} status={t.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
