import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, canEditTask, requireUser } from "@/lib/auth";
import { activeApps, teamOptionsFor } from "@/lib/form-data";
import { PageHeader } from "@/components/ui/misc";
import { TaskForm } from "@/components/tasks/task-form";
import { taskCode } from "@/lib/workflow";
import { toDateInput } from "@/lib/utils";

export const metadata: Metadata = { title: "Edit task" };

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const task = await db.task.findUnique({ where: { id }, include: { team: { select: { id: true, departmentId: true, name: true } } } });
  if (!task) notFound();
  if (!canEditTask(user, task)) redirect("/forbidden");

  const [teams, apps] = await Promise.all([teamOptionsFor(user), activeApps()]);
  // make sure the task's current team is always selectable
  if (!teams.some((t) => t.id === task.teamId)) teams.unshift({ id: task.team.id, name: task.team.name, members: [] });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`Edit ${taskCode(task.number)}`} description={task.title} />
      <TaskForm
        mode="edit"
        teams={teams}
        apps={apps}
        currentUserId={user.id}
        canAssign={can(user, "task.assign")}
        values={{
          id: task.id, title: task.title, description: task.description, type: task.type, priority: task.priority,
          source: task.source, requesterName: task.requesterName, requesterContact: task.requesterContact,
          requesterOffice: task.requesterOffice, applicationId: task.applicationId, teamId: task.teamId,
          startDate: toDateInput(task.startDate), dueDate: toDateInput(task.dueDate),
        }}
      />
    </div>
  );
}
