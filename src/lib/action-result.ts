import type { ZodError } from "zod";

export type ActionState = {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** bump to let client forms know a fresh result arrived */
  at?: number;
};

export const initialState: ActionState = { ok: false };

export function fail(error: string, fieldErrors?: Record<string, string>): ActionState {
  return { ok: false, error, fieldErrors, at: Date.now() };
}

export function success(message: string): ActionState {
  return { ok: true, message, at: Date.now() };
}

export function zodFail(err: ZodError): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fail("Please correct the highlighted fields.", fieldErrors);
}

/** Convert FormData into a plain object, turning empty strings into undefined. */
export function formObject(fd: FormData) {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    out[k] = trimmed === "" ? undefined : trimmed;
  }
  return out;
}
