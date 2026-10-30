"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { LoaderCircle, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Opt = { value: string; label: string };

export function TaskFilters({
  views, currentView, teams, apps, assignees, statuses, priorities, types,
}: {
  views: Opt[]; currentView: string; teams: Opt[]; apps: Opt[]; assignees: Opt[]; statuses: Opt[]; priorities: Opt[]; types: Opt[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [more, setMore] = useState(
    ["type", "priority", "app", "from", "to", "assignee"].some((k) => params.get(k)),
  );

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  // debounce free-text search
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => set({ q: q || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const view = currentView;
  const active = ["status", "phase", "team", "app", "priority", "type", "assignee", "due", "from", "to", "q"].filter((k) => params.get(k));

  const sel = (name: string, label: string, opts: Opt[]) => (
    <select
      aria-label={label}
      value={params.get(name) ?? ""}
      onChange={(e) => set({ [name]: e.target.value || null })}
      className={cn("input h-9 w-auto min-w-0 py-1 pr-8 text-[13px]", params.get(name) && "border-brand-400 bg-brand-50/50")}
    >
      <option value="">{label}</option>
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-zinc-100 p-1">
          {views.map((v) => (
            <button
              key={v.value}
              onClick={() => set({ view: v.value })}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition",
                view === v.value ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 lg:w-72 lg:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title, TSK no., requester…"
              className="input h-9 pl-9 text-[13px]"
            />
          </div>
          {pending && <LoaderCircle className="size-4 animate-spin text-zinc-400" />}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {sel("phase", "Any stage", [
          { value: "open_all", label: "All open" }, { value: "open", label: "Not started / on hold" },
          { value: "active", label: "In progress" }, { value: "review", label: "Testing & UAT" },
          { value: "done", label: "Done" }, { value: "cancelled", label: "Cancelled" },
        ])}
        {sel("status", "Any status", statuses)}
        {teams.length > 1 && sel("team", "All teams", teams)}
        {sel("due", "Any due date", [
          { value: "overdue", label: "Overdue" }, { value: "attention", label: "Overdue or due in 48h" },
          { value: "week", label: "Due this week" }, { value: "none", label: "No due date" },
        ])}
        <button
          onClick={() => setMore((m) => !m)}
          className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50", more && "bg-zinc-100")}
        >
          <SlidersHorizontal className="size-3.5" /> More filters
        </button>
        {active.length > 0 && (
          <button
            onClick={() => {
              setQ("");
              start(() => router.push(`${pathname}?view=${view}`, { scroll: false }));
            }}
            className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-zinc-500 hover:text-zinc-900"
          >
            <X className="size-3.5" /> Clear ({active.length})
          </button>
        )}
      </div>

      {more && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white/60 p-3">
          {sel("type", "Any type", types)}
          {sel("priority", "Any priority", priorities)}
          {apps.length > 0 && sel("app", "Any application", apps)}
          {assignees.length > 0 && sel("assignee", "Anyone", [{ value: "none", label: "Unassigned" }, ...assignees])}
          <div className="flex items-center gap-1.5 text-[13px] text-zinc-500">
            <span>Logged</span>
            <input type="date" aria-label="Logged from" value={params.get("from") ?? ""} onChange={(e) => set({ from: e.target.value || null })} className="input h-9 w-auto py-1 text-[13px]" />
            <span>to</span>
            <input type="date" aria-label="Logged to" value={params.get("to") ?? ""} onChange={(e) => set({ to: e.target.value || null })} className="input h-9 w-auto py-1 text-[13px]" />
          </div>
        </div>
      )}
    </div>
  );
}
