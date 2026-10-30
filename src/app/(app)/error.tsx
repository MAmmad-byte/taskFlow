"use client";

import { OctagonAlert } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-10 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-red-50 text-red-600">
        <OctagonAlert className="size-6" />
      </span>
      <h1 className="mt-4 text-lg font-semibold">Something went wrong</h1>
      <p className="mt-1 text-sm text-zinc-500">The page couldn't be loaded. Try again, and if it keeps happening tell your administrator.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-zinc-400">Ref: {error.digest}</p>}
      <button onClick={reset} className="mt-6 h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800">
        Try again
      </button>
    </div>
  );
}
