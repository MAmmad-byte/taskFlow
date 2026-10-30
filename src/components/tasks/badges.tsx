import type { TaskPriority, TaskStatus } from "@prisma/client";
import { TriangleAlert, ArrowDown, ArrowUp, ChevronsUp, Minus } from "lucide-react";
import { Badge } from "@/components/ui/misc";
import { PRIORITY_META, STATUS_META, isOverdue } from "@/lib/workflow";
import { cn, fromNow } from "@/lib/utils";

export function StatusBadge({ status }: { status: TaskStatus }) {
  const m = STATUS_META[status];
  return (
    <Badge tone={m.tone} dot>
      {m.label}
    </Badge>
  );
}

const priorityIcon = { LOW: ArrowDown, MEDIUM: Minus, HIGH: ArrowUp, CRITICAL: ChevronsUp };

export function PriorityBadge({ priority, compact }: { priority: TaskPriority; compact?: boolean }) {
  const m = PRIORITY_META[priority];
  const Icon = priorityIcon[priority];
  const color = { LOW: "text-slate-500", MEDIUM: "text-blue-600", HIGH: "text-orange-600", CRITICAL: "text-red-600" }[priority];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", color)} title={`${m.label} priority`}>
      <Icon className="size-3.5" />
      {!compact && m.label}
    </span>
  );
}

export function DueLabel({ dueDate, status }: { dueDate: Date | null; status: TaskStatus }) {
  if (!dueDate) return <span className="text-xs text-zinc-400">No due date</span>;
  const overdue = isOverdue({ dueDate, status });
  const soon = !overdue && dueDate.getTime() - Date.now() < 48 * 3600_000 && !["DEPLOYED", "COMPLETED", "CLOSED", "CANCELLED"].includes(status);
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs", overdue ? "font-medium text-red-600" : soon ? "font-medium text-amber-700" : "text-zinc-500")}
      title={dueDate.toLocaleString()}
    >
      {overdue && <TriangleAlert className="size-3.5" />}
      {overdue ? `Overdue ${fromNow(dueDate).replace(" ago", "")}` : `Due ${fromNow(dueDate)}`}
    </span>
  );
}
