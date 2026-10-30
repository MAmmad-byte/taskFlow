"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import {
  can, canAssignTask, canDeleteTask, canEditTask, canMoveTo, canViewTask, requireUser,
  supervisesTeam, statusAuthority, type AuthUser,
} from "@/lib/auth";
import { fail, formObject, success, zodFail, type ActionState } from "@/lib/action-result";
import { assignSchema, commentSchema, statusUpdateSchema, taskSchema } from "@/lib/validators";
import { DONE_STATUSES, STATUS_META, TRANSITIONS, taskCode } from "@/lib/workflow";
import { notify } from "@/lib/audit";

async function loadTask(id: string) {
  return db.task.findUnique({
    where: { id },
    include: {
      team: { select: { id: true, name: true, departmentId: true, members: { where: { isLead: true }, select: { userId: true } } } },
      assignee: { select: { id: true, employeeId: true } },
    },
  });
}

/** Is `userId` an active member of `teamId`? */
async function isTeamMember(teamId: string, userId: string) {
  const m = await db.teamMembership.findUnique({
    where: { teamId_userId: { teamId, userId } },
    include: { user: { select: { isActive: true } } },
  });
  return !!m && m.user.isActive;
}

function canLogIntoTeam(me: AuthUser, team: { id: string; departmentId: string }) {
  return me.teamIds.includes(team.id) || supervisesTeam(me, team);
}

// ───────────────────────── create ─────────────────────────

export async function createTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireUser();
  if (!can(me, "task.create")) return fail("You don't have permission to create tasks.");

  const parsed = taskSchema.safeParse(formObject(formData));
  if (!parsed.success) return zodFail(parsed.error);
  const data = parsed.data;

  const team = await db.team.findUnique({ where: { id: data.teamId } });
  if (!team || !team.isActive) return fail("Team not found.", { teamId: "Choose a team" });
  if (!canLogIntoTeam(me, team)) return fail("You can only log tasks for your own teams.", { teamId: "Not your team" });

  if (data.assigneeId) {
    if (data.assigneeId !== me.id && !can(me, "task.assign"))
      return fail("You can only assign tasks to yourself.", { assigneeId: "Not allowed" });
    if (!(await isTeamMember(team.id, data.assigneeId)))
      return fail("The assignee must be a member of the selected team.", { assigneeId: "Not in this team" });
  }
  if (data.dueDate && data.startDate && data.dueDate < data.startDate)
    return fail("Due date cannot be before the start date.", { dueDate: "Before start date" });

  const status: TaskStatus = data.assigneeId ? "ASSIGNED" : "NEW";
  const task = await db.task.create({
    data: {
      title: data.title, description: data.description, type: data.type, priority: data.priority,
      source: data.source, requesterName: data.requesterName, requesterContact: data.requesterContact,
      requesterOffice: data.requesterOffice, applicationId: data.applicationId || null, teamId: team.id,
      assigneeId: data.assigneeId || null, createdById: me.id, status,
      startDate: data.startDate, dueDate: data.dueDate,
      activities: {
        create: [
          { type: "CREATED", toStatus: "NEW", actorUserId: me.id, actorEmployeeId: me.employee?.id, note: "Task logged" },
          ...(data.assigneeId
            ? [{
                type: "ASSIGNED" as const, fromStatus: "NEW" as const, toStatus: "ASSIGNED" as const,
                toAssigneeId: data.assigneeId, actorUserId: me.id, actorEmployeeId: me.employee?.id,
              }]
            : []),
        ],
      },
    },
  });

  if (data.assigneeId) {
    await notify([data.assigneeId], {
      title: `New task assigned: ${taskCode(task.number)}`,
      body: task.title,
      link: `/tasks/${task.id}`,
    }, me.id);
  }

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  redirect(`/tasks/${task.id}?created=1`);
}

// ───────────────────────── edit ─────────────────────────

export async function updateTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireUser();
  const id = String(formData.get("taskId") ?? "");
  const task = await loadTask(id);
  if (!task) return fail("Task not found.");
  if (!canEditTask(me, task)) return fail("You don't have permission to edit this task.");

  const parsed = taskSchema.omit({ assigneeId: true }).safeParse(formObject(formData));
  if (!parsed.success) return zodFail(parsed.error);
  const data = parsed.data;

  if (data.teamId !== task.teamId) {
    const team = await db.team.findUnique({ where: { id: data.teamId } });
    if (!team || !supervisesTeam(me, team)) return fail("You can't move this task to that team.", { teamId: "Not allowed" });
  }
  if (data.dueDate && data.startDate && data.dueDate < data.startDate)
    return fail("Due date cannot be before the start date.", { dueDate: "Before start date" });

  const movedTeam = data.teamId !== task.teamId;
  const changes: string[] = [];
  if (task.dueDate?.getTime() !== data.dueDate?.getTime()) changes.push("due date");
  if (task.priority !== data.priority) changes.push("priority");
  if (task.title !== data.title) changes.push("title");
  if (movedTeam) changes.push("team");

  await db.task.update({
    where: { id },
    data: {
      title: data.title, description: data.description ?? null, type: data.type, priority: data.priority,
      source: data.source, requesterName: data.requesterName ?? null, requesterContact: data.requesterContact ?? null,
      requesterOffice: data.requesterOffice ?? null, applicationId: data.applicationId || null,
      teamId: data.teamId, startDate: data.startDate, dueDate: data.dueDate,
      // the assignee must belong to the team; moving teams clears it
      ...(movedTeam ? { assigneeId: null } : {}),
      activities: {
        create: {
          type: "UPDATED", actorUserId: me.id, actorEmployeeId: me.employee?.id,
          note: changes.length ? `Updated ${changes.join(", ")}` : "Details updated",
        },
      },
    },
  });

  revalidatePath(`/tasks/${id}`);
  revalidatePath("/tasks");
  return success("Task updated.");
}

// ───────────────────────── status ─────────────────────────

export async function updateTaskStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireUser();
  const parsed = statusUpdateSchema.safeParse(formObject(formData));
  if (!parsed.success) return zodFail(parsed.error);
  const { taskId, status, note, progress } = parsed.data;

  const task = await loadTask(taskId);
  if (!task) return fail("Task not found.");
  if (statusAuthority(me, task) === "none")
    return fail("Only the assignee or the team lead can change this task's status.");
  if (status === task.status && progress === undefined) return fail("Choose a new status.");
  if (status !== task.status) {
    if (!TRANSITIONS[task.status].includes(status))
      return fail(`A task can't move from “${STATUS_META[task.status].label}” to “${STATUS_META[status].label}”.`);
    if (!canMoveTo(me, task, status))
      return fail("Only a team lead can close, cancel or reopen tasks.");
  }
  if (["UAT_FAILED", "ON_HOLD", "CANCELLED"].includes(status) && status !== task.status && !note)
    return fail("Please add a note explaining why.", { note: "Required for this status" });

  const nowDone = DONE_STATUSES.includes(status);
  const wasDone = DONE_STATUSES.includes(task.status);
  const now = new Date();
  const finalProgress = nowDone ? 100 : status === "CANCELLED" ? task.progress : progress ?? task.progress;

  // completion credit goes to the employee currently on the assignee's seat
  const creditEmployeeId = task.assignee?.employeeId ?? me.employee?.id ?? null;

  await db.task.update({
    where: { id: taskId },
    data: {
      status,
      progress: finalProgress,
      startDate: task.startDate ?? (["IN_PROGRESS", "IN_DEVELOPMENT"].includes(status) ? now : undefined),
      completedAt: nowDone && !wasDone ? now : !nowDone && status !== "CLOSED" ? null : undefined,
      completedByEmployeeId: nowDone && !wasDone ? creditEmployeeId : !nowDone ? null : undefined,
      closedAt: status === "CLOSED" ? now : task.status === "CLOSED" ? null : undefined,
      activities: {
        create: {
          type: status === task.status ? "COMMENT" : "STATUS_CHANGE",
          fromStatus: task.status, toStatus: status, note, progress: finalProgress,
          actorUserId: me.id, actorEmployeeId: me.employee?.id,
        },
      },
    },
  });

  if (status !== task.status) {
    const leads = task.team.members.map((m) => m.userId);
    const recipients = ["PENDING_UAT", "READY_FOR_DEPLOYMENT", "COMPLETED", "DEPLOYED"].includes(status)
      ? [task.assigneeId, task.createdById, ...leads]
      : [task.assigneeId, task.createdById];
    await notify(recipients, {
      title: `${taskCode(task.number)} → ${STATUS_META[status].label}`,
      body: note ? `${task.title} — ${note}` : task.title,
      link: `/tasks/${task.id}`,
    }, me.id);
  }

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return success(status === task.status ? "Progress updated." : `Status changed to ${STATUS_META[status].label}.`);
}

// ───────────────────────── comment / progress note ─────────────────────────

export async function addTaskNote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireUser();
  const parsed = commentSchema.safeParse(formObject(formData));
  if (!parsed.success) return zodFail(parsed.error);
  const { taskId, note, progress } = parsed.data;

  const task = await loadTask(taskId);
  if (!task || !canViewTask(me, task)) return fail("Task not found.");
  const mayUpdateProgress = statusAuthority(me, task) !== "none";

  await db.task.update({
    where: { id: taskId },
    data: {
      ...(mayUpdateProgress && progress !== undefined ? { progress } : {}),
      activities: {
        create: {
          type: "COMMENT", note, progress: mayUpdateProgress ? progress : undefined,
          actorUserId: me.id, actorEmployeeId: me.employee?.id,
        },
      },
    },
  });
  await notify([task.assigneeId, task.createdById], {
    title: `New note on ${taskCode(task.number)}`, body: note.slice(0, 140), link: `/tasks/${task.id}`,
  }, me.id);

  revalidatePath(`/tasks/${taskId}`);
  return success("Note added.");
}

// ───────────────────────── assignment ─────────────────────────

export async function assignTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireUser();
  const parsed = assignSchema.safeParse(formObject(formData));
  if (!parsed.success) return zodFail(parsed.error);
  const { taskId, assigneeId, note } = parsed.data;

  const task = await loadTask(taskId);
  if (!task) return fail("Task not found.");
  if (!canAssignTask(me, task)) return fail("You don't have permission to reassign this task.");
  if ((assigneeId ?? null) === task.assigneeId) return fail("That person is already assigned.");
  if (assigneeId && !(await isTeamMember(task.teamId, assigneeId)))
    return fail("The assignee must be an active member of this task's team.");

  const nextStatus: TaskStatus | undefined =
    assigneeId && task.status === "NEW" ? "ASSIGNED" : !assigneeId && task.status === "ASSIGNED" ? "NEW" : undefined;

  await db.task.update({
    where: { id: taskId },
    data: {
      assigneeId: assigneeId ?? null,
      ...(nextStatus ? { status: nextStatus } : {}),
      activities: {
        create: {
          type: "ASSIGNED", fromAssigneeId: task.assigneeId, toAssigneeId: assigneeId ?? null, note,
          fromStatus: nextStatus ? task.status : undefined, toStatus: nextStatus,
          actorUserId: me.id, actorEmployeeId: me.employee?.id,
        },
      },
    },
  });

  await notify([assigneeId], {
    title: `Task assigned to you: ${taskCode(task.number)}`, body: task.title, link: `/tasks/${task.id}`,
  }, me.id);
  if (task.assigneeId && task.assigneeId !== assigneeId) {
    await notify([task.assigneeId], {
      title: `${taskCode(task.number)} was reassigned`, body: task.title, link: `/tasks/${task.id}`,
    }, me.id);
  }

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  return success(assigneeId ? "Task assigned." : "Task unassigned.");
}

// ───────────────────────── delete ─────────────────────────

export async function deleteTask(formData: FormData) {
  const me = await requireUser();
  const id = String(formData.get("taskId") ?? "");
  const task = await loadTask(id);
  if (!task || !canDeleteTask(me, task)) redirect("/forbidden");
  await db.task.delete({ where: { id } });
  revalidatePath("/tasks");
  redirect("/tasks?deleted=1");
}
