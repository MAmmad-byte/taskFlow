"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarRange, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const PRESETS = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "365d", label: "12M" },
];

/** Date range control: presets + custom from/to. Writes to the URL so reports are shareable. */
export function RangePicker({ from, to, active, extra }: { from: string; to: string; active: string; extra?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg bg-zinc-100 p-1" role="group" aria-label="Date range presets">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => go({ range: p.key, from: null, to: null })}
            className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition", active === p.key ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900")}
            aria-pressed={active === p.key}
          >
            {p.label}
          </button>
        ))}
      </div>
      <form
        className={cn("flex items-center gap-1.5 rounded-lg border bg-white px-2 py-1", active === "custom" ? "border-brand-400" : "border-zinc-200")}
        onSubmit={(e) => {
          e.preventDefault();
          if (f && t) go({ from: f, to: t, range: null });
        }}
      >
        <CalendarRange className="size-4 text-zinc-400" />
        <input type="date" value={f} max={t} onChange={(e) => setF(e.target.value)} className="w-[8.5rem] bg-transparent text-xs outline-none" aria-label="From" />
        <span className="text-xs text-zinc-400">–</span>
        <input type="date" value={t} min={f} onChange={(e) => setT(e.target.value)} className="w-[8.5rem] bg-transparent text-xs outline-none" aria-label="To" />
        <button className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white hover:bg-zinc-800">Apply</button>
      </form>
      {extra}
      {pending && <LoaderCircle className="size-4 animate-spin text-zinc-400" />}
    </div>
  );
}

export function TeamSelect({ teams, value }: { teams: { id: string; name: string }[]; value?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (teams.length < 2 && !value) return null;
  return (
    <select
      value={value ?? ""}
      aria-label="Team"
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set("team", e.target.value);
        else next.delete("team");
        router.push(`${pathname}?${next.toString()}`, { scroll: false });
      }}
      className="input h-9 w-auto py-1 pr-8 text-xs"
    >
      <option value="">All teams</option>
      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  );
}
