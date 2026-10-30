# TaskFlow — team task tracking

A Next.js + PostgreSQL application for an IT team that handles operations, development and bug fixes for **Oracle HCM, ERP, eOffice and Insights**. Requests arrive by WhatsApp, email, phone, letter or walk-in; TaskFlow records each one and follows it from assignment to sign-off, including the development cycle (development → testing → UAT → deployment).

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, Server Components, Server Actions), React 19, TypeScript |
| Styling | Tailwind CSS v4 with a custom minimalist design system (no template lock-in) |
| Database | PostgreSQL via Prisma ORM |
| Auth | Signed JWT session in an httpOnly cookie (`jose`), passwords hashed with bcrypt |
| Charts | Recharts with a colour-blind-safe palette |
| Validation | Zod on every server action |

## Quick start

```bash
# 1. Database (or point DATABASE_URL at an existing PostgreSQL server)
docker compose up -d

# 2. Configure
cp .env.example .env          # then set AUTH_SECRET (openssl rand -base64 32)

# 3. Install, create tables, load demo data
npm install
npx prisma migrate dev --name init
npm run db:seed

# 4. Run
npm run dev                   # http://localhost:3000
```

For production: `npm run build && npx prisma migrate deploy && npm start`.
To set up without the demo data, run `npx tsx prisma/seed.ts --no-demo`. That creates only the roles, permissions, applications and the `admin` account.

### Demo logins

| Username | Password | Role | What to try |
|---|---|---|---|
| `admin` | `Admin@123` | Administrator | Everything, including departments, applications, the roles & permissions matrix and the audit log |
| `hod.its` | `Password@123` | HOD, IT Services | Create teams and users, place employees on seats, see department reports, look up employee progress |
| `hod.net` | `Password@123` | HOD, Networks | Department isolation: sees none of IT Services' data |
| `hcm.lead` | `Password@123` | Team Lead, HCM | Assign work, move tasks through the workflow, close or cancel tasks |
| `hcm.dev01` | `Password@123` | Member, HCM | Log tasks, update your own tasks, see your own progress |

Other seats: `erp.lead`, `erp.dev01`, `erp.dev02`, `eoffice.lead`, `eoffice.dev01`, `eoffice.dev02`, `insights.lead`, `insights.dev01`.
**Change every password before going live.**

## How it works

### Organisation model

```
Department ──< Team ──< TeamMembership >── User (login seat) ── Employee (person on HR register)
```

* An **Employee** is a person: Employee ID, name, email, contact number, department.
* A **User** is a login *seat*, for example `erp.dev01`. A HOD creates the seat and places an employee on it.
* **Tasks belong to the seat, not the person.** If an employee is transferred, the HOD puts someone else on the seat. All open tasks then show under the new person, and every past action keeps the name of whoever did it (`TaskActivity.actorEmployeeId`). The seat history is kept in `UserAssignment`.
* Completion credit is stored per employee (`Task.completedByEmployeeId`). An admin or HOD can look up anyone's history by **Employee ID** on *My progress → Look up*.

### Roles & permissions

Permissions live in the database (`Permission`, `RolePermission`). The admin can change them on **Administration → Roles & permissions**, and changes apply immediately.

| | Admin | HOD | Team Lead | Member |
|---|:-:|:-:|:-:|:-:|
| Data scope | all departments | own department | teams they lead or belong to | own tasks + own teams |
| Log & assign tasks | ✓ | ✓ | ✓ | ✓ (within own team) |
| Update status of own tasks | ✓ | ✓ | ✓ | ✓ |
| Update status of any team task | ✓ | ✓ | ✓ | – |
| Close / cancel / reopen | ✓ | ✓ | ✓ | – |
| Create teams, manage members & leads | ✓ | ✓ | – | – |
| Create users, place employees on seats | ✓ | ✓ (roles below HOD) | – | – |
| Reports & charts | ✓ | ✓ | ✓ | – |
| Progress by Employee ID | ✓ | ✓ (own dept) | – | – |
| Departments, applications, roles, audit | ✓ | – | – | – |

Every check runs on the server. `src/lib/auth.ts` holds the row-level scopes (which tasks, teams and users a person can see) and the object-level checks (`canMoveTo`, `canAssignTask`, `canManageUser`…). The UI only hides what the server would refuse anyway.

### Task lifecycle

```
Operational / support:   New → Assigned → In progress → Completed → Closed
Development (SDLC):      New → Assigned → In development → Testing → Pending UAT
                              → Ready to deploy → Deployed → Closed
                         (UAT failed → back to In development; On hold / Cancelled from most states)
```

Allowed moves are defined once in `src/lib/workflow.ts`. Moving to *On hold*, *UAT failed* or *Cancelled* requires a reason. Every change, assignment and note is written to the task's history with a timestamp and the employee who made it.

### Deadline alerts

When someone signs in, a dialog lists their **overdue**, **due today** and **due in the next 48 h** tasks. Team leads also see these for their teams. The window is set by `DEADLINE_WARNING_HOURS`. The bell icon shows assignment and status notifications.

### Reports

**Reports** works for any date range (7D / 30D / 90D / 12M or custom) and can be filtered to one team. It shows:
* KPIs: tasks logged, tasks completed, open now, overdue now, on-time rate, and average time to resolve
* **Team progress**: a stacked bar per team showing where that period's tasks stand now
* **Logged vs completed** trend (daily, or weekly for long ranges)
* Status breakdown, volume by application, and workload per person

Each chart has a **Table** view for accessibility and for copying figures.

## Excel & PDF exports

Each list or report has an **Export** button with Excel (.xlsx) and PDF options. Exports run on the server and only include data the user is allowed to see.

| Where | Excel | PDF |
|---|---|---|
| Tasks list | Every task matching the current view and filters (all pages, up to 5,000) with all columns: requester, dates, employee IDs and description | Landscape table of the key columns |
| Task detail → *Task sheet* | Details and full history, on two sheets | One-page task record with history and a "Verified by / Date" box for UAT or sign-off files |
| Reports | Summary, team progress, trend, status, application and workload, each on its own sheet | KPI boxes, team-progress bar chart and the supporting tables |
| My progress / employee lookup | Summary, completed, open and daily sheets | Summary plus completed and open tables |
| Users, Employees, Audit log | Full list | Printable table |

The download endpoints live under `src/app/api/export/`, and the shared builders are in `src/lib/export/`. Excel files are made with `exceljs` and PDFs with `pdf-lib`. PDFs use the built-in Helvetica font, so characters outside Western European text (for example Urdu) appear as `?` in PDFs only. Excel exports keep them correctly.

## Project structure

```
prisma/
  schema.prisma          data model
  seed.ts                roles, permissions, demo organisation and ~100 tasks with history
src/
  middleware.ts          route protection (edge)
  actions/               server actions: auth, tasks, teams, users, admin
  lib/
    auth.ts              session → user, permission checks, data scopes
    permissions.ts       permission catalogue + default role grants
    workflow.ts          statuses, transitions, labels, colours
    queries.ts           dashboard, deadline, report and progress queries
    validators.ts        zod schemas
  components/            ui kit, layout shell, task widgets, charts, admin forms
  app/
    login/               sign-in
    (app)/               authenticated area: dashboard, tasks, teams, users,
                         employees, reports, progress, profile, admin/*
```

## Notes for deployment

* Set a strong `AUTH_SECRET`. Sessions last `SESSION_HOURS` hours (12 by default).
* New users must change their temporary password at first sign-in.
* Every admin action and sign-in goes to the `AuditLog` table, which you can read under Administration → Audit log.
* To brand the app, set `NEXT_PUBLIC_APP_NAME` and `NEXT_PUBLIC_ORG_NAME`, and adjust the `--color-brand-*` values in `src/app/globals.css`.
