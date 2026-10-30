import { Download, FileSpreadsheet, FileText } from "lucide-react";

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

/** Builds `/api/export/...?<params>&format=xlsx|pdf`, dropping pagination. */
export function exportHref(base: string, params: Params | undefined, format: "xlsx" | "pdf") {
  const qs = new URLSearchParams();
  if (params instanceof URLSearchParams) params.forEach((v, k) => qs.set(k, v));
  else if (params) for (const [k, v] of Object.entries(params)) if (typeof v === "string" && v) qs.set(k, v);
  qs.delete("page");
  qs.delete("welcome");
  qs.set("format", format);
  return `${base}?${qs.toString()}`;
}

/**
 * "Export" dropdown with Excel and PDF downloads. Uses <details> so it needs
 * no client JavaScript; the links are plain GET downloads.
 */
export function ExportMenu({
  base, params, formats = ["xlsx", "pdf"], label = "Export", note,
}: { base: string; params?: Params; formats?: ("xlsx" | "pdf")[]; label?: string; note?: string }) {
  return (
    <details className="group relative">
      <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 shadow-xs transition hover:bg-zinc-50 [&::-webkit-details-marker]:hidden">
        <Download className="size-4" /> {label}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl">
        {formats.includes("xlsx") && (
          <a href={exportHref(base, params, "xlsx")} download className="flex items-start gap-3 px-4 py-2.5 hover:bg-zinc-50">
            <FileSpreadsheet className="mt-0.5 size-4 text-emerald-700" />
            <span>
              <span className="block text-sm font-medium text-zinc-900">Excel (.xlsx)</span>
              <span className="block text-xs text-zinc-500">All columns, ready to filter and sort</span>
            </span>
          </a>
        )}
        {formats.includes("pdf") && (
          <a href={exportHref(base, params, "pdf")} download className="flex items-start gap-3 px-4 py-2.5 hover:bg-zinc-50">
            <FileText className="mt-0.5 size-4 text-red-600" />
            <span>
              <span className="block text-sm font-medium text-zinc-900">PDF</span>
              <span className="block text-xs text-zinc-500">Formatted for printing and sharing</span>
            </span>
          </a>
        )}
        {note && <p className="border-t border-zinc-100 px-4 py-2 text-[11px] text-zinc-500">{note}</p>}
      </div>
    </details>
  );
}
