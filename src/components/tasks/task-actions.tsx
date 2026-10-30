"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addTaskNote, assignTask, updateTaskStatus } from "@/actions/tasks";
import { initialState } from "@/lib/action-result";
import { STATUS_META } from "@/lib/workflow";
import { ActionFeedback, Field, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@prisma/client";

export function StatusUpdateForm({
  taskId, current, options, progress,
}: { taskId: string; current: TaskStatus; options: TaskStatus[]; progress: number }) {
  const [state, action] = useActionState(updateTaskStatus, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [target, setTarget] = useState<TaskStatus>(current);
  const [pct, setPct] = useState(progress);
  // after a successful update the server sends new props — follow them
  useEffect(() => setTarget(current), [current]);
  useEffect(() => setPct(progress), [progress]);
  useEffect(() => {
    if (!state.ok) return;
    const note = formRef.current?.elements.namedItem("note");
    if (note instanceof HTMLTextAreaElement) note.value = "";
  }, [state]);
  const needsNote = target !== current && ["UAT_FAILED", "ON_HOLD", "CANCELLED"].includes(target);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <ActionFeedback state={state} formRef={formRef} />
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="status" value={target} />

      <div>
        <span className="field-label">Move to</span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setTarget(current)}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
              target === current ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-600 hover:border-zinc-300",
            )}
          >
            Keep “{STATUS_META[current].label}”
          </button>
          {options.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTarget(s)}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
                target === s
                  ? s === "CANCELLED" || s === "UAT_FAILED"
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-brand-700 bg-brand-700 text-white"
                  : "border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50",
              )}
              title={STATUS_META[s].description}
            >
              {STATUS_META[s].label}
            </button>
          ))}
        </div>
        {options.length === 0 && <p className="mt-2 text-xs text-zinc-500">No further status changes are available to you.</p>}
      </div>

      {!["COMPLETED", "DEPLOYED", "CLOSED", "CANCELLED"].includes(target) && (
        <div>
          <label htmlFor="progress" className="field-label flex justify-between">
            <span>Progress</span>
            <span className="tabular-nums text-zinc-500">{pct}%</span>
          </label>
          <input
            id="progress" name="progress" type="range" min={0} max={100} step={5} value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            className="w-full accent-brand-700"
          />
        </div>
      )}

      <Field label={needsNote ? "Reason (required)" : "Note"} name="note" error={state.fieldErrors?.note}>
        <Textarea name="note" rows={3} placeholder="What was done, what's next, who you spoke to…" required={needsNote} invalid={!!state.fieldErrors?.note} />
      </Field>
      <SubmitButton className="w-full">{target === current ? "Save progress" : `Move to ${STATUS_META[target].label}`}</SubmitButton>
    </form>
  );
}

export function NoteForm({ taskId }: { taskId: string }) {
  const [state, action] = useActionState(addTaskNote, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <ActionFeedback state={state} formRef={formRef} resetOnSuccess />
      <input type="hidden" name="taskId" value={taskId} />
      <div className="flex-1">
        <Textarea name="note" rows={2} placeholder="Add a comment or update…" className="min-h-0" required />
      </div>
      <SubmitButton variant="outline" pendingText="Posting…">Comment</SubmitButton>
    </form>
  );
}

export function AssignForm({
  taskId, currentAssigneeId, members,
}: { taskId: string; currentAssigneeId: string | null; members: { id: string; name: string }[] }) {
  const [state, action] = useActionState(assignTask, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={action} className="space-y-3">
      <ActionFeedback state={state} formRef={formRef} />
      <input type="hidden" name="taskId" value={taskId} />
      <Select name="assigneeId" defaultValue={currentAssigneeId ?? ""} aria-label="Assignee">
        <option value="">— Unassigned —</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </Select>
      <Textarea name="note" rows={2} placeholder="Handover note (optional)" className="min-h-0" />
      <SubmitButton variant="outline" className="w-full">Update assignment</SubmitButton>
    </form>
  );
}
