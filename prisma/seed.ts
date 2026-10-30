/* eslint-disable no-console */
import { PrismaClient, type TaskStatus, type TaskType, type TaskPriority, type RequestSource } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_ROLES, PERMISSION_CATALOGUE } from "../src/lib/permissions";

const db = new PrismaClient();

// Deterministic pseudo-random so every seed produces the same demo data
let s = 42;
const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]!;
const days = (n: number) => n * 24 * 60 * 60 * 1000;

const WITH_DEMO = !process.argv.includes("--no-demo");

async function main() {
  console.log("Seeding permissions and roles…");
  for (const p of PERMISSION_CATALOGUE) {
    await db.permission.upsert({
      where: { key: p.key },
      update: { name: p.name, group: p.group, description: p.description },
      create: p,
    });
  }
  const permRows = await db.permission.findMany();
  const permId = new Map(permRows.map((p) => [p.key, p.id]));

  const roles: Record<string, string> = {};
  for (const r of DEFAULT_ROLES) {
    const role = await db.role.upsert({
      where: { key: r.key },
      update: { name: r.name, description: r.description, level: r.level, isSystem: true },
      create: { key: r.key, name: r.name, description: r.description, level: r.level, isSystem: true },
    });
    roles[r.key] = role.id;
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({
      data: r.permissions.map((k) => ({ roleId: role.id, permissionId: permId.get(k)! })),
    });
  }

  console.log("Seeding departments and applications…");
  const its = await db.department.upsert({
    where: { code: "ITS" },
    update: {},
    create: { code: "ITS", name: "IT Services", description: "Development, operations and support of enterprise applications" },
  });
  const net = await db.department.upsert({
    where: { code: "NET" },
    update: {},
    create: { code: "NET", name: "Networks & Infrastructure", description: "Servers, network and end-user computing" },
  });

  const appDefs = [
    { code: "HCM", name: "Oracle HCM", color: "#2a78d6", description: "Human Capital Management" },
    { code: "ERP", name: "Oracle ERP", color: "#eb6834", description: "Financials, procurement and inventory" },
    { code: "EOFFICE", name: "eOffice", color: "#6250d6", description: "File tracking and office automation" },
    { code: "INSIGHTS", name: "Insights", color: "#1baf7a", description: "Management dashboards and analytics" },
  ];
  const apps: Record<string, string> = {};
  for (const a of appDefs) {
    const app = await db.application.upsert({ where: { code: a.code }, update: {}, create: a });
    apps[a.code] = app.id;
  }

  console.log("Seeding administrator…");
  const adminEmp = await db.employee.upsert({
    where: { employeeCode: "EMP-0001" },
    update: {},
    create: {
      employeeCode: "EMP-0001", name: "System Administrator", email: "admin@example.org",
      phone: "0300-0000001", designation: "System Administrator", departmentId: its.id,
    },
  });
  await db.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin", passwordHash: await bcrypt.hash("Admin@123", 10), displayTitle: "Administrator",
      roleId: roles.ADMIN!, departmentId: its.id, employeeId: adminEmp.id, mustChangePassword: false,
    },
  });

  if (!WITH_DEMO) {
    console.log("Done (no demo data). Login: admin / Admin@123");
    return;
  }

  if (await db.task.count()) {
    console.log("Tasks already exist — skipping demo data.");
    return;
  }

  console.log("Seeding demo employees, users and teams…");
  const pwd = await bcrypt.hash("Password@123", 10);
  const people = [
    ["EMP-1001", "Tariq Mehmood", "Head of IT Services", "HOD", null, true],
    ["EMP-1002", "Ayesha Siddiqui", "Lead Developer — HCM", "TEAM_LEAD", "HCM", true],
    ["EMP-1003", "Bilal Ahmed", "Oracle HCM Developer", "MEMBER", "HCM", true],
    ["EMP-1004", "Sana Khalid", "Oracle HCM Analyst", "MEMBER", "HCM", true],
    ["EMP-1005", "Usman Ali", "Lead Developer — ERP", "TEAM_LEAD", "ERP", true],
    ["EMP-1006", "Hira Fatima", "Oracle ERP Developer", "MEMBER", "ERP", true],
    ["EMP-1007", "Kamran Shah", "PL/SQL Developer", "MEMBER", "ERP", true],
    ["EMP-1008", "Nadia Hussain", "Lead — eOffice", "TEAM_LEAD", "EOFFICE", true],
    ["EMP-1009", "Fahad Iqbal", "Web Developer", "MEMBER", "EOFFICE", true],
    ["EMP-1010", "Zainab Raza", "Lead — Insights", "TEAM_LEAD", "INSIGHTS", true],
    ["EMP-1011", "Hamza Javed", "BI Developer", "MEMBER", "INSIGHTS", true],
    ["EMP-1012", "Mariam Aslam", "Support Engineer", "MEMBER", "EOFFICE", true],
    ["EMP-1013", "Asad Rafiq", "Junior Developer", null, null, true], // on register, no seat yet
  ] as const;

  const teamDefs = [
    { code: "HCM", name: "Oracle HCM Team", description: "Payroll, HR and self-service" },
    { code: "ERP", name: "ERP Team", description: "Financials, procurement and PeopleSoft reports" },
    { code: "EOFFICE", name: "eOffice Team", description: "File tracking and office automation" },
    { code: "INSIGHTS", name: "Insights Team", description: "Dashboards, BI and reporting" },
  ];
  const teams: Record<string, string> = {};
  for (const t of teamDefs) {
    const team = await db.team.create({ data: { ...t, departmentId: its.id } });
    teams[t.code] = team.id;
  }

  const userByTeam: Record<string, string[]> = { HCM: [], ERP: [], EOFFICE: [], INSIGHTS: [] };
  const leadByTeam: Record<string, string> = {};
  let hodUserId = "";
  const seatEmployee = new Map<string, string>();
  const counters: Record<string, number> = {};

  for (const [code, name, designation, roleKey, teamCode] of people) {
    const first = name.split(" ")[0]!.toLowerCase();
    const emp = await db.employee.create({
      data: {
        employeeCode: code, name, designation, departmentId: its.id,
        email: `${first}.${name.split(" ")[1]!.toLowerCase()}@example.org`,
        phone: `0300-${code.slice(-4)}${Math.floor(rand() * 900 + 100)}`,
      },
    });
    if (!roleKey) continue;

    let username: string;
    if (roleKey === "HOD") username = "hod.its";
    else {
      const prefix = (teamCode ?? "its").toLowerCase();
      if (roleKey === "TEAM_LEAD") username = `${prefix}.lead`;
      else {
        counters[prefix] = (counters[prefix] ?? 0) + 1;
        username = `${prefix}.dev${String(counters[prefix]).padStart(2, "0")}`;
      }
    }
    const user = await db.user.create({
      data: {
        username, passwordHash: pwd, roleId: roles[roleKey]!, departmentId: its.id, employeeId: emp.id,
        displayTitle: designation, mustChangePassword: false,
      },
    });
    await db.userAssignment.create({ data: { userId: user.id, employeeId: emp.id, assignedAt: new Date(Date.now() - days(200)) } });
    seatEmployee.set(user.id, emp.id);

    if (roleKey === "HOD") hodUserId = user.id;
    if (teamCode) {
      await db.teamMembership.create({ data: { teamId: teams[teamCode]!, userId: user.id, isLead: roleKey === "TEAM_LEAD" } });
      userByTeam[teamCode]!.push(user.id);
      if (roleKey === "TEAM_LEAD") leadByTeam[teamCode] = user.id;
    }
  }

  // A second department with its own HOD (shows department isolation)
  const netEmp = await db.employee.create({
    data: { employeeCode: "EMP-2001", name: "Imran Qureshi", email: "imran.qureshi@example.org", phone: "0300-2001555", designation: "Head of Networks", departmentId: net.id },
  });
  const netHod = await db.user.create({
    data: { username: "hod.net", passwordHash: pwd, roleId: roles.HOD!, departmentId: net.id, employeeId: netEmp.id, displayTitle: "Head of Networks", mustChangePassword: false },
  });
  await db.userAssignment.create({ data: { userId: netHod.id, employeeId: netEmp.id } });

  console.log("Seeding demo tasks with history…");
  const titles: Record<string, [string, TaskType][]> = {
    HCM: [
      ["Payroll run failing for contract staff", "BUG"], ["Add new allowance element for faculty", "FEATURE"],
      ["Leave balance mismatch for employee", "DATA_FIX"], ["Self-service password reset not working", "SUPPORT"],
      ["Monthly headcount report", "REPORT"], ["Absence approval workflow change", "ENHANCEMENT"],
      ["Create new grade and step structure", "OPERATIONAL"], ["Tax deduction calculation issue", "BUG"],
    ],
    ERP: [
      ["Purchase order approval stuck at level 2", "BUG"], ["Custom vendor aging report", "REPORT"],
      ["GL period close support", "OPERATIONAL"], ["Budget check error on requisition", "BUG"],
      ["App Engine report performance tuning", "ENHANCEMENT"], ["New cost centre setup", "OPERATIONAL"],
      ["Asset depreciation correction", "DATA_FIX"], ["Supplier portal access request", "SUPPORT"],
    ],
    EOFFICE: [
      ["File movement not showing in tracking", "BUG"], ["Add digital signature on notes", "FEATURE"],
      ["Create user accounts for new section", "OPERATIONAL"], ["Dak diary search is slow", "ENHANCEMENT"],
      ["Printer template for noting sheet", "SUPPORT"], ["Restore deleted file attachment", "DATA_FIX"],
    ],
    INSIGHTS: [
      ["Admissions dashboard by region", "FEATURE"], ["Enrollment numbers mismatch with CMS", "BUG"],
      ["Add export to Excel on finance widget", "ENHANCEMENT"], ["Weekly KPI pack for management", "REPORT"],
      ["Refresh ETL job failing at night", "BUG"], ["Dashboard access for new directors", "SUPPORT"],
    ],
  };
  const offices = ["Registrar Office", "Finance Directorate", "Admissions", "Examinations", "HR Directorate", "VC Secretariat", "Regional Office Lahore", "Procurement"];
  const requesters = ["Mr. Shahid", "Ms. Rabia", "Dr. Naveed", "Mr. Adeel", "Ms. Saima", "Mr. Junaid", "Dr. Farah"];
  const sources: RequestSource[] = ["VERBAL", "WHATSAPP", "EMAIL", "CALL", "EMAIL", "WHATSAPP", "MEETING", "LETTER"];
  const priorities: TaskPriority[] = ["LOW", "MEDIUM", "MEDIUM", "MEDIUM", "HIGH", "HIGH", "CRITICAL"];

  const devPath: TaskStatus[] = ["ASSIGNED", "IN_DEVELOPMENT", "TESTING", "PENDING_UAT", "READY_FOR_DEPLOYMENT", "DEPLOYED", "CLOSED"];
  const opsPath: TaskStatus[] = ["ASSIGNED", "IN_PROGRESS", "COMPLETED", "CLOSED"];

  const now = Date.now();
  for (const teamCode of Object.keys(teams)) {
    const members = userByTeam[teamCode]!;
    const lead = leadByTeam[teamCode]!;
    const count = 22 + Math.floor(rand() * 10);
    for (let i = 0; i < count; i++) {
      const [title, type] = pick(titles[teamCode]!);
      const isDev = ["BUG", "FEATURE", "ENHANCEMENT"].includes(type);
      const path = isDev ? devPath : opsPath;
      const created = new Date(now - days(Math.floor(rand() * 95)) - Math.floor(rand() * days(1)));
      const ageDays = (now - created.getTime()) / days(1);
      // how far along the path this task got — older tasks tend to be further
      const maxStep = path.length;
      let step = Math.min(maxStep, Math.floor(rand() * (maxStep + 1) * Math.min(1, ageDays / 25 + 0.25)));
      if (rand() < 0.04) step = -1; // cancelled
      const assignee = rand() < 0.08 ? null : pick(members);
      const creator = rand() < 0.5 ? lead : pick(members);
      const due = new Date(created.getTime() + days(2 + Math.floor(rand() * (isDev ? 21 : 7))));

      const history: { status: TaskStatus; at: Date; by: string }[] = [];
      let t = created.getTime();
      const statuses = step === -1 ? (["CANCELLED"] as TaskStatus[]) : path.slice(0, assignee ? step : 0);
      for (const st of statuses) {
        t += Math.floor(rand() * days(isDev ? 4 : 1.5)) + 3600_000;
        if (t > now) break;
        const by = st === "CLOSED" || st === "CANCELLED" || st === "ASSIGNED" ? lead : assignee ?? lead;
        history.push({ status: st, at: new Date(t), by });
      }
      const final = history.at(-1)?.status ?? "NEW";
      const doneEntry = history.find((h) => ["DEPLOYED", "COMPLETED"].includes(h.status));
      const closedEntry = history.find((h) => h.status === "CLOSED");
      const progressMap: Partial<Record<TaskStatus, number>> = {
        NEW: 0, ASSIGNED: 0, IN_PROGRESS: 40, IN_DEVELOPMENT: 35, TESTING: 65, PENDING_UAT: 80,
        READY_FOR_DEPLOYMENT: 90, DEPLOYED: 100, COMPLETED: 100, CLOSED: 100, CANCELLED: 0,
      };

      const task = await db.task.create({
        data: {
          title, type, description: `Reported by ${pick(offices)}. ${isDev ? "Requires code change and UAT sign-off." : "Operational request."}`,
          priority: pick(priorities), source: pick(sources), requesterName: pick(requesters),
          requesterOffice: pick(offices), requesterContact: `0300-${Math.floor(rand() * 9000000 + 1000000)}`,
          applicationId: apps[teamCode]!, teamId: teams[teamCode]!, assigneeId: assignee, createdById: creator,
          status: final, progress: progressMap[final] ?? 0, startDate: history[0]?.at ?? null, dueDate: due,
          completedAt: doneEntry?.at ?? null,
          completedByEmployeeId: doneEntry ? seatEmployee.get(doneEntry.by) ?? null : null,
          closedAt: closedEntry?.at ?? null, createdAt: created,
        },
      });

      await db.taskActivity.create({
        data: { taskId: task.id, type: "CREATED", toStatus: "NEW", actorUserId: creator, actorEmployeeId: seatEmployee.get(creator), createdAt: created, note: "Task logged" },
      });
      let prev: TaskStatus = "NEW";
      for (const h of history) {
        await db.taskActivity.create({
          data: {
            taskId: task.id, type: h.status === "ASSIGNED" ? "ASSIGNED" : "STATUS_CHANGE",
            fromStatus: prev, toStatus: h.status, actorUserId: h.by, actorEmployeeId: seatEmployee.get(h.by),
            toAssigneeId: h.status === "ASSIGNED" ? assignee : null, createdAt: h.at,
            progress: progressMap[h.status] ?? null,
            note: h.status === "PENDING_UAT" ? "Shared with requester for UAT" : h.status === "DEPLOYED" ? "Deployed to production" : null,
          },
        });
        prev = h.status;
      }
    }
  }

  // A couple of notifications so the bell isn't empty on first login
  const hcmDev = userByTeam.HCM![1];
  if (hcmDev) {
    await db.notification.create({ data: { userId: hcmDev, title: "Welcome to TaskFlow", body: "Your tasks and deadlines appear on the dashboard.", link: "/dashboard" } });
  }
  if (hodUserId) {
    await db.notification.create({ data: { userId: hodUserId, title: "Weekly report ready", body: "Open Reports to see each team's progress.", link: "/reports" } });
  }

  const total = await db.task.count();
  console.log(`Done. ${total} demo tasks created.`);
  console.log("Logins → admin / Admin@123 · hod.its, hcm.lead, hcm.dev01 … / Password@123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
