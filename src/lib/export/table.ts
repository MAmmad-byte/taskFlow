import "server-only";
import { buildXlsx, type XlsxColumn } from "./xlsx";
import { PdfReport } from "./pdf";
import { fileName, fileResponse, ORG, type ExportFormat } from "./respond";
import { fmtDate, fmtDateTime } from "@/lib/utils";

export type ExportColumn = XlsxColumn & {
  /** relative column width in the PDF; `false` leaves the column out of the PDF */
  pdf?: number | false;
  align?: "left" | "right" | "center";
};

export function formatForPdf(v: unknown, type?: XlsxColumn["type"]): string {
  if (v === null || v === undefined || v === "") return "—";
  if (v instanceof Date) return type === "datetime" ? fmtDateTime(v) : fmtDate(v);
  if (type === "percent" && typeof v === "number") return `${Math.round(v * 100)}%`;
  return String(v);
}

/** One flat list exported as a single-sheet workbook or a landscape PDF table. */
export async function exportTable(
  fmt: ExportFormat,
  opts: { title: string; subtitle?: string; file: string; generatedBy?: string; columns: ExportColumn[]; rows: Record<string, unknown>[] },
) {
  const { title, subtitle, file, columns, rows } = opts;
  if (fmt === "xlsx") {
    const bytes = await buildXlsx([{ name: title, title, subtitle, columns, rows }]);
    return fileResponse(bytes, fileName(file, fmt), fmt);
  }
  const pdfCols = columns.filter((c) => c.pdf !== false);
  const pdf = await PdfReport.create({
    title,
    subtitle: [subtitle, `${rows.length} record${rows.length === 1 ? "" : "s"}`].filter(Boolean).join(" · "),
    org: ORG(),
    landscape: pdfCols.length > 5,
    generatedBy: opts.generatedBy,
  });
  pdf.table(
    pdfCols.map((c) => ({ header: c.header, width: typeof c.pdf === "number" ? c.pdf : 1, align: c.align ?? (c.type === "number" || c.type === "percent" ? "right" : "left") })),
    rows.map((r) => pdfCols.map((c) => formatForPdf(r[c.key], c.type))),
  );
  return fileResponse(await pdf.save(), fileName(file, fmt), fmt);
}
