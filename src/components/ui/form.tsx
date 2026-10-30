"use client";

import { useEffect, useRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { ChevronDown, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/lib/action-result";
import { Button } from "./button";

export function Field({
  label, name, error, hint, required, children, className,
}: {
  label: string; name?: string; error?: string; hint?: string; required?: boolean; children: ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="field-label">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input id={props.name} aria-invalid={invalid || undefined} className={cn("input", className)} {...props} />;
}

export function Textarea({ className, invalid, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea id={props.name} aria-invalid={invalid || undefined} className={cn("input min-h-24 resize-y", className)} {...props} />;
}

export function Select({
  className, invalid, children, ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        id={props.name}
        aria-invalid={invalid || undefined}
        className={cn("input appearance-none pr-9", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
    </div>
  );
}

export function SubmitButton({
  children, pendingText, variant = "primary", size = "md", className,
}: {
  children: ReactNode; pendingText?: string; variant?: "primary" | "secondary" | "danger" | "outline"; size?: "sm" | "md"; className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending} className={className}>
      {pending && <LoaderCircle className="animate-spin" />}
      {pending ? pendingText ?? "Saving…" : children}
    </Button>
  );
}

/** Shows a toast whenever a server action returns a fresh result. Optionally resets the form on success. */
export function ActionFeedback({
  state, formRef, resetOnSuccess = false, onSuccess,
}: {
  state: ActionState; formRef?: React.RefObject<HTMLFormElement | null>; resetOnSuccess?: boolean; onSuccess?: () => void;
}) {
  const last = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!state.at || state.at === last.current) return;
    last.current = state.at;
    if (state.ok) {
      toast.success(state.message ?? "Saved");
      if (resetOnSuccess) formRef?.current?.reset();
      onSuccess?.();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, formRef, resetOnSuccess, onSuccess]);
  return null;
}

export function Checkbox({ label, description, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" className="mt-0.5 size-4 rounded border-zinc-300 accent-brand-700" {...props} />
      <span>
        <span className="block text-sm font-medium text-zinc-800">{label}</span>
        {description && <span className="block text-xs text-zinc-500">{description}</span>}
      </span>
    </label>
  );
}
