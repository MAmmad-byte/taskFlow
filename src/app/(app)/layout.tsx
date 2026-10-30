import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildNav } from "@/lib/nav";
import { getDeadlineAlerts } from "@/lib/queries";
import { taskCode } from "@/lib/workflow";
import { AppShell } from "@/components/layout/app-shell";
import { DeadlineAlert, type AlertTask } from "@/components/alerts/deadline-alert";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Force a password change before anything else
  const path = (await headers()).get("x-pathname") ?? "";
  if (user.mustChangePassword && path && !path.startsWith("/profile")) redirect("/profile?first=1");

  const [notifications, unread, alerts] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 12 }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    getDeadlineAlerts(user),
  ]);

  const toAlert = (t: (typeof alerts.overdue)[number]): AlertTask => ({
    id: t.id,
    code: taskCode(t.number),
    title: t.title,
    dueDate: t.dueDate!.toISOString(),
    team: t.team.name,
    assignee: t.assignee ? t.assignee.employee?.name ?? t.assignee.username : null,
    mine: t.assigneeId === user.id,
  });

  return (
    <AppShell
      nav={buildNav(user)}
      user={{ name: user.displayName, username: user.username, role: user.role.name, department: user.departmentName }}
      notifications={notifications.map((n) => ({
        id: n.id, title: n.title, body: n.body, link: n.link, createdAt: n.createdAt.toISOString(), read: !!n.readAt,
      }))}
      unread={unread}
      appName={process.env.NEXT_PUBLIC_APP_NAME ?? "TaskFlow"}
      orgName={process.env.NEXT_PUBLIC_ORG_NAME ?? "IT Services"}
    >
      {children}
      <Suspense>
        <DeadlineAlert
          overdue={alerts.overdue.map(toAlert)}
          today={alerts.today.map(toAlert)}
          soon={alerts.soon.map(toAlert)}
          hours={alerts.hours}
        />
      </Suspense>
    </AppShell>
  );
}
