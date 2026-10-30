"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { login } from "@/actions/auth";
import { initialState } from "@/lib/action-result";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, initialState);
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="mt-8 space-y-5">
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label htmlFor="username" className="field-label">Username</label>
        <input id="username" name="username" autoComplete="username" autoFocus required className="input h-11" placeholder="e.g. erp.dev01" />
      </div>
      <div>
        <label htmlFor="password" className="field-label">Password</label>
        <div className="relative">
          <input
            id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required
            className="input h-11 pr-11" placeholder="••••••••"
          />
          <button
            type="button" onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-zinc-400 hover:text-zinc-700"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      <button
        type="submit" disabled={pending}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 disabled:opacity-60"
      >
        {pending && <LoaderCircle className="size-4 animate-spin" />}
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-xs text-zinc-500">Forgot your password? Ask your HOD or administrator to reset it.</p>
    </form>
  );
}
