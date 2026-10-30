"use client";

import { createContext, useCallback, useContext, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

const ModalContext = createContext<{ close: () => void }>({ close: () => {} });
export const useModal = () => useContext(ModalContext);

export function Modal({
  trigger, title, description, children, size = "md", triggerVariant = "primary", triggerSize = "md", triggerClassName,
}: {
  trigger: ReactNode; title: string; description?: string; children: ReactNode;
  size?: "sm" | "md" | "lg"; triggerVariant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  triggerSize?: "sm" | "md" | "icon"; triggerClassName?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useCallback(() => ref.current?.close(), []);
  const width = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" }[size];

  return (
    <ModalContext.Provider value={{ close }}>
      <Button variant={triggerVariant} size={triggerSize} className={triggerClassName} onClick={() => ref.current?.showModal()}>
        {trigger}
      </Button>
      <dialog
        ref={ref}
        className={cn("m-auto w-[calc(100%-2rem)] rounded-2xl border border-zinc-200 bg-white p-0 shadow-2xl", width)}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-zinc-500">{description}</p>}
          </div>
          <button type="button" onClick={close} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-6 py-5">{children}</div>
      </dialog>
    </ModalContext.Provider>
  );
}
