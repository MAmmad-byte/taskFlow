import type { AuthUser } from "@/lib/auth";
import { can, canAny } from "@/lib/auth";

export type NavIcon =
  | "dashboard" | "tasks" | "plus" | "teams" | "reports" | "progress" | "users" | "employees"
  | "departments" | "apps" | "roles" | "audit";

export type NavItem = { href: string; label: string; icon: NavIcon };
export type NavSection = { title?: string; items: NavItem[] };

export function buildNav(user: AuthUser): NavSection[] {
  const work: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/tasks", label: "Tasks", icon: "tasks" },
    { href: "/progress", label: "My progress", icon: "progress" },
  ];
  if (can(user, "report.view")) work.push({ href: "/reports", label: "Reports", icon: "reports" });

  const org: NavItem[] = [];
  if (can(user, "team.view")) org.push({ href: "/teams", label: "Teams", icon: "teams" });
  if (can(user, "user.view")) org.push({ href: "/users", label: "Users", icon: "users" });
  if (can(user, "employee.view")) org.push({ href: "/employees", label: "Employees", icon: "employees" });

  const admin: NavItem[] = [];
  if (can(user, "department.manage")) admin.push({ href: "/admin/departments", label: "Departments", icon: "departments" });
  if (can(user, "application.manage")) admin.push({ href: "/admin/applications", label: "Applications", icon: "apps" });
  if (can(user, "role.manage")) admin.push({ href: "/admin/roles", label: "Roles & permissions", icon: "roles" });
  if (canAny(user, ["audit.view"])) admin.push({ href: "/admin/audit", label: "Audit log", icon: "audit" });

  return [
    { items: work },
    ...(org.length ? [{ title: "Organisation", items: org }] : []),
    ...(admin.length ? [{ title: "Administration", items: admin }] : []),
  ];
}
