import type { Metadata } from "next";
import { SquareCheck, GitBranch, ChartLine, ShieldCheck } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "TaskFlow";
  const orgName = process.env.NEXT_PUBLIC_ORG_NAME ?? "IT Services";

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-brand-900 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(50,213,131,0.25),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(18,183,106,0.18),transparent_50%)]" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20">
              <SquareCheck className="size-5" />
            </span>
            <div>
              <p className="text-lg font-semibold">{appName}</p>
              <p className="text-xs text-brand-200">{orgName}</p>
            </div>
          </div>

          <div className="max-w-md">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">
              Every request, from the first call to sign-off.
            </h1>
            <p className="mt-4 text-brand-100/80">
              Log work from WhatsApp, email, calls or walk-ins, assign it to the right person, and follow it through
              development, UAT and deployment for Oracle HCM, ERP, eOffice and Insights.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-brand-50/90">
              <li className="flex items-center gap-3"><GitBranch className="size-4 text-brand-300" /> Full lifecycle tracking with history</li>
              <li className="flex items-center gap-3"><ChartLine className="size-4 text-brand-300" /> Team progress for any date range</li>
              <li className="flex items-center gap-3"><ShieldCheck className="size-4 text-brand-300" /> Role-based access for every level</li>
            </ul>
          </div>

          <p className="text-xs text-brand-200/70">© {new Date().getFullYear()} {orgName}</p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-lg bg-brand-700 text-white">
              <SquareCheck className="size-5" />
            </span>
            <p className="text-lg font-semibold">{appName}</p>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-1 text-sm text-zinc-500">Sign in with the username given by your HOD or administrator.</p>
          <LoginForm next={next} />
        </div>
      </div>
    </div>
  );
}
