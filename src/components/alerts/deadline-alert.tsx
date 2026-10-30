"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { AlarmClock, TriangleAlert, CalendarClock, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type AlertTask = {
  id: string; code: string; title: string; dueDate: string; team: string; assignee: string | null; mine: boolean;
};

const SEEN_KEY = "tf_deadline_alert_seen";

export function DeadlineAlert({
  overdue, today, soon, hours,
}: { overdue: AlertTask[]; today: AlertTask[]; soon: AlertTask[]; hours: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const total = overdue.length + today.length + soon.length;
  const [tab, setTab] = useState<"overdue" | "today" | "soon">(overdue.length ? "overdue" : today.length ? "today" : "soon");

  useEffect(() => {
    if (!total) return;
    const welcome = params.get("welcome") === "1";
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {}
    if (welcome || !seen) ref.current?.showModal();
    if (welcome) {
      // clean the URL so a refresh doesn't re-open the alert
      const next = new URLSearchParams(params.toString());
      next.delete("welcome");
      router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {}
    ref.current?.close();
  };

  if (!total) return null;
  const lists = { overdue, today, soon };
  const tabs = [
    { key: "overdue" as const, label: "Overdue", count: overdue.length, icon: TriangleAlert, cls: "text-red-600" },
    { key: "today" as const, label: "Due today", count: today.length, icon: AlarmClock, cls: "text-amber-700" },
    { key: "soon" as const, label: `Next ${hours}h`, count: soon.length, icon: CalendarClock, cls: "text-blue-600" },
  ];

  return (
    <dialog ref={ref} onClose={dismiss} className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-2xl border border-zinc-200 bg-white p-0 shadow-2xl">
      <div className="relative overflow-hidden border-b border-zinc-100 bg-gradient-to-br from-amber-50 via-white to-white px-6 pb-5 pt-6">
        <button onClick={dismiss} className="absolute right-4 top-4 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Close">
          <X className="size-5" />
        </button>
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-amber-100 text-amber-700">
            <AlarmClock className="size-6" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Deadlines need your attention</h2>
            <p className="text-sm text-zinc-500">
              {overdue.length > 0 && <span className="font-medium text-red-600">{overdue.length} overdue</span>}
              {overdue.length > 0 && (today.length > 0 || soon.length > 0) && " · "}
              {today.length > 0 && <span>{today.length} due today</span>}
              {today.length > 0 && soon.length > 0 && " · "}
              {soon.length > 0 && <span>{soon.length} due soon</span>}
            </p>
          </div>
        </div>
        <div className="mt-5 flex gap-1 rounded-lg bg-zinc-100 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              disabled={!t.count}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition disabled:opacity-40",
                tab === t.key ? "bg-white shadow-sm" : "text-zinc-600 hover:text-zinc-900",
              )}
            >
              <t.icon className={cn("size-3.5", t.cls)} />
              {t.label}
              <span className="tabular-nums text-zinc-400">{t.count}</span>
            </button>
          ))}
        </div>
      </div>
      <ul className="max-h-80 divide-y divide-zinc-100 overflow-y-auto">
        {lists[tab].map((t) => (
          <li key={t.id}>
            <Link href={`/tasks/${t.id}`} onClick={dismiss} className="flex items-start justify-between gap-4 px-6 py-3 hover:bg-zinc-50">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900">{t.title}</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  <span className="font-mono">{t.code}</span> · {t.team}
                  {!t.mine && t.assignee ? ` · ${t.assignee}` : t.mine ? " · Assigned to you" : " · Unassigned"}
                </p>
              </div>
              <span className={cn("shrink-0 text-xs font-medium", tab === "overdue" ? "text-red-600" : "text-zinc-600")} suppressHydrationWarning>
                {new Date(t.dueDate).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}
                {" "}
                {new Date(t.dueDate).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50/60 px-6 py-3">
        <Link href="/tasks?view=mine&due=attention" onClick={dismiss} className="text-sm font-medium text-brand-700 hover:underline">
          View all in task list
        </Link>
        <button onClick={dismiss} className="h-9 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800">
          Got it
        </button>
      </div>
    </dialog>
  );
}
