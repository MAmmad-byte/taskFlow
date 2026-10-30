"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell, ChartColumn, Building2, SquareCheck, ClipboardList, KeyRound, LayoutDashboard, LogOut, Menu,
  ScrollText, Shapes, TrendingUp, CircleUserRound, Users, UsersRound, X, type LucideIcon, Plus,
} from "lucide-react";
import type { NavIcon, NavSection } from "@/lib/nav";
import { cn, fromNow } from "@/lib/utils";
import { Avatar } from "@/components/ui/misc";
import { logout } from "@/actions/auth";
import { markNotificationsRead } from "@/actions/admin";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard, tasks: SquareCheck, plus: Plus, teams: UsersRound, reports: ChartColumn,
  progress: TrendingUp, users: KeyRound, employees: Users, departments: Building2, apps: Shapes,
  roles: ClipboardList, audit: ScrollText,
};

export type ShellUser = { name: string; username: string; role: string; department: string | null };
export type ShellNotification = { id: string; title: string; body: string | null; link: string | null; createdAt: string; read: boolean };

export function AppShell({
  nav, user, notifications, unread, appName, orgName, children,
}: {
  nav: NavSection[]; user: ShellUser; notifications: ShellNotification[]; unread: number;
  appName: string; orgName: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="grid size-8 place-items-center rounded-lg bg-brand-700 text-white shadow-sm">
          <SquareCheck className="size-4.5" />
        </span>
        <div className="leading-tight">
          <p className="text-[15px] font-semibold tracking-tight text-zinc-900">{appName}</p>
          <p className="text-[11px] text-zinc-500">{orgName}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {nav.map((section, i) => (
          <div key={i}>
            {section.title && (
              <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-400">{section.title}</p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/")) || pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                        active ? "bg-brand-50 text-brand-800" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                      )}
                    >
                      <Icon className={cn("size-4.5", active ? "text-brand-700" : "text-zinc-400 group-hover:text-zinc-600")} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-zinc-200 p-3">
        <Link href="/profile" className="flex items-center gap-3 rounded-lg p-2 hover:bg-zinc-100">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900">{user.name}</p>
            <p className="truncate text-xs text-zinc-500">{user.role}</p>
          </div>
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-zinc-200 bg-white lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-zinc-950/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <button className="absolute right-3 top-4 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-zinc-200 bg-white/85 px-4 backdrop-blur sm:px-6">
          <button className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <div className="hidden min-w-0 text-sm text-zinc-500 sm:block">
            {user.department ? <span>{user.department}</span> : null}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Link
              href="/tasks/new"
              className="hidden h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-sm font-medium text-white shadow-xs hover:bg-brand-800 sm:inline-flex"
            >
              <Plus className="size-4" /> New task
            </Link>
            <NotificationBell notifications={notifications} unread={unread} />
            <UserMenu user={user} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>

      {/* Mobile floating action */}
      <Link
        href="/tasks/new"
        className="fixed bottom-5 right-5 z-20 grid size-14 place-items-center rounded-full bg-brand-700 text-white shadow-lg shadow-brand-900/20 sm:hidden"
        aria-label="New task"
      >
        <Plus className="size-6" />
      </Link>
    </div>
  );
}

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onOutside]);
  return ref;
}

function NotificationBell({ notifications, unread }: { notifications: ShellNotification[]; unread: number }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-zinc-600 hover:bg-zinc-100"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <form action={markNotificationsRead}>
                <button className="text-xs font-medium text-brand-700 hover:underline">Mark all read</button>
              </form>
            )}
          </div>
          <ul className="max-h-96 divide-y divide-zinc-100 overflow-y-auto">
            {notifications.length === 0 && <li className="px-4 py-8 text-center text-sm text-zinc-500">You're all caught up.</li>}
            {notifications.map((n) => (
              <li key={n.id} className={cn("px-4 py-3", !n.read && "bg-brand-50/40")}>
                <Link href={n.link ?? "#"} onClick={() => setOpen(false)} className="block">
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900">{n.title}</p>
                      {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{n.body}</p>}
                      <p className="mt-1 text-[11px] text-zinc-400" suppressHydrationWarning>{fromNow(n.createdAt)}</p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg p-1 hover:bg-zinc-100" aria-label="Account menu">
        <Avatar name={user.name} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl">
          <div className="border-b border-zinc-100 px-4 py-3">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-zinc-500">@{user.username} · {user.role}</p>
          </div>
          <Link href="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
            <CircleUserRound className="size-4" /> Profile & password
          </Link>
          <form action={logout}>
            <button className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
