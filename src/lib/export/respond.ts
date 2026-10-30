import "server-only";
import { format } from "date-fns";

export type ExportFormat = "xlsx" | "pdf";

const MIME: Record<ExportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

export function exportFormat(v: string | null): ExportFormat | null {
  return v === "xlsx" || v === "pdf" ? v : null;
}

/** e.g. "tasks_2026-10-30.xlsx" */
export function fileName(base: string, fmt: ExportFormat) {
  const safe = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "export";
  return `${safe}_${format(new Date(), "yyyy-MM-dd")}.${fmt}`;
}

export function fileResponse(bytes: Uint8Array, name: string, fmt: ExportFormat) {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": MIME[fmt],
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

export function badRequest(msg: string, status = 400) {
  return new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export const ORG = () => process.env.NEXT_PUBLIC_ORG_NAME ?? "IT Services";
