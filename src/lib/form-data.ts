import "server-only";
import { db } from "@/lib/db";
import { assignableTeamScope, supervisesTeam, type AuthUser } from "@/lib/auth";
import type { TeamOption } from "@/components/tasks/task-form";

/** Teams (with active members) the user may log tasks into. */
export async function teamOptionsFor(user: AuthUser): Promise<TeamOption[]> {
  const teams = await db.team.findMany({
    where: assignableTeamScope(user),
    orderBy: { name: "asc" },
    include: {
      members: {
        where: { user: { isActive: true } },
        include: { user: { select: { id: true, username: true, displayTitle: true, employee: { select: { name: true } } } } },
        orderBy: [{ isLead: "desc" }, { joinedAt: "asc" }],
      },
    },
  });
  return teams
    .filter((t) => user.teamIds.includes(t.id) || supervisesTeam(user, t))
    .map((t) => ({
      id: t.id,
      name: t.name,
      members: t.members.map((m) => ({
        id: m.user.id,
        name: `${m.user.employee?.name ?? m.user.displayTitle ?? m.user.username}${m.isLead ? " · Lead" : ""}`,
      })),
    }));
}

export async function activeApps() {
  return db.application.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}
