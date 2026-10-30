"use client";

import { useActionState, Fragment } from "react";
import { saveRoleMatrix } from "@/actions/admin";
import { initialState } from "@/lib/action-result";
import { ActionFeedback, SubmitButton } from "@/components/ui/form";

type Role = { id: string; key: string; name: string; level: number; users: number; granted: string[] };
type Perm = { id: string; key: string; name: string; group: string; description: string | null };

export function RoleMatrix({ roles, permissions }: { roles: Role[]; permissions: Perm[] }) {
  const [state, action] = useActionState(saveRoleMatrix, initialState);
  const groups = [...new Set(permissions.map((p) => p.group))];

  return (
    <form action={action}>
      <ActionFeedback state={state} />
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead className="sticky top-0">
            <tr>
              <th className="min-w-64">Permission</th>
              {roles.map((r) => (
                <th key={r.id} className="text-center normal-case tracking-normal">
                  <span className="block text-[13px] font-semibold text-zinc-800">{r.name}</span>
                  <span className="block text-[11px] font-normal text-zinc-500">Level {r.level} · {r.users} user{r.users === 1 ? "" : "s"}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g}>
                <tr className="hover:bg-transparent">
                  <td colSpan={roles.length + 1} className="bg-zinc-50 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{g}</td>
                </tr>
                {permissions.filter((p) => p.group === g).map((p) => (
                  <tr key={p.id}>
                    <td>
                      <p className="font-medium text-zinc-800">{p.name}</p>
                      <p className="text-xs text-zinc-500">{p.description} <code className="ml-1 text-[10px] text-zinc-400">{p.key}</code></p>
                    </td>
                    {roles.map((r) => {
                      const locked = r.key === "ADMIN" && p.key === "role.manage";
                      return (
                        <td key={r.id} className="text-center">
                          <input
                            type="checkbox"
                            name={`perm:${r.id}:${p.id}`}
                            defaultChecked={r.granted.includes(p.id) || locked}
                            disabled={locked}
                            className="size-4 accent-brand-700"
                            aria-label={`${r.name}: ${p.name}`}
                            title={locked ? "Administrators always keep role management" : undefined}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end border-t border-zinc-100 px-5 py-4">
        <SubmitButton>Save permissions</SubmitButton>
      </div>
    </form>
  );
}
