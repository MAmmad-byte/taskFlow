import type { Metadata } from "next";
import { can, requirePermission } from "@/lib/auth";
import { activeApps, teamOptionsFor } from "@/lib/form-data";
import { PageHeader, EmptyState, Card } from "@/components/ui/misc";
import { TaskForm } from "@/components/tasks/task-form";
import { UsersRound } from "lucide-react";

export const metadata: Metadata = { title: "New task" };

export default async function NewTaskPage() {
  const user = await requirePermission("task.create");
  const [teams, apps] = await Promise.all([teamOptionsFor(user), activeApps()]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Log a new task" description="Capture a request or complaint so it can be tracked to completion." />
      {teams.length === 0 ? (
        <Card>
          <EmptyState icon={UsersRound} title="You're not in a team yet" description="Ask your HOD to add you to a team before logging tasks." />
        </Card>
      ) : (
        <TaskForm
          teams={teams}
          apps={apps}
          currentUserId={user.id}
          canAssign={can(user, "task.assign")}
          values={{ teamId: user.teams[0]?.id }}
        />
      )}
    </div>
  );
}
