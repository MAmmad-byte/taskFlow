import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { buildTaskQuery, describeTaskFilters } from "@/lib/task-filters";
import { exportTable, type ExportColumn } from "@/lib/export/table";
import { badRequest, exportFormat } from "@/lib/export/respond";
import { PRIORITY_META, SOURCE_META, STATUS_META, TYPE_META, isOverdue, taskCode } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;

/** GET /api/export/tasks?format=xlsx|pdf&<same filters as the Tasks page> */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return badRequest("Not signed in", 401);
  const params = req.nextUrl.searchParams;
  const fmt = exportFormat(params.get("format"));
  if (!fmt) return badRequest("format must be xlsx or pdf");

  const get = (k: string) => params.get(k) ?? undefined;
  const { where } = buildTaskQuery(user, get);
  const tasks = await db.task.findMany({
    where,
    orderBy: [{ number: "desc" }],
    take: MAX_ROWS,
    include: {
      team: { select: { name: true } },
      application: { select: { name: true } },
      assignee: { select: { username: true, displayTitle: true, employee: { select: { name: true, employeeCode: true } } } },
      createdBy: { select: { username: true, employee: { select: { name: true } } } },
      completedByEmployee: { select: { name: true } },
    },
  });

  const now = new Date();
  const rows = tasks.map((t) => ({
    code: taskCode(t.number),
    title: t.title,
    status: STATUS_META[t.status].label,
    priority: PRIORITY_META[t.priority].label,
    type: TYPE_META[t.type].label,
    application: t.application?.name ?? "",
    team: t.team.name,
    assignee: t.assignee ? t.assignee.employee?.name ?? t.assignee.displayTitle ?? t.assignee.username : "Unassigned",
    seat: t.assignee?.username ?? "",
    employeeCode: t.assignee?.employee?.employeeCode ?? "",
    requester: t.requesterName ?? "",
    office: t.requesterOffice ?? "",
    contact: t.requesterContact ?? "",
    source: SOURCE_META[t.source].label,
    progress: t.progress / 100,
    createdAt: t.createdAt,
    startDate: t.startDate,
    dueDate: t.dueDate,
    completedAt: t.completedAt,
    completedBy: t.completedByEmployee?.name ?? "",
    closedAt: t.closedAt,
    overdue: isOverdue(t, now) ? "Yes" : "No",
    createdBy: t.createdBy.employee?.name ?? t.createdBy.username,
    description: t.description ?? "",
  }));

  const columns: ExportColumn[] = [
    { header: "Task No", key: "code", width: 12, pdf: 0.9 },
    { header: "Title", key: "title", width: 44, pdf: 2.8 },
    { header: "Status", key: "status", width: 16, pdf: 1.2 },
    { header: "Priority", key: "priority", width: 10, pdf: 0.8 },
    { header: "Type", key: "type", width: 14, pdf: false },
    { header: "Application", key: "application", width: 14, pdf: 1 },
    { header: "Team", key: "team", width: 18, pdf: 1.2 },
    { header: "Assignee", key: "assignee", width: 22, pdf: 1.4 },
    { header: "User", key: "seat", width: 14, pdf: false },
    { header: "Employee ID", key: "employeeCode", width: 13, pdf: false },
    { header: "Requested by", key: "requester", width: 18, pdf: false },
    { header: "Office", key: "office", width: 22, pdf: false },
    { header: "Contact", key: "contact", width: 16, pdf: false },
    { header: "Received via", key: "source", width: 13, pdf: false },
    { header: "Progress", key: "progress", width: 10, type: "percent", pdf: 0.85 },
    { header: "Logged on", key: "createdAt", width: 17, type: "datetime", pdf: false },
    { header: "Start date", key: "startDate", width: 13, type: "date", pdf: false },
    { header: "Due date", key: "dueDate", width: 13, type: "date", pdf: 1 },
    { header: "Completed", key: "completedAt", width: 13, type: "date", pdf: 1 },
    { header: "Completed by", key: "completedBy", width: 20, pdf: false },
    { header: "Closed on", key: "closedAt", width: 13, type: "date", pdf: false },
    { header: "Overdue", key: "overdue", width: 9, pdf: 0.8 },
    { header: "Logged by", key: "createdBy", width: 20, pdf: false },
    { header: "Description", key: "description", width: 60, pdf: false },
  ];

  const filters = describeTaskFilters(get);
  return exportTable(fmt, {
    title: "Task list",
    subtitle: [filters || "All tasks you can see", tasks.length === MAX_ROWS ? `first ${MAX_ROWS} rows` : ""].filter(Boolean).join(" · "),
    file: "tasks",
    generatedBy: user.displayName,
    columns,
    rows,
  });
}
