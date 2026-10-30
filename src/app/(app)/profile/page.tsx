import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { Avatar, Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui/misc";
import { ChangePasswordForm } from "./password-form";
import { sp } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const first = sp((await searchParams).first) === "1" || user.mustChangePassword;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Profile" description="Your account details and password" />
      {first && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" />
          <p>Please set a new password before continuing. You were given a temporary one.</p>
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <div className="flex items-center gap-4 border-b border-zinc-100 px-5 py-5">
            <Avatar name={user.displayName} size="lg" />
            <div>
              <p className="font-semibold">{user.displayName}</p>
              <p className="text-sm text-zinc-500">@{user.username} · {user.role.name}</p>
            </div>
          </div>
          <div className="py-2">
            <DescriptionList
              items={[
                { label: "Employee ID", value: user.employee?.employeeCode ?? "—" },
                { label: "Email", value: user.employee?.email ?? "—" },
                { label: "Contact", value: user.employee?.phone ?? "—" },
                { label: "Department", value: user.departmentName ?? "—" },
                { label: "Teams", value: user.teams.map((t) => `${t.name}${t.isLead ? " (lead)" : ""}`).join(", ") || "—" },
                { label: "Permissions", value: `${user.permissions.size} granted via role` },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Change password" description="At least 8 characters, including a letter and a number" />
          <div className="p-5"><ChangePasswordForm /></div>
        </Card>
      </div>
    </div>
  );
}
