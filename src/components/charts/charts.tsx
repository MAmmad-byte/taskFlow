"use client";

import { useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Table2, ChartColumn } from "lucide-react";
import { PHASE_META } from "@/lib/workflow";
import { cn } from "@/lib/utils";

const INK = { primary: "#18181b", secondary: "#52525b", muted: "#a1a1aa", grid: "#f0f0f1", surface: "#ffffff" };
const axisProps = {
  tick: { fill: INK.secondary, fontSize: 12 },
  tickLine: false,
  axisLine: false,
} as const;

type Series = { key: string; label: string; color: string };

type TooltipLike = {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown }>;
  label?: unknown;
  series: Series[];
};

function ChartTooltip({ active, payload, label, series }: TooltipLike) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((a, p) => a + (Number(p.value) || 0), 0);
  return (
    <div className="min-w-40 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold text-zinc-900">{String(label ?? "")}</p>
      {series.map((s) => {
        const p = payload.find((x) => x.dataKey === s.key);
        if (!p) return null;
        return (
          <div key={s.key} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-1.5 text-zinc-600">
              <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="font-medium tabular-nums text-zinc-900">{String(p.value ?? 0)}</span>
          </div>
        );
      })}
      {series.length > 1 && (
        <div className="mt-1 flex justify-between border-t border-zinc-100 pt-1 text-zinc-500">
          <span>Total</span>
          <span className="tabular-nums">{total}</span>
        </div>
      )}
    </div>
  );
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function ViewToggle({ table, setTable }: { table: boolean; setTable: (v: boolean) => void }) {
  return (
    <div className="flex rounded-lg bg-zinc-100 p-0.5">
      {[{ v: false, icon: ChartColumn, l: "Chart" }, { v: true, icon: Table2, l: "Table" }].map((o) => (
        <button
          key={o.l}
          onClick={() => setTable(o.v)}
          className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium", table === o.v ? "bg-white shadow-sm" : "text-zinc-500")}
          aria-pressed={table === o.v}
        >
          <o.icon className="size-3.5" /> {o.l}
        </button>
      ))}
    </div>
  );
}

const PHASES: Series[] = (["open", "active", "review", "done"] as const).map((k) => ({ key: k, label: PHASE_META[k].label, color: PHASE_META[k].color }));

/** Stacked bars: each team's tasks (created in range) split by current phase. */
export function TeamProgressChart({
  data,
}: {
  data: { team: string; open: number; active: number; review: number; done: number; total: number; completion: number }[];
}) {
  const [table, setTable] = useState(false);
  const height = Math.max(220, data.length * 56 + 40);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Legend series={PHASES} />
        <ViewToggle table={table} setTable={setTable} />
      </div>
      {table ? (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Team</th>
                {PHASES.map((p) => <th key={p.key} className="text-right">{p.label}</th>)}
                <th className="text-right">Total</th>
                <th className="text-right">Completion</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.team}>
                  <td className="font-medium">{r.team}</td>
                  {PHASES.map((p) => <td key={p.key} className="text-right tabular-nums">{r[p.key as "open"]}</td>)}
                  <td className="text-right tabular-nums">{r.total}</td>
                  <td className="text-right tabular-nums">{r.completion}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }} barCategoryGap={14}>
              <CartesianGrid horizontal={false} stroke={INK.grid} />
              <XAxis type="number" allowDecimals={false} {...axisProps} />
              <YAxis type="category" dataKey="team" width={130} {...axisProps} tick={{ fill: INK.primary, fontSize: 12 }} />
              <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} content={<ChartTooltip series={PHASES} />} />
              {PHASES.map((p, i) => (
                <Bar
                  key={p.key}
                  dataKey={p.key}
                  stackId="a"
                  fill={p.color}
                  stroke={INK.surface}
                  strokeWidth={2}
                  maxBarSize={28}
                  radius={i === PHASES.length - 1 ? [0, 4, 4, 0] : 0}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/** Created vs completed over time. */
export function TrendChart({ data, unit }: { data: { label: string; created: number; completed: number }[]; unit: "day" | "week" }) {
  const series: Series[] = [
    { key: "created", label: "Created", color: "#2a78d6" },
    { key: "completed", label: "Completed", color: "#1baf7a" },
  ];
  const [table, setTable] = useState(false);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Legend series={series} />
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-400">per {unit}</span>
          <ViewToggle table={table} setTable={setTable} />
        </div>
      </div>
      {table ? (
        <div className="max-h-72 overflow-auto">
          <table className="table-base">
            <thead><tr><th>{unit === "day" ? "Day" : "Week of"}</th><th className="text-right">Created</th><th className="text-right">Completed</th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.label}><td>{r.label}</td><td className="text-right tabular-nums">{r.created}</td><td className="text-right tabular-nums">{r.completed}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke={INK.grid} />
              <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
              <YAxis allowDecimals={false} {...axisProps} />
              <Tooltip cursor={{ stroke: INK.muted, strokeDasharray: "3 3" }} content={<ChartTooltip series={series} />} />
              {series.map((s) => (
                <Line
                  key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false}
                  activeDot={{ r: 5, stroke: INK.surface, strokeWidth: 2 }} isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/** Single-series bars, e.g. tasks completed per day for one person. */
export function CompletedBars({ data }: { data: { label: string; completed: number }[] }) {
  const series: Series[] = [{ key: "completed", label: "Completed", color: "#1baf7a" }];
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
          <CartesianGrid vertical={false} stroke={INK.grid} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={20} />
          <YAxis allowDecimals={false} {...axisProps} />
          <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} content={<ChartTooltip series={series} />} />
          <Bar dataKey="completed" fill="#1baf7a" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
