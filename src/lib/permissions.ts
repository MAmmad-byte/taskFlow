/**
 * Permission catalogue. Keys are stored in the database (Permission table) and
 * mapped to roles through RolePermission, so an administrator can change what
 * each role may do from the Roles & Permissions screen without a deployment.
 * The defaults below are only used by the seed script.
 */

export const PERMISSIONS = {
  // Tasks
  TASK_CREATE: "task.create",
  TASK_ASSIGN: "task.assign",
  TASK_VIEW_TEAM: "task.view.team",
  TASK_VIEW_DEPARTMENT: "task.view.department",
  TASK_VIEW_ALL: "task.view.all",
  TASK_UPDATE_OWN: "task.update.own",
  TASK_STATUS_TEAM: "task.status.team",
  TASK_EDIT: "task.edit",
  TASK_CLOSE: "task.close",
  TASK_DELETE: "task.delete",
  // Teams
  TEAM_VIEW: "team.view",
  TEAM_MANAGE: "team.manage",
  TEAM_MEMBERS: "team.members.manage",
  // People
  USER_VIEW: "user.view",
  USER_MANAGE: "user.manage",
  EMPLOYEE_VIEW: "employee.view",
  EMPLOYEE_MANAGE: "employee.manage",
  // Administration
  DEPARTMENT_MANAGE: "department.manage",
  APPLICATION_MANAGE: "application.manage",
  ROLE_MANAGE: "role.manage",
  AUDIT_VIEW: "audit.view",
  // Reporting
  REPORT_VIEW: "report.view",
  PROGRESS_EMPLOYEE: "progress.employee",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_CATALOGUE: {
  key: PermissionKey;
  name: string;
  group: string;
  description: string;
}[] = [
  { key: "task.create", name: "Create tasks", group: "Tasks", description: "Log new requests and complaints" },
  { key: "task.assign", name: "Assign tasks", group: "Tasks", description: "Assign or reassign tasks to team members" },
  { key: "task.view.team", name: "View team tasks", group: "Tasks", description: "See all tasks of teams the user belongs to" },
  { key: "task.view.department", name: "View department tasks", group: "Tasks", description: "See every task in the user's department" },
  { key: "task.view.all", name: "View all tasks", group: "Tasks", description: "See tasks across every department" },
  { key: "task.update.own", name: "Update own tasks", group: "Tasks", description: "Add progress notes and move own tasks through the workflow" },
  { key: "task.status.team", name: "Update team task status", group: "Tasks", description: "Change the status of any task in teams the user leads" },
  { key: "task.edit", name: "Edit task details", group: "Tasks", description: "Edit title, priority, due date and other fields" },
  { key: "task.close", name: "Close / cancel / reopen", group: "Tasks", description: "Final sign-off: close, cancel or reopen tasks" },
  { key: "task.delete", name: "Delete tasks", group: "Tasks", description: "Permanently delete tasks" },
  { key: "team.view", name: "View teams", group: "Teams", description: "See teams and their members" },
  { key: "team.manage", name: "Manage teams", group: "Teams", description: "Create, rename and deactivate teams" },
  { key: "team.members.manage", name: "Manage team members", group: "Teams", description: "Add or remove members and choose team leads" },
  { key: "user.view", name: "View users", group: "People", description: "See user accounts" },
  { key: "user.manage", name: "Manage users", group: "People", description: "Create users, set roles, place employees on user seats, reset passwords" },
  { key: "employee.view", name: "View employees", group: "People", description: "See the employee register" },
  { key: "employee.manage", name: "Manage employees", group: "People", description: "Add and edit employees" },
  { key: "department.manage", name: "Manage departments", group: "Administration", description: "Create and edit departments" },
  { key: "application.manage", name: "Manage applications", group: "Administration", description: "Maintain the list of supported applications" },
  { key: "role.manage", name: "Manage roles & permissions", group: "Administration", description: "Change what each role may do" },
  { key: "audit.view", name: "View audit log", group: "Administration", description: "See administrative changes" },
  { key: "report.view", name: "View reports", group: "Reporting", description: "Team analytics and charts (scoped to what the user may see)" },
  { key: "progress.employee", name: "Progress by employee", group: "Reporting", description: "Look up any employee's work history by Employee ID" },
];

export const ROLE_KEYS = {
  ADMIN: "ADMIN",
  HOD: "HOD",
  TEAM_LEAD: "TEAM_LEAD",
  MEMBER: "MEMBER",
} as const;

export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

const ALL = PERMISSION_CATALOGUE.map((p) => p.key);

export const DEFAULT_ROLES: {
  key: RoleKey;
  name: string;
  description: string;
  level: number;
  permissions: PermissionKey[];
}[] = [
  {
    key: "ADMIN",
    name: "Administrator",
    description: "Full access to every department, team, user and setting",
    level: 100,
    permissions: ALL,
  },
  {
    key: "HOD",
    name: "Head of Department",
    description: "Runs a department: creates teams and users, sees department analytics",
    level: 50,
    permissions: [
      "task.create", "task.assign", "task.view.team", "task.view.department", "task.update.own",
      "task.status.team", "task.edit", "task.close", "team.view", "team.manage", "team.members.manage",
      "user.view", "user.manage", "employee.view", "employee.manage", "report.view", "progress.employee",
    ],
  },
  {
    key: "TEAM_LEAD",
    name: "Team Lead",
    description: "Leads one or more teams: assigns work and controls task status",
    level: 30,
    permissions: [
      "task.create", "task.assign", "task.view.team", "task.update.own", "task.status.team",
      "task.edit", "task.close", "team.view", "report.view",
    ],
  },
  {
    key: "MEMBER",
    name: "Team Member",
    description: "Logs requests, works on assigned tasks and records progress",
    level: 10,
    permissions: ["task.create", "task.assign", "task.view.team", "task.update.own", "team.view"],
  },
];
