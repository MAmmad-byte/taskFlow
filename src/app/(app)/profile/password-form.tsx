"use client";

import { useActionState, useRef } from "react";
import { useRouter } from "next/navigation";
import { changePassword } from "@/actions/auth";
import { initialState } from "@/lib/action-result";
import { ActionFeedback, Field, Input, SubmitButton } from "@/components/ui/form";

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePassword, initialState);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const fe = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="space-y-4">
      <ActionFeedback state={state} formRef={ref} resetOnSuccess onSuccess={() => router.refresh()} />
      <Field label="Current password" name="current" error={fe.current}>
        <Input name="current" type="password" autoComplete="current-password" invalid={!!fe.current} />
      </Field>
      <Field label="New password" name="password" error={fe.password}>
        <Input name="password" type="password" autoComplete="new-password" invalid={!!fe.password} />
      </Field>
      <Field label="Confirm new password" name="confirm" error={fe.confirm}>
        <Input name="confirm" type="password" autoComplete="new-password" invalid={!!fe.confirm} />
      </Field>
      <SubmitButton className="w-full">Update password</SubmitButton>
    </form>
  );
}
