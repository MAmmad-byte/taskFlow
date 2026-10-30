import "server-only";
import ExcelJS from "exceljs";

export type XlsxColumn = {
  header: string;
  key: string;
  width?: number;
  type?: "text" | "number" | "date" | "datetime" | "percent";
};

export type XlsxSheet = {
  name: string;
  title?: string;
  subtitle?: string;
  columns: XlsxColumn[];
  rows: Record<string, unknown>[];
};

const BRAND = "FF027A48";
const FORMATS: Partial<Record<NonNullable<XlsxColumn["type"]>, string>> = {
  number: "#,##0",
  date: "dd-mmm-yyyy",
  datetime: "dd-mmm-yyyy hh:mm",
  percent: "0%",
};

/**
 * Excel stores dates without a timezone and exceljs writes them as UTC.
 * Shift by the server's offset so the sheet shows local wall-clock time.
 */
function excelDate(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
}

function sheetName(name: string, used: Set<string>) {
  let base = name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Sheet";
  let n = 2;
  while (used.has(base.toLowerCase())) base = `${base.slice(0, 28)} ${n++}`;
  used.add(base.toLowerCase());
  return base;
}

/** Builds a styled workbook: optional title block, branded header row, frozen header, filters. */
export async function buildXlsx(sheets: XlsxSheet[], creator = "TaskFlow"): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = creator;
  wb.created = new Date();
  const used = new Set<string>();

  for (const s of sheets) {
    const ws = wb.addWorksheet(sheetName(s.name, used));
    let headerRow = 1;

    if (s.title) {
      const t = ws.getCell(1, 1);
      t.value = s.title;
      t.font = { bold: true, size: 14 };
      if (s.subtitle) {
        const st = ws.getCell(2, 1);
        st.value = s.subtitle;
        st.font = { size: 10, color: { argb: "FF6B7280" } };
      }
      headerRow = s.subtitle ? 4 : 3;
    }

    s.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = c.width ?? Math.max(12, Math.min(48, c.header.length + 4));
      const fmt = c.type ? FORMATS[c.type] : undefined;
      if (fmt) col.numFmt = fmt;
    });

    const header = ws.getRow(headerRow);
    s.columns.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FF05603A" } } };
    });
    header.height = 22;

    s.rows.forEach((r, ri) => {
      const row = ws.getRow(headerRow + 1 + ri);
      s.columns.forEach((c, ci) => {
        let v = r[c.key];
        if (v instanceof Date) v = excelDate(v);
        else if (v === undefined) v = null;
        row.getCell(ci + 1).value = v as ExcelJS.CellValue;
        row.getCell(ci + 1).alignment = { vertical: "top", wrapText: c.type === undefined || c.type === "text" };
      });
      if (ri % 2 === 1) {
        s.columns.forEach((_, ci) => {
          row.getCell(ci + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F7F8" } };
        });
      }
    });

    ws.views = [{ state: "frozen", ySplit: headerRow }];
    if (s.rows.length) {
      ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: s.columns.length } };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
