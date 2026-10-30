import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { TaskStatus } from "@prisma/client";
import {
  ArrowLeft, ArrowRightLeft, Check, CircleDot, MessageSquare, Pencil, CirclePlus, RefreshCw, Trash2,
} from "lucide-react";
import { db } from "@/lib/db";
import {
  canAssignTask, canDeleteTask, canEditTask, canMoveTo, canViewTask, requireUser, statusAuthority,
} from "@/lib/auth";
import { deleteTask } from "@/actions/tasks";
import { Avatar, Card, CardHeader, DescriptionList, ProgressBar } from "@/components/ui/misc";
import { LinkButton, Button } from "@/components/ui/button";
import { DueLabel, PriorityBadge, StatusBadge } from "@/components/tasks/badges";
import { AssignForm, NoteForm, StatusUpdateForm } from "@/components/tasks/task-actions";
import { SOURCE_META, STATUS_META, TRANSITIONS, TYPE_META, taskCode } from "@/lib/workflow";
import { cn, fmtDate, fmtDateTime, fromNow } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const t = await db.task.findUnique({ where: { id }, select: { number: true } });
  return { title: t ? taskCode(t.number) : "Task" };
}

const DEV_PATH: TaskStatus[] = ["NEW", "ASSIGNED", "IN_DEVELOPMENT", "TESTING", "PENDING_UAT", "READY_FOR_DEPLOYMENT", "DEPLOYED", "CLOSED"];
const OPS_PATH: TaskStatus[] = ["NEW", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CLOSED"];

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const task = await db.task.findUnique({
    where: { id },
    include: {
      team: {
        select: {
          id: true, name: true, departmentId: true,
          members: {
            where: { user: { isActive: true } },
            include: { user: { select: { id: true, username: true, displayTitle: true, employee: { select: { name: true } } } } },
          },
        },
      },
      application: true,
      assignee: { include: { employee: true } },
      createdBy: { include: { employee: true } },
      completedByEmployee: true,
      activities: {
        orderBy: { createdAt: "desc" },
        include: {
          actor: { select: { username: true, employee: { select: { name: true } } } },
          actorEmployee: { select: { name: true, employeeCode: true } },
        },
      },
    },
  });
  if (!task) notFound();
  if (!canViewTask(user, task)) redirect("/forbidden");

  const userName = (u: { username: string; displayTitle?: string | null; employee?: { name: string } | null } | null) =>
    u ? u.employee?.name ?? u.displayTitle ?? u.username : "—";
  // names for everyone who appears in the assignment history (they may have left the team since)
  const historyIds = [...new Set(task.activities.flatMap((a) => [a.fromAssigneeId, a.toAssigneeId]).filter((x): x is string => !!x))];
  const historyUsers = await db.user.findMany({
    where: { id: { in: historyIds } },
    select: { id: true, username: true, displayTitle: true, employee: { select: { name: true } } },
  });
  const names = new Map(historyUsers.map((u) => [u.id, userName(u)]));
  const nameOf = (uid: string | null) => (uid ? names.get(uid) ?? "a removed user" : "nobody");

  const authority = statusAuthority(user, task);
  const options = TRANSITIONS[task.status].filter((s) => canMoveTo(user, task, s));
  const isDevFlow =
    ["BUG", "FEATURE", "ENHANCEMENT"].includes(task.type) ||
    ["IN_DEVELOPMENT", "TESTING", "PENDING_UAT", "UAT_FAILED", "READY_FOR_DEPLOYMENT", "DEPLOYED"].includes(task.status);
  const path = isDevFlow ? DEV_PATH : OPS_PATH;
  const currentIdx = path.indexOf(task.status);
  const reachedIdx = currentIdx >= 0 ? currentIdx : Math.max(...task.activities.map((a) => (a.toStatus ? path.indexOf(a.toStatus) : -1)), 0);

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/tasks" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="size-4" /> All tasks
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-zinc-500">{taskCode(task.number)}</span>
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            <span className="text-zinc-300">·</span>
            <span className="text-zinc-500">{TYPE_META[task.type].label}</span>
          </div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">{task.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Logged {fromNow(task.createdAt)} by {userName(task.createdBy)} · via {SOURCE_META[task.source].label}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {canEditTask(user, task) && (
            <LinkButton href={`/tasks/${task.id}/edit`} variant="outline" size="sm"><Pencil /> Edit</LinkButton>
          )}
          {canDeleteTask(user, task) && (
            <form action={deleteTask}>
              <input type="hidden" name="taskId" value={task.id} />
              <Button type="submit" variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700"><Trash2 /> Delete</Button>
            </form>
          )}
        </div>
      </div>

      {/* Lifecycle stepper */}
      <Card className="mb-6 overflow-x-auto p-5">
        <ol className="flex min-w-[640px] items-center">
          {path.map((s, i) => {
            const done = i < reachedIdx || (i === reachedIdx && ["CLOSED"].includes(s) && task.status === "CLOSED");
            const current = s === task.status;
            return (
              <li key={s} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <span
                    className={cn(
                      "grid size-7 place-items-center rounded-full border-2 text-xs font-semibold",
                      current ? "border-brand-600 bg-brand-600 text-white ring-4 ring-brand-500/15"
                        : done ? "border-brand-600 bg-brand-50 text-brand-700" : "border-zinc-200 bg-white text-zinc-400",
                    )}
                  >
                    {done && !current ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className={cn("whitespace-nowrap text-[11px] font-medium", current ? "text-brand-800" : done ? "text-zinc-700" : "text-zinc-400")}>
                    {STATUS_META[s].label}
                  </span>
                </div>
                {i < path.length - 1 && <span className={cn("mx-2 mb-5 h-0.5 flex-1 rounded", i < reachedIdx ? "bg-brand-500" : "bg-zinc-200")} />}
              </li>
            );
          })}
        </ol>
        {!path.includes(task.status) && (
          <p className="mt-3 text-xs text-zinc-500">
            Currently <span className="font-medium text-zinc-700">{STATUS_META[task.status].label}</span> — {STATUS_META[task.status].description.toLowerCase()}.
          </p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Description" />
            <div className="whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed text-zinc-700">
              {task.description || <span className="text-zinc-400">No description provided.</span>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Activity & history" description="Every status change, assignment and note — with who did it" />
            <div className="border-b border-zinc-100 px-5 py-4">
              <NoteForm taskId={task.id} />
            </div>
            <ol className="relative px-5 py-4">
              {task.activities.map((a, i) => {
                const who = a.actorEmployee?.name ?? a.actor.employee?.name ?? a.actor.username;
                const Icon = a.type === "CREATED" ? CirclePlus : a.type === "ASSIGNED" ? ArrowRightLeft : a.type === "COMMENT" ? MessageSquare : a.type === "UPDATED" ? RefreshCw : CircleDot;
                return (
                  <li key={a.id} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < task.activities.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-zinc-200" />}
                    <span className={cn(
                      "relative z-10 grid size-7 shrink-0 place-items-center rounded-full ring-4 ring-white",
                      a.type === "STATUS_CHANGE" ? "bg-brand-50 text-brand-700" : a.type === "COMMENT" ? "bg-blue-50 text-blue-600" : "bg-zinc-100 text-zinc-600",
                    )}>
                      <Icon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-sm text-zinc-700">
                        <span className="font-medium text-zinc-900">{who}</span>{" "}
                        {a.type === "CREATED" && "logged this task"}
                        {a.type === "COMMENT" && (a.progress !== null ? <>updated progress to <b>{a.progress}%</b></> : "commented")}
                        {a.type === "UPDATED" && (a.note ?? "updated details")}
                        {a.type === "ASSIGNED" && (
                          <>assigned it {a.fromAssigneeId ? <>from <b>{nameOf(a.fromAssigneeId)}</b> </> : null}to <b>{nameOf(a.toAssigneeId)}</b></>
                        )}
                        {a.type === "STATUS_CHANGE" && a.fromStatus && a.toStatus && (
                          <>moved <StatusBadge status={a.fromStatus} /> → <StatusBadge status={a.toStatus} /></>
                        )}
                      </p>
                      {a.note && a.type !== "UPDATED" && a.type !== "CREATED" && (
                        <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">{a.note}</p>
                      )}
                      <p className="mt-1 text-xs text-zinc-400" title={fmtDateTime(a.createdAt)}>
                        {fmtDateTime(a.createdAt)} · {fromNow(a.createdAt)}
                        {a.actorEmployee && <> · {a.actorEmployee.employeeCode}</>}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          {authority !== "none" && (
            <Card>
              <CardHeader title="Update status" description={authority === "full" ? "You supervise this team" : "You're the assignee"} />
              <div className="p-5">
                <StatusUpdateForm taskId={task.id} current={task.status} options={options} progress={task.progress} />
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Details" />
            <div className="px-5 pt-4">
              <div className="mb-1 flex justify-between text-xs text-zinc-500"><span>Progress</span><span className="tabular-nums">{task.progress}%</span></div>
              <ProgressBar value={task.progress} />
            </div>
            <div className="py-2">
              <DescriptionList
                items={[
                  {
                    label: "Assignee",
                    value: task.assignee ? (
                      <span className="inline-flex items-center gap-2">
                        <Avatar name={userName(task.assignee)} size="sm" />
                        <span>
                          {userName(task.assignee)}
                          <span className="block text-xs font-normal text-zinc-500">@{task.assignee.username}{task.assignee.employee ? ` · ${task.assignee.employee.employeeCode}` : ""}</span>
                        </span>
                      </span>
                    ) : <span className="text-amber-700">Unassigned</span>,
                  },
                  { label: "Team", value: <Link href={`/teams/${task.team.id}`} className="hover:underline">{task.team.name}</Link> },
                  {
                    label: "Application",
                    value: task.application ? (
                      <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: task.application.color }} />{task.application.name}</span>
                    ) : "—",
                  },
                  { label: "Due", value: <span className="flex flex-col items-end">{fmtDate(task.dueDate)}{task.dueDate && <DueLabel dueDate={task.dueDate} status={task.status} />}</span> },
                  { label: "Started", value: fmtDate(task.startDate) },
                  { label: "Completed", value: task.completedAt ? `${fmtDate(task.completedAt)}${task.completedByEmployee ? ` · ${task.completedByEmployee.name}` : ""}` : "—" },
                  { label: "Closed", value: fmtDate(task.closedAt) },
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Requester" />
            <div className="py-2">
              <DescriptionList
                items={[
                  { label: "Name", value: task.requesterName ?? "—" },
                  { label: "Office", value: task.requesterOffice ?? "—" },
                  { label: "Contact", value: task.requesterContact ?? "—" },
                  { label: "Received via", value: SOURCE_META[task.source].label },
                ]}
              />
            </div>
          </Card>

          {canAssignTask(user, task) && (
            <Card>
              <CardHeader title="Assignment" description="Hand over to another team member" />
              <div className="p-5">
                <AssignForm
                  taskId={task.id}
                  currentAssigneeId={task.assigneeId}
                  members={task.team.members.map((m) => ({ id: m.user.id, name: `${userName(m.user)}${m.isLead ? " · Lead" : ""}` }))}
                />
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
