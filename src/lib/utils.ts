import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNowStrict, isValid } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDate(d: Date | string | null | undefined, pattern = "dd MMM yyyy") {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return isValid(date) ? format(date, pattern) : "—";
}

export function fmtDateTime(d: Date | string | null | undefined) {
  return fmtDate(d, "dd MMM yyyy, h:mm a");
}

export function fromNow(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return isValid(date) ? formatDistanceToNowStrict(date, { addSuffix: true }) : "—";
}

/** yyyy-MM-dd for <input type="date"> */
export function toDateInput(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return isValid(date) ? format(date, "yyyy-MM-dd") : "";
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** Read a single string from Next.js searchParams. */
export function sp(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}
