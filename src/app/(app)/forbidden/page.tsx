import { ShieldAlert } from "lucide-react";
import { LinkButton } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-10 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-red-50 text-red-600">
        <ShieldAlert className="size-6" />
      </span>
      <h1 className="mt-4 text-lg font-semibold">You don&apos;t have access to this page</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Your role doesn&apos;t include the permission needed here. If you think this is a mistake, ask your HOD or administrator.
      </p>
      <LinkButton href="/dashboard" variant="outline" className="mt-6">Back to dashboard</LinkButton>
    </div>
  );
}
