import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

/**
 * Small report layout engine on top of pdf-lib: title block, headings,
 * KPI boxes, key/value grids, wrapped tables with repeating headers,
 * stacked bar charts and "Page x of y" footers. A4, portrait or landscape.
 */

const A4: [number, number] = [595.28, 841.89];
const M = 40; // page margin
const INK = rgb(0.09, 0.09, 0.11);
const MUTED = rgb(0.42, 0.42, 0.46);
const LINE = rgb(0.89, 0.89, 0.91);
const ZEBRA = rgb(0.975, 0.975, 0.98);
const BRAND = hex("#027a48");

export function hex(h: string): RGB {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export type PdfColumn = { header: string; width: number; align?: "left" | "right" | "center" };
export type PdfCell = string | { text: string; color?: string; bold?: boolean };

export class PdfReport {
  private doc!: PDFDocument;
  private font!: PDFFont;
  private bold!: PDFFont;
  private page!: PDFPage;
  private y = 0;
  private size: [number, number];
  private charset = new Set<number>();
  private footerText: string;

  private constructor(private opts: { title: string; subtitle?: string; org?: string; landscape?: boolean; generatedBy?: string }) {
    this.size = opts.landscape ? [A4[1], A4[0]] : A4;
    const stamp = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    this.footerText = `${opts.org ? opts.org + " · " : ""}Generated ${stamp}${opts.generatedBy ? " by " + opts.generatedBy : ""}`;
  }

  static async create(opts: { title: string; subtitle?: string; org?: string; landscape?: boolean; generatedBy?: string }) {
    const r = new PdfReport(opts);
    r.doc = await PDFDocument.create();
    r.doc.setTitle(opts.title);
    r.doc.setCreator("TaskFlow");
    r.doc.setProducer("TaskFlow");
    r.font = await r.doc.embedFont(StandardFonts.Helvetica);
    r.bold = await r.doc.embedFont(StandardFonts.HelveticaBold);
    r.charset = new Set(r.font.getCharacterSet());
    r.newPage(true);
    return r;
  }

  get width() {
    return this.size[0] - M * 2;
  }

  /** Standard fonts only cover WinAnsi; replace anything else so drawing never throws. */
  clean(s: unknown): string {
    const str = String(s ?? "")
      .replace(/\r/g, "")
      .replace(/[→⇒]/g, "->")
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\t/g, " ");
    let out = "";
    for (const ch of str) out += ch === "\n" || this.charset.has(ch.codePointAt(0)!) ? ch : "?";
    return out;
  }

  private newPage(first = false) {
    this.page = this.doc.addPage(this.size);
    const [w, h] = this.size;
    this.y = h - M;
    // brand rule at the top of each page
    this.page.drawRectangle({ x: 0, y: h - 4, width: w, height: 4, color: BRAND });
    if (first) {
      if (this.opts.org) {
        this.text(this.opts.org.toUpperCase(), M, this.y - 8, 8, this.bold, BRAND);
        this.y -= 16;
      }
      this.text(this.opts.title, M, this.y - 18, 18, this.bold, INK);
      this.y -= 26;
      if (this.opts.subtitle) {
        for (const line of this.wrap(this.opts.subtitle, this.font, 10, this.width)) {
          this.text(line, M, this.y - 10, 10, this.font, MUTED);
          this.y -= 14;
        }
      }
      this.y -= 6;
      this.page.drawLine({ start: { x: M, y: this.y }, end: { x: w - M, y: this.y }, thickness: 0.6, color: LINE });
      this.y -= 14;
    } else {
      this.text(this.opts.title, M, this.y - 8, 8, this.font, MUTED);
      this.y -= 22;
    }
  }

  private ensure(h: number) {
    if (this.y - h < M + 24) {
      this.newPage();
      return true;
    }
    return false;
  }

  private text(s: string, x: number, y: number, size: number, font: PDFFont, color: RGB = INK) {
    this.page.drawText(this.clean(s), { x, y, size, font, color });
  }

  wrap(s: string, font: PDFFont, size: number, max: number): string[] {
    const lines: string[] = [];
    for (const para of this.clean(s).split("\n")) {
      let cur = "";
      for (const word of para.split(/\s+/)) {
        if (!word) continue;
        const test = cur ? `${cur} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) <= max) {
          cur = test;
          continue;
        }
        if (cur) lines.push(cur);
        // hard-break words longer than the column
        let w = word;
        while (font.widthOfTextAtSize(w, size) > max && w.length > 1) {
          let i = w.length - 1;
          while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > max) i--;
          lines.push(w.slice(0, i));
          w = w.slice(i);
        }
        cur = w;
      }
      lines.push(cur);
    }
    return lines.length ? lines : [""];
  }

  heading(s: string) {
    this.ensure(40);
    this.y -= 8;
    this.text(s, M, this.y - 12, 12, this.bold, INK);
    this.y -= 22;
  }

  paragraph(s: string, size = 10, color: RGB = INK) {
    for (const line of this.wrap(s, this.font, size, this.width)) {
      this.ensure(size + 4);
      this.text(line, M, this.y - size, size, this.font, color);
      this.y -= size + 4;
    }
    this.y -= 4;
  }

  /** Row of KPI boxes. */
  stats(items: { label: string; value: string; color?: string }[]) {
    const gap = 8;
    const perRow = Math.min(items.length, this.opts.landscape ? 6 : 4);
    const w = (this.width - gap * (perRow - 1)) / perRow;
    const h = 46;
    for (let i = 0; i < items.length; i += perRow) {
      this.ensure(h + 8);
      items.slice(i, i + perRow).forEach((it, j) => {
        const x = M + j * (w + gap);
        this.page.drawRectangle({ x, y: this.y - h, width: w, height: h, borderColor: LINE, borderWidth: 0.8, color: rgb(1, 1, 1) });
        this.text(it.label, x + 8, this.y - 14, 8, this.font, MUTED);
        this.text(it.value, x + 8, this.y - 36, 16, this.bold, it.color ? hex(it.color) : INK);
      });
      this.y -= h + gap;
    }
    this.y -= 6;
  }

  /** Two-column label/value grid. */
  keyValues(items: { label: string; value: string }[], columns = 2) {
    const colW = this.width / columns;
    const labelW = Math.min(110, colW * 0.4);
    for (let i = 0; i < items.length; i += columns) {
      const row = items.slice(i, i + columns);
      const heights = row.map((it) => this.wrap(it.value || "—", this.font, 9.5, colW - labelW - 10).length);
      const h = Math.max(...heights) * 12 + 6;
      this.ensure(h);
      row.forEach((it, j) => {
        const x = M + j * colW;
        this.text(it.label, x, this.y - 10, 8.5, this.font, MUTED);
        this.wrap(it.value || "—", this.font, 9.5, colW - labelW - 10).forEach((ln, k) =>
          this.text(ln, x + labelW, this.y - 10 - k * 12, 9.5, this.font, INK),
        );
      });
      this.y -= h;
      this.page.drawLine({ start: { x: M, y: this.y + 2 }, end: { x: M + this.width, y: this.y + 2 }, thickness: 0.4, color: LINE });
    }
    this.y -= 8;
  }

  /** Wrapped table; column widths are fractions of the content width. Header repeats on each page. */
  table(columns: PdfColumn[], rows: PdfCell[][], opts: { size?: number; empty?: string } = {}) {
    const size = opts.size ?? 8.5;
    const total = columns.reduce((a, c) => a + c.width, 0);
    const widths = columns.map((c) => (c.width / total) * this.width);
    const pad = 4;
    const lineH = size + 2.5;

    const drawHeader = () => {
      const hLines = columns.map((c, i) => this.wrap(c.header, this.bold, size, widths[i]! - pad * 2));
      const h = Math.max(...hLines.map((l) => l.length)) * lineH + pad * 2;
      this.page.drawRectangle({ x: M, y: this.y - h, width: this.width, height: h, color: rgb(0.95, 0.96, 0.96) });
      let x = M;
      hLines.forEach((lines, i) => {
        lines.forEach((ln, k) => this.cellText(ln, x, widths[i]!, this.y - pad - size - k * lineH, size, this.bold, MUTED, columns[i]!.align));
        x += widths[i]!;
      });
      this.y -= h;
    };

    this.ensure(40);
    drawHeader();
    if (!rows.length) {
      this.text(opts.empty ?? "No records.", M + pad, this.y - 14, 9, this.font, MUTED);
      this.y -= 24;
      return;
    }
    rows.forEach((row, ri) => {
      const cells = row.map((c) => (typeof c === "string" ? { text: c } : c));
      const lines = cells.map((c, i) => this.wrap(c.text || "—", c.bold ? this.bold : this.font, size, widths[i]! - pad * 2));
      const h = Math.max(...lines.map((l) => l.length)) * lineH + pad * 2;
      if (this.ensure(h)) drawHeader();
      if (ri % 2 === 1) this.page.drawRectangle({ x: M, y: this.y - h, width: this.width, height: h, color: ZEBRA });
      let x = M;
      lines.forEach((ls, i) => {
        const c = cells[i]!;
        ls.forEach((ln, k) =>
          this.cellText(ln, x, widths[i]!, this.y - pad - size - k * lineH, size, c.bold ? this.bold : this.font, c.color ? hex(c.color) : INK, columns[i]!.align),
        );
        x += widths[i]!;
      });
      this.y -= h;
      this.page.drawLine({ start: { x: M, y: this.y }, end: { x: M + this.width, y: this.y }, thickness: 0.4, color: LINE });
    });
    this.y -= 12;
  }

  private cellText(s: string, x: number, w: number, y: number, size: number, font: PDFFont, color: RGB, align: PdfColumn["align"] = "left") {
    const tw = font.widthOfTextAtSize(this.clean(s), size);
    const tx = align === "right" ? x + w - 4 - tw : align === "center" ? x + (w - tw) / 2 : x + 4;
    this.text(s, tx, y, size, font, color);
  }

  /** Horizontal stacked bars with a legend, e.g. team progress by phase. */
  stackedBars(series: { key: string; label: string; color: string }[], rows: { label: string; values: Record<string, number> }[]) {
    const labelW = 120;
    const barH = 14;
    const gap = 8;
    const max = Math.max(1, ...rows.map((r) => series.reduce((a, s) => a + (r.values[s.key] ?? 0), 0)));
    const plotW = this.width - labelW - 40;

    this.ensure(20);
    let lx = M;
    for (const s of series) {
      this.page.drawRectangle({ x: lx, y: this.y - 9, width: 8, height: 8, color: hex(s.color) });
      this.text(s.label, lx + 12, this.y - 8, 8, this.font, MUTED);
      lx += 12 + this.font.widthOfTextAtSize(this.clean(s.label), 8) + 16;
    }
    this.y -= 22;

    for (const r of rows) {
      this.ensure(barH + gap);
      this.text(r.label, M, this.y - barH + 3, 9, this.font, INK);
      let x = M + labelW;
      let total = 0;
      for (const s of series) {
        const v = r.values[s.key] ?? 0;
        total += v;
        if (!v) continue;
        const w = (v / max) * plotW;
        this.page.drawRectangle({ x, y: this.y - barH, width: Math.max(w - 1, 0.5), height: barH, color: hex(s.color) });
        if (w > 18) {
          const t = String(v);
          this.text(t, x + w / 2 - this.bold.widthOfTextAtSize(t, 7) / 2, this.y - barH + 4, 7, this.bold, rgb(1, 1, 1));
        }
        x += w;
      }
      this.text(String(total), x + 6, this.y - barH + 4, 8, this.font, MUTED);
      this.y -= barH + gap;
    }
    this.y -= 8;
  }

  spacer(h = 10) {
    this.y -= h;
  }

  async save(): Promise<Uint8Array> {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      const [w] = this.size;
      const label = `Page ${i + 1} of ${pages.length}`;
      p.drawLine({ start: { x: M, y: M - 8 }, end: { x: w - M, y: M - 8 }, thickness: 0.4, color: LINE });
      p.drawText(this.clean(this.footerText), { x: M, y: M - 20, size: 7.5, font: this.font, color: MUTED });
      p.drawText(label, { x: w - M - this.font.widthOfTextAtSize(label, 7.5), y: M - 20, size: 7.5, font: this.font, color: MUTED });
    });
    return this.doc.save();
  }
}
