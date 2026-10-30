"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { createTask, updateTask } from "@/actions/tasks";
import { initialState } from "@/lib/action-result";
import { PRIORITY_META, SOURCE_META, TYPE_META } from "@/lib/workflow";
import { ActionFeedback, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TeamOption = { id: string; name: string; members: { id: string; name: string }[] };
export type TaskFormValues = {
  id?: string; title?: string; description?: string | null; type?: string; priority?: string; source?: string;
  requesterName?: string | null; requesterContact?: string | null; requesterOffice?: string | null;
  applicationId?: string | null; teamId?: string; assigneeId?: string | null; startDate?: string; dueDate?: string;
};

const SOURCE_ICONS: Record<string, string> = { VERBAL: "🗣️", WHATSAPP: "💬", EMAIL: "✉️", CALL: "📞", LETTER: "📄", MEETING: "👥", OTHER: "•" };

export function TaskForm({
  teams, apps, currentUserId, canAssign, values, mode = "create",
}: {
  teams: TeamOption[]; apps: { id: string; name: string }[]; currentUserId: string; canAssign: boolean;
  values?: TaskFormValues; mode?: "create" | "edit";
}) {
  const [state, action] = useActionState(mode === "create" ? createTask : updateTask, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [teamId, setTeamId] = useState(values?.teamId ?? teams[0]?.id ?? "");
  const [source, setSource] = useState(values?.source ?? "VERBAL");
  const [priority, setPriority] = useState(values?.priority ?? "MEDIUM");
  const members = useMemo(() => teams.find((t) => t.id === teamId)?.members ?? [], [teams, teamId]);
  const fe = state.fieldErrors ?? {};

  return (
    <form ref={formRef} action={action} className="space-y-6">
      <ActionFeedback state={state} />
      {values?.id && <input type="hidden" name="taskId" value={values.id} />}

      <section className="card p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Request details</h2>
        <p className="mt-0.5 text-xs text-zinc-500">What needs doing, and how did it reach you?</p>

        <div className="mt-5 grid gap-5">
          <Field label="Title" name="title" required error={fe.title}>
            <Input name="title" defaultValue={values?.title} placeholder="e.g. Payroll report not showing allowances" invalid={!!fe.title} maxLength={200} />
          </Field>
          <Field label="Description" name="description" error={fe.description} hint="Steps to reproduce, screenshots received, what the requester expects…">
            <Textarea name="description" defaultValue={values?.description ?? ""} rows={4} />
          </Field>

          <div>
            <span className="field-label">Received via</span>
            <input type="hidden" name="source" value={source} />
            <div className="flex flex-wrap gap-2">
              {Object.entries(SOURCE_META).map(([k, v]) => (
                <button
                  type="button" key={k} onClick={() => setSource(k)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition",
                    source === k ? "border-brand-500 bg-brand-50 font-medium text-brand-800 ring-2 ring-brand-500/15" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
                  )}
                >
                  <span aria-hidden>{SOURCE_ICONS[k]}</span> {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Requested by" name="requesterName" error={fe.requesterName}>
              <Input name="requesterName" defaultValue={values?.requesterName ?? ""} placeholder="Name" />
            </Field>
            <Field label="Office / section" name="requesterOffice">
              <Input name="requesterOffice" defaultValue={values?.requesterOffice ?? ""} placeholder="e.g. Finance Directorate" />
            </Field>
            <Field label="Contact" name="requesterContact">
              <Input name="requesterContact" defaultValue={values?.requesterContact ?? ""} placeholder="Phone, email or extension" />
            </Field>
          </div>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Classification & assignment</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Application" name="applicationId">
            <Select name="applicationId" defaultValue={values?.applicationId ?? ""}>
              <option value="">— Not specific —</option>
              {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Type" name="type">
            <Select name="type" defaultValue={values?.type ?? "SUPPORT"}>
              {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </Field>
          <div>
            <span className="field-label">Priority</span>
            <input type="hidden" name="priority" value={priority} />
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-zinc-100 p-1">
              {Object.entries(PRIORITY_META).map(([k, v]) => (
                <button
                  type="button" key={k} onClick={() => setPriority(k)}
                  className={cn(
                    "rounded-md py-1.5 text-xs font-medium transition",
                    priority === k
                      ? k === "CRITICAL" ? "bg-red-600 text-white shadow-sm" : k === "HIGH" ? "bg-orange-500 text-white shadow-sm" : "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-600 hover:text-zinc-900",
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="Team" name="teamId" required error={fe.teamId}>
            <Select name="teamId" value={teamId} onChange={(e) => setTeamId(e.target.value)} invalid={!!fe.teamId}>
              {teams.length === 0 && <option value="">No team available</option>}
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          {mode === "create" && (
            <Field label="Assign to" name="assigneeId" error={fe.assigneeId} hint={canAssign ? "Leave empty for the team lead to assign" : "You can take it yourself or leave it for the lead"}>
              <Select name="assigneeId" defaultValue={values?.assigneeId ?? ""} key={teamId} invalid={!!fe.assigneeId}>
                <option value="">— Unassigned —</option>
                {members
                  .filter((m) => canAssign || m.id === currentUserId)
                  .map((m) => <option key={m.id} value={m.id}>{m.id === currentUserId ? `${m.name} (me)` : m.name}</option>)}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date" name="startDate" error={fe.startDate}>
              <Input type="date" name="startDate" defaultValue={values?.startDate} />
            </Field>
            <Field label="Due date" name="dueDate" error={fe.dueDate}>
              <Input type="date" name="dueDate" defaultValue={values?.dueDate} invalid={!!fe.dueDate} />
            </Field>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end gap-2">
        <LinkButton href={values?.id ? `/tasks/${values.id}` : "/tasks"} variant="ghost">Cancel</LinkButton>
        <SubmitButton pendingText={mode === "create" ? "Logging…" : "Saving…"}>{mode === "create" ? "Log task" : "Save changes"}</SubmitButton>
      </div>
    </form>
  );
}
