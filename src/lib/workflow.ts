import type { TaskStatus, TaskPriority, TaskType, RequestSource } from "@prisma/client";

/**
 * Task lifecycle. Operational/support work typically goes
 *   NEW → ASSIGNED → IN_PROGRESS → COMPLETED → CLOSED
 * while development work follows the SDLC
 *   NEW → ASSIGNED → IN_DEVELOPMENT → TESTING → PENDING_UAT → READY_FOR_DEPLOYMENT → DEPLOYED → CLOSED
 * with UAT_FAILED looping back into development.
 */

export type Phase = "open" | "active" | "review" | "done" | "cancelled";

export const STATUS_META: Record<
  TaskStatus,
  { label: string; phase: Phase; tone: Tone; description: string }
> = {
  NEW: { label: "New", phase: "open", tone: "slate", description: "Logged, not yet picked up" },
  ASSIGNED: { label: "Assigned", phase: "open", tone: "blue", description: "Assigned to a team member" },
  IN_PROGRESS: { label: "In progress", phase: "active", tone: "amber", description: "Being worked on" },
  ON_HOLD: { label: "On hold", phase: "open", tone: "zinc", description: "Waiting on the requester or a dependency" },
  IN_DEVELOPMENT: { label: "In development", phase: "active", tone: "orange", description: "Code changes under way" },
  TESTING: { label: "Testing", phase: "review", tone: "violet", description: "Internal QA" },
  PENDING_UAT: { label: "Pending UAT", phase: "review", tone: "purple", description: "Waiting for user acceptance" },
  UAT_FAILED: { label: "UAT failed", phase: "active", tone: "red", description: "Rejected in UAT, back to development" },
  READY_FOR_DEPLOYMENT: { label: "Ready to deploy", phase: "review", tone: "cyan", description: "UAT approved, awaiting release" },
  DEPLOYED: { label: "Deployed", phase: "done", tone: "teal", description: "Released to production" },
  COMPLETED: { label: "Completed", phase: "done", tone: "emerald", description: "Work done" },
  CLOSED: { label: "Closed", phase: "done", tone: "green", description: "Signed off by the team lead" },
  CANCELLED: { label: "Cancelled", phase: "cancelled", tone: "zinc", description: "Not going ahead" },
};

export const STATUS_ORDER: TaskStatus[] = [
  "NEW", "ASSIGNED", "IN_PROGRESS", "ON_HOLD", "IN_DEVELOPMENT", "TESTING", "PENDING_UAT",
  "UAT_FAILED", "READY_FOR_DEPLOYMENT", "DEPLOYED", "COMPLETED", "CLOSED", "CANCELLED",
];

export const DONE_STATUSES: TaskStatus[] = ["DEPLOYED", "COMPLETED", "CLOSED"];
export const TERMINAL_STATUSES: TaskStatus[] = ["DEPLOYED", "COMPLETED", "CLOSED", "CANCELLED"];
export const OPEN_STATUSES: TaskStatus[] = STATUS_ORDER.filter((s) => !TERMINAL_STATUSES.includes(s));

/** Statuses that need the task.close permission to move INTO. */
export const RESTRICTED_TARGETS: TaskStatus[] = ["CLOSED", "CANCELLED"];
/** Statuses that need the task.close permission to move OUT OF (reopen). */
export const RESTRICTED_SOURCES: TaskStatus[] = ["CLOSED", "CANCELLED"];

export const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  NEW: ["ASSIGNED", "IN_PROGRESS", "IN_DEVELOPMENT", "ON_HOLD", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "IN_DEVELOPMENT", "ON_HOLD", "CANCELLED"],
  IN_PROGRESS: ["ON_HOLD", "IN_DEVELOPMENT", "TESTING", "PENDING_UAT", "COMPLETED", "CANCELLED"],
  ON_HOLD: ["IN_PROGRESS", "IN_DEVELOPMENT", "CANCELLED"],
  IN_DEVELOPMENT: ["TESTING", "PENDING_UAT", "ON_HOLD", "COMPLETED", "CANCELLED"],
  TESTING: ["IN_DEVELOPMENT", "PENDING_UAT", "READY_FOR_DEPLOYMENT", "COMPLETED"],
  PENDING_UAT: ["UAT_FAILED", "READY_FOR_DEPLOYMENT", "COMPLETED", "ON_HOLD"],
  UAT_FAILED: ["IN_DEVELOPMENT", "ON_HOLD", "CANCELLED"],
  READY_FOR_DEPLOYMENT: ["DEPLOYED", "IN_DEVELOPMENT"],
  DEPLOYED: ["CLOSED", "IN_DEVELOPMENT"],
  COMPLETED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: ["IN_PROGRESS", "IN_DEVELOPMENT"],
  CANCELLED: ["NEW"],
};

export const PHASE_META: Record<Exclude<Phase, "cancelled">, { label: string; color: string }> = {
  // Validated categorical palette (CVD-safe adjacent order)
  open: { label: "Open", color: "#2a78d6" },
  active: { label: "In progress", color: "#eb6834" },
  review: { label: "Testing & UAT", color: "#6250d6" },
  done: { label: "Done", color: "#1baf7a" },
};

export const PRIORITY_META: Record<TaskPriority, { label: string; tone: Tone; rank: number }> = {
  LOW: { label: "Low", tone: "slate", rank: 1 },
  MEDIUM: { label: "Medium", tone: "blue", rank: 2 },
  HIGH: { label: "High", tone: "orange", rank: 3 },
  CRITICAL: { label: "Critical", tone: "red", rank: 4 },
};

export const TYPE_META: Record<TaskType, { label: string }> = {
  BUG: { label: "Bug fix" },
  FEATURE: { label: "New feature" },
  ENHANCEMENT: { label: "Enhancement" },
  OPERATIONAL: { label: "Operational" },
  SUPPORT: { label: "Support" },
  DATA_FIX: { label: "Data fix" },
  REPORT: { label: "Report" },
};

export const SOURCE_META: Record<RequestSource, { label: string }> = {
  VERBAL: { label: "Verbal" },
  WHATSAPP: { label: "WhatsApp" },
  EMAIL: { label: "Email" },
  CALL: { label: "Phone call" },
  LETTER: { label: "Letter / note" },
  MEETING: { label: "Meeting" },
  OTHER: { label: "Other" },
};

export type Tone =
  | "slate" | "zinc" | "blue" | "amber" | "orange" | "violet" | "purple"
  | "red" | "cyan" | "teal" | "emerald" | "green";

export function isDone(status: TaskStatus) {
  return DONE_STATUSES.includes(status);
}

export function isOverdue(task: { dueDate: Date | null; status: TaskStatus }, now = new Date()) {
  return !!task.dueDate && !TERMINAL_STATUSES.includes(task.status) && task.dueDate < now;
}

export function taskCode(n: number) {
  return `TSK-${String(n).padStart(5, "0")}`;
}
