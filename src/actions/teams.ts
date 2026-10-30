"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, canManageTeam, requireUser, scopeLevel } from "@/lib/auth";
import { fail, formObject, success, zodFail, type ActionState } from "@/lib/action-result";
import { teamSchema } from "@/lib/validators";
import { audit, notify } from "@/lib/audit";

export async function createTeam(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireUser();
  if (!can(me, "team.manage")) return fail("You don't have permission to create teams.");
  const parsed = teamSchema.safeParse(formObject(formData));
  if (!parsed.success) return zodFail(parsed.error);

  // HODs always create inside their own department
  const departmentId = scopeLevel(me) === "all" ? parsed.data.departmentId ?? me.departmentId : me.departmentId;
  if (!departmentId) return fail("Choose a department.", { departmentId: "Required" });

  if (await db.team.findUnique({ where: { code: parsed.data.code } }))
    return fail("A team with this code already exists.", { code: "Already used" });

  const team = await db.team.create({
    data: { name: parsed.data.name, code: parsed.data.code, description: parsed.data.description, departmentId },
  });
  await audit(me.id, "team.create", "Team", team.id, { name: team.name });
  revalidatePath("/teams");
  redirect(`/teams/${team.id}`);
}

export async function updateTeam(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireUser();
  const teamId = String(formData.get("teamId") ?? "");
  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team || !canManageTeam(me, team)) return fail("You don't have permission to edit this team.");

  const parsed = teamSchema.safeParse(formObject(formData));
  if (!parsed.success) return zodFail(parsed.error);
  const clash = await db.team.findFirst({ where: { code: parsed.data.code, NOT: { id: teamId } } });
  if (clash) return fail("A team with this code already exists.", { code: "Already used" });

  await db.team.update({
    where: { id: teamId },
    data: {
      name: parsed.data.name, code: parsed.data.code, description: parsed.data.description ?? null,
      isActive: formData.get("isActive") === "on",
    },
  });
  await audit(me.id, "team.update", "Team", teamId, { name: parsed.data.name });
  revalidatePath(`/teams/${teamId}`);
  revalidatePath("/teams");
  return success("Team saved.");
}

export async function addTeamMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireUser();
  const teamId = String(formData.get("teamId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const isLead = formData.get("isLead") === "on";
  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team || !canManageTeam(me, team, "team.members.manage")) return fail("You can't manage this team's members.");
  if (!userId) return fail("Choose a user.", { userId: "Required" });

  const user = await db.user.findUnique({ where: { id: userId }, include: { employee: true } });
  if (!user || !user.isActive) return fail("User not found or inactive.");
  const userDept = user.departmentId ?? user.employee?.departmentId;
  if (scopeLevel(me) !== "all" && userDept !== team.departmentId)
    return fail("Only users from this department can join the team.");

  await db.teamMembership.upsert({
    where: { teamId_userId: { teamId, userId } },
    update: { isLead },
    create: { teamId, userId, isLead },
  });
  await audit(me.id, "team.member.add", "Team", teamId, { userId, isLead });
  await notify([userId], { title: `You were added to ${team.name}`, link: `/teams/${teamId}` }, me.id);
  revalidatePath(`/teams/${teamId}`);
  return success("Member added.");
}

export async function setTeamLead(formData: FormData) {
  const me = await requireUser();
  const teamId = String(formData.get("teamId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const isLead = formData.get("isLead") === "true";
  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team || !canManageTeam(me, team, "team.members.manage")) redirect("/forbidden");
  await db.teamMembership.update({ where: { teamId_userId: { teamId, userId } }, data: { isLead } });
  await audit(me.id, isLead ? "team.lead.set" : "team.lead.unset", "Team", teamId, { userId });
  revalidatePath(`/teams/${teamId}`);
}

export async function removeTeamMember(formData: FormData) {
  const me = await requireUser();
  const teamId = String(formData.get("teamId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team || !canManageTeam(me, team, "team.members.manage")) redirect("/forbidden");
  await db.teamMembership.delete({ where: { teamId_userId: { teamId, userId } } });
  await audit(me.id, "team.member.remove", "Team", teamId, { userId });
  revalidatePath(`/teams/${teamId}`);
}
