import { z } from "zod";

/** Parses yyyy-MM-dd from <input type="date"> as a local time-of-day (start or end of that day). */
const optionalDate = (time: "start" | "end") =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T${time === "end" ? "23:59:59" : "00:00:00"}` : v;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
        return z.NEVER;
      }
      return d;
    });

export const taskStatusEnum = z.enum([
  "NEW", "ASSIGNED", "IN_PROGRESS", "ON_HOLD", "IN_DEVELOPMENT", "TESTING", "PENDING_UAT",
  "UAT_FAILED", "READY_FOR_DEPLOYMENT", "DEPLOYED", "COMPLETED", "CLOSED", "CANCELLED",
]);
export const taskTypeEnum = z.enum(["BUG", "FEATURE", "ENHANCEMENT", "OPERATIONAL", "SUPPORT", "DATA_FIX", "REPORT"]);
export const priorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const sourceEnum = z.enum(["VERBAL", "WHATSAPP", "EMAIL", "CALL", "LETTER", "MEETING", "OTHER"]);

export const taskSchema = z.object({
  title: z.string({ required_error: "Title is required" }).min(3, "At least 3 characters").max(200),
  description: z.string().max(5000).optional(),
  type: taskTypeEnum.default("SUPPORT"),
  priority: priorityEnum.default("MEDIUM"),
  source: sourceEnum.default("VERBAL"),
  requesterName: z.string().max(120).optional(),
  requesterContact: z.string().max(120).optional(),
  requesterOffice: z.string().max(160).optional(),
  applicationId: z.string().optional(),
  teamId: z.string({ required_error: "Choose a team" }),
  assigneeId: z.string().optional(),
  startDate: optionalDate("start"),
  dueDate: optionalDate("end"),
});

export const statusUpdateSchema = z.object({
  taskId: z.string(),
  status: taskStatusEnum,
  note: z.string().max(2000).optional(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
});

export const commentSchema = z.object({
  taskId: z.string(),
  note: z.string({ required_error: "Write a note" }).min(1, "Write a note").max(2000),
  progress: z.coerce.number().int().min(0).max(100).optional(),
});

export const assignSchema = z.object({
  taskId: z.string(),
  assigneeId: z.string().optional(),
  note: z.string().max(2000).optional(),
});

export const teamSchema = z.object({
  name: z.string({ required_error: "Name is required" }).min(2).max(100),
  code: z
    .string({ required_error: "Code is required" })
    .min(2)
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, - and _ only")
    .transform((v) => v.toUpperCase()),
  description: z.string().max(500).optional(),
  departmentId: z.string().optional(),
});

export const employeeSchema = z.object({
  employeeCode: z.string({ required_error: "Employee ID is required" }).min(2).max(30),
  name: z.string({ required_error: "Name is required" }).min(2).max(120),
  email: z.string({ required_error: "Email is required" }).email("Enter a valid email"),
  phone: z.string().max(30).optional(),
  designation: z.string().max(120).optional(),
  departmentId: z.string().optional(),
});

const password = z
  .string()
  .min(8, "At least 8 characters")
  .regex(/[A-Za-z]/, "Include a letter")
  .regex(/[0-9]/, "Include a number");

export const userCreateSchema = z.object({
  username: z
    .string({ required_error: "Username is required" })
    .min(3)
    .max(40)
    .regex(/^[a-z0-9._-]+$/, "Lowercase letters, numbers, dot, dash and underscore only"),
  displayTitle: z.string().max(80).optional(),
  roleId: z.string({ required_error: "Choose a role" }),
  departmentId: z.string().optional(),
  employeeId: z.string().optional(),
  teamId: z.string().optional(),
  password,
});

export const userUpdateSchema = z.object({
  userId: z.string(),
  displayTitle: z.string().max(80).optional(),
  roleId: z.string({ required_error: "Choose a role" }),
  departmentId: z.string().optional(),
  isActive: z.enum(["on"]).optional(),
});

export const seatAssignSchema = z.object({
  userId: z.string(),
  employeeId: z.string().optional(),
  note: z.string().max(300).optional(),
});

export const passwordResetSchema = z.object({ userId: z.string(), password });

export const changePasswordSchema = z
  .object({ current: z.string().min(1, "Enter your current password"), password, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords do not match" });

export const departmentSchema = z.object({
  code: z.string().min(2).max(20).transform((v) => v.toUpperCase()),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
});

export const applicationSchema = z.object({
  code: z.string().min(2).max(20).transform((v) => v.toUpperCase()),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Hex colour like #2a78d6").default("#2a78d6"),
});

export const roleSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(30)
    .regex(/^[A-Za-z_]+$/, "Letters and underscore only")
    .transform((v) => v.toUpperCase()),
  name: z.string().min(2).max(60),
  description: z.string().max(300).optional(),
  level: z.coerce.number().int().min(1).max(99),
});
