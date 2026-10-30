"use client";

/**
 * Small client forms used on the organisation & admin screens. Each one is a
 * thin wrapper around a server action with inline validation messages.
 */
import { useActionState, useRef } from "react";
import { initialState } from "@/lib/action-result";
import { ActionFeedback, Checkbox, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { useModal } from "@/components/ui/modal";
import { addTeamMember, createTeam, updateTeam } from "@/actions/teams";
import { assignEmployeeToUser, createUser, resetPassword, updateUser } from "@/actions/users";
import { createRole, saveApplication, saveDepartment, saveEmployee } from "@/actions/admin";

type Opt = { id: string; name: string };

// ───────────────────────── Teams ─────────────────────────

export function TeamForm({
  departments, team,
}: { departments?: Opt[]; team?: { id: string; name: string; code: string; description: string | null; isActive: boolean } }) {
  const [state, action] = useActionState(team ? updateTeam : createTeam, initialState);
  const { close } = useModal();
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <ActionFeedback state={state} onSuccess={close} />
      {team && <input type="hidden" name="teamId" value={team.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Team name" name="name" required error={fe.name} className="sm:col-span-2">
          <Input name="name" defaultValue={team?.name} placeholder="e.g. Oracle HCM Team" invalid={!!fe.name} />
        </Field>
        <Field label="Code" name="code" required error={fe.code}>
          <Input name="code" defaultValue={team?.code} placeholder="HCM" className="uppercase" invalid={!!fe.code} />
        </Field>
      </div>
      {departments && departments.length > 0 && !team && (
        <Field label="Department" name="departmentId" error={fe.departmentId}>
          <Select name="departmentId">{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
        </Field>
      )}
      <Field label="Description" name="description">
        <Textarea name="description" rows={2} defaultValue={team?.description ?? ""} placeholder="What does this team look after?" />
      </Field>
      {team && <Checkbox name="isActive" defaultChecked={team.isActive} label="Active" description="Inactive teams can't receive new tasks" />}
      <div className="flex justify-end"><SubmitButton>{team ? "Save team" : "Create team"}</SubmitButton></div>
    </form>
  );
}

export function AddMemberForm({ teamId, candidates }: { teamId: string; candidates: { id: string; label: string }[] }) {
  const [state, action] = useActionState(addTeamMember, initialState);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <ActionFeedback state={state} formRef={ref} resetOnSuccess />
      <input type="hidden" name="teamId" value={teamId} />
      <Field label="Add a user to this team" name="userId" className="flex-1" error={state.fieldErrors?.userId}>
        <Select name="userId" defaultValue="">
          <option value="">Choose a user…</option>
          {candidates.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
      </Field>
      <label className="flex h-10 items-center gap-2 text-sm text-zinc-700">
        <input type="checkbox" name="isLead" className="size-4 accent-brand-700" /> Team lead
      </label>
      <SubmitButton pendingText="Adding…">Add member</SubmitButton>
    </form>
  );
}

// ───────────────────────── Users ─────────────────────────

export function UserCreateForm({
  roles, departments, employees, teams, showDepartment,
}: { roles: Opt[]; departments: Opt[]; employees: { id: string; label: string }[]; teams: Opt[]; showDepartment: boolean }) {
  const [state, action] = useActionState(createUser, initialState);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <ActionFeedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Username" name="username" required error={fe.username} hint="Seat name, e.g. erp.dev03">
          <Input name="username" placeholder="erp.dev03" autoComplete="off" invalid={!!fe.username} />
        </Field>
        <Field label="Seat title" name="displayTitle" hint="Shown when no employee is assigned">
          <Input name="displayTitle" placeholder="ERP Developer 3" />
        </Field>
        <Field label="Role" name="roleId" required error={fe.roleId}>
          <Select name="roleId" invalid={!!fe.roleId}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
        </Field>
        {showDepartment && (
          <Field label="Department" name="departmentId" error={fe.departmentId}>
            <Select name="departmentId">{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
          </Field>
        )}
        <Field label="Employee" name="employeeId" error={fe.employeeId} hint="Who will use this account (can be changed later)">
          <Select name="employeeId" defaultValue="">
            <option value="">— Leave vacant —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </Select>
        </Field>
        <Field label="Add to team" name="teamId" error={fe.teamId}>
          <Select name="teamId" defaultValue="">
            <option value="">— None —</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Temporary password" name="password" required error={fe.password} hint="User must change it at first login" className="sm:col-span-2">
          <Input name="password" type="text" autoComplete="new-password" placeholder="At least 8 characters with a number" invalid={!!fe.password} />
        </Field>
      </div>
      <div className="flex justify-end"><SubmitButton pendingText="Creating…">Create user</SubmitButton></div>
    </form>
  );
}

export function UserEditForm({
  user, roles, departments, showDepartment, isSelf,
}: {
  user: { id: string; displayTitle: string | null; roleId: string; departmentId: string | null; isActive: boolean };
  roles: Opt[]; departments: Opt[]; showDepartment: boolean; isSelf: boolean;
}) {
  const [state, action] = useActionState(updateUser, initialState);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <ActionFeedback state={state} />
      <input type="hidden" name="userId" value={user.id} />
      <Field label="Seat title" name="displayTitle"><Input name="displayTitle" defaultValue={user.displayTitle ?? ""} /></Field>
      <Field label="Role" name="roleId" error={fe.roleId}>
        <Select name="roleId" defaultValue={user.roleId} disabled={isSelf}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
        {isSelf && <input type="hidden" name="roleId" value={user.roleId} />}
      </Field>
      {showDepartment && (
        <Field label="Department" name="departmentId">
          <Select name="departmentId" defaultValue={user.departmentId ?? ""}>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
        </Field>
      )}
      {isSelf ? <input type="hidden" name="isActive" value="on" /> : (
        <Checkbox name="isActive" defaultChecked={user.isActive} label="Account active" description="Disabled accounts cannot sign in" />
      )}
      <div className="flex justify-end"><SubmitButton>Save</SubmitButton></div>
    </form>
  );
}

export function SeatAssignForm({
  userId, currentEmployeeId, employees,
}: { userId: string; currentEmployeeId: string | null; employees: { id: string; label: string }[] }) {
  const [state, action] = useActionState(assignEmployeeToUser, initialState);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <ActionFeedback state={state} />
      <input type="hidden" name="userId" value={userId} />
      <Select name="employeeId" defaultValue={currentEmployeeId ?? ""} aria-label="Employee">
        <option value="">— Vacate this seat —</option>
        {employees.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
      </Select>
      <Input name="note" placeholder="Reason, e.g. transfer / new joiner (optional)" />
      <SubmitButton variant="outline" className="w-full" pendingText="Updating…">Update employee on this user</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [state, action] = useActionState(resetPassword, initialState);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <ActionFeedback state={state} formRef={ref} resetOnSuccess />
      <input type="hidden" name="userId" value={userId} />
      <Field label="New temporary password" name="password" error={state.fieldErrors?.password}>
        <Input name="password" type="text" autoComplete="new-password" invalid={!!state.fieldErrors?.password} />
      </Field>
      <SubmitButton variant="outline" className="w-full">Reset password</SubmitButton>
    </form>
  );
}

// ───────────────────────── Employees ─────────────────────────

export function EmployeeForm({
  employee, departments, showDepartment,
}: {
  employee?: { id: string; employeeCode: string; name: string; email: string; phone: string | null; designation: string | null; departmentId: string; isActive: boolean };
  departments: Opt[]; showDepartment: boolean;
}) {
  const [state, action] = useActionState(saveEmployee, initialState);
  const { close } = useModal();
  const ref = useRef<HTMLFormElement>(null);
  const fe = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="space-y-4">
      <ActionFeedback state={state} formRef={ref} resetOnSuccess={!employee} onSuccess={close} />
      {employee && <input type="hidden" name="id" value={employee.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Employee ID" name="employeeCode" required error={fe.employeeCode}>
          <Input name="employeeCode" defaultValue={employee?.employeeCode} placeholder="EMP-1050" invalid={!!fe.employeeCode} />
        </Field>
        <Field label="Full name" name="name" required error={fe.name}>
          <Input name="name" defaultValue={employee?.name} invalid={!!fe.name} />
        </Field>
        <Field label="Email" name="email" required error={fe.email}>
          <Input name="email" type="email" defaultValue={employee?.email} invalid={!!fe.email} />
        </Field>
        <Field label="Contact number" name="phone" error={fe.phone}>
          <Input name="phone" defaultValue={employee?.phone ?? ""} placeholder="03xx-xxxxxxx" />
        </Field>
        <Field label="Designation" name="designation">
          <Input name="designation" defaultValue={employee?.designation ?? ""} />
        </Field>
        {showDepartment && (
          <Field label="Department" name="departmentId">
            <Select name="departmentId" defaultValue={employee?.departmentId}>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
          </Field>
        )}
      </div>
      {employee && <Checkbox name="isActive" defaultChecked={employee.isActive} label="Active employee" />}
      <div className="flex justify-end"><SubmitButton>{employee ? "Save" : "Add employee"}</SubmitButton></div>
    </form>
  );
}

// ───────────────────────── Departments / Applications / Roles ─────────────────────────

export function DepartmentForm({ dep }: { dep?: { id: string; code: string; name: string; description: string | null; isActive: boolean } }) {
  const [state, action] = useActionState(saveDepartment, initialState);
  const { close } = useModal();
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <ActionFeedback state={state} onSuccess={close} />
      {dep && <input type="hidden" name="id" value={dep.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Code" name="code" required error={fe.code}><Input name="code" defaultValue={dep?.code} className="uppercase" /></Field>
        <Field label="Name" name="name" required error={fe.name} className="sm:col-span-2"><Input name="name" defaultValue={dep?.name} /></Field>
      </div>
      <Field label="Description" name="description"><Textarea name="description" rows={2} defaultValue={dep?.description ?? ""} /></Field>
      {dep && <Checkbox name="isActive" defaultChecked={dep.isActive} label="Active" />}
      <div className="flex justify-end"><SubmitButton>Save</SubmitButton></div>
    </form>
  );
}

export function ApplicationForm({ app }: { app?: { id: string; code: string; name: string; description: string | null; color: string; isActive: boolean } }) {
  const [state, action] = useActionState(saveApplication, initialState);
  const { close } = useModal();
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <ActionFeedback state={state} onSuccess={close} />
      {app && <input type="hidden" name="id" value={app.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Code" name="code" required error={fe.code}><Input name="code" defaultValue={app?.code} className="uppercase" /></Field>
        <Field label="Name" name="name" required error={fe.name} className="sm:col-span-2"><Input name="name" defaultValue={app?.name} /></Field>
      </div>
      <Field label="Description" name="description"><Textarea name="description" rows={2} defaultValue={app?.description ?? ""} /></Field>
      <Field label="Colour" name="color" error={fe.color}>
        <Input name="color" type="color" defaultValue={app?.color ?? "#2a78d6"} className="h-10 w-20 p-1" />
      </Field>
      {app && <Checkbox name="isActive" defaultChecked={app.isActive} label="Active" />}
      <div className="flex justify-end"><SubmitButton>Save</SubmitButton></div>
    </form>
  );
}

export function RoleCreateForm() {
  const [state, action] = useActionState(createRole, initialState);
  const { close } = useModal();
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <ActionFeedback state={state} onSuccess={close} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Key" name="key" required error={fe.key} hint="e.g. SUPPORT_AGENT"><Input name="key" className="uppercase" /></Field>
        <Field label="Name" name="name" required error={fe.name}><Input name="name" /></Field>
        <Field label="Authority level (1–99)" name="level" required error={fe.level} hint="Member 10 · Lead 30 · HOD 50">
          <Input name="level" type="number" min={1} max={99} defaultValue={20} />
        </Field>
      </div>
      <Field label="Description" name="description"><Textarea name="description" rows={2} /></Field>
      <div className="flex justify-end"><SubmitButton>Create role</SubmitButton></div>
    </form>
  );
}
