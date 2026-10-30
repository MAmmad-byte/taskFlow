import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import type { Tone } from "@/lib/workflow";

const toneClass: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  zinc: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  purple: "bg-purple-50 text-purple-700 ring-purple-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  cyan: "bg-cyan-50 text-cyan-800 ring-cyan-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  green: "bg-green-50 text-green-700 ring-green-200",
};

const dotClass: Record<Tone, string> = {
  slate: "bg-slate-400", zinc: "bg-zinc-400", blue: "bg-blue-500", amber: "bg-amber-500", orange: "bg-orange-500",
  violet: "bg-violet-500", purple: "bg-purple-500", red: "bg-red-500", cyan: "bg-cyan-500", teal: "bg-teal-500",
  emerald: "bg-emerald-500", green: "bg-green-600",
};

export function Badge({ tone = "zinc", dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", toneClass[tone], className)}>
      {dot && <span className={cn("size-1.5 rounded-full", dotClass[tone])} />}
      {children}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("card", className)}>{children}</div>;
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4", className)}>
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label, value, hint, icon: Icon, tone = "zinc", href,
}: {
  label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; tone?: "zinc" | "brand" | "red" | "amber" | "blue" | "violet"; href?: string;
}) {
  const iconTone = {
    zinc: "bg-zinc-100 text-zinc-600", brand: "bg-brand-50 text-brand-700", red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-700", blue: "bg-blue-50 text-blue-600", violet: "bg-violet-50 text-violet-600",
  }[tone];
  const body = (
    <div className="card flex items-start justify-between gap-4 p-5 transition hover:border-zinc-300">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-zinc-500">{label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">{value}</p>
        {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
      </div>
      {Icon && (
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", iconTone)}>
          <Icon className="size-5" />
        </span>
      )}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const palette = ["bg-blue-100 text-blue-700", "bg-orange-100 text-orange-700", "bg-violet-100 text-violet-700", "bg-emerald-100 text-emerald-700", "bg-pink-100 text-pink-700", "bg-cyan-100 text-cyan-800"];
  const idx = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
  const sz = { sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-12 text-base" }[size];
  return (
    <span className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold", palette[idx], sz, className)} aria-hidden>
      {initials(name) || "?"}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && (
        <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-zinc-100 text-zinc-500">
          <Icon className="size-6" />
        </span>
      )}
      <p className="text-sm font-semibold text-zinc-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-zinc-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-zinc-100", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full", v === 100 ? "bg-brand-600" : "bg-zinc-800")} style={{ width: `${v}%` }} />
    </div>
  );
}

export function DescriptionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-zinc-100">
      {items.map((it) => (
        <div key={it.label} className="flex items-start justify-between gap-4 px-5 py-2.5 text-sm">
          <dt className="shrink-0 text-zinc-500">{it.label}</dt>
          <dd className="text-right font-medium text-zinc-800">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
