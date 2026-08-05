// PDF text-reflow: turns pdf.js `TextContent` (positioned glyph fragments) into
// reflowable HTML blocks so font-size / line-height controls actually work on
// PDF books (native PDF is fixed-layout raster and cannot reflow).
//
// This module is intentionally pure & browser-agnostic so it can be unit-tested
// in node. It works on a minimal shape (`ReflowItem`) matching pdf.js TextItems,
// and returns arrays of blocks for the reader to render.

export interface ReflowItem {
  str: string;
  width: number;
  height: number;
  dir: string;
  // Horizontal origin (PDF points). Maps from TextItem.transform[4].
  x: number;
  // Base-line of the fragment. Maps from TextItem.transform[5].
  y: number;
  // Font size in points. Maps from TextItem.transform[0] (x scale).
  fontSize: number;
  hasEOL: boolean;
}

export type ReflowBlock =
  | { type: "p"; text: string }
  | { type: "h1"; text: string }
  | { type: "h2"; text: string };

interface Line {
  y: number;
  items: ReflowItem[];
}

// Two fragments are on the same line if their baselines are within this many
// points of each other.
const SAME_LINE_Y_TOL = 2.0;
// A line gap larger than this multiple of the median body line height starts a
// new paragraph.
const PARAGRAPH_GAP_MUL =
  process.env.REFLOW_PARAGRAPH_GAP_MUL
    ? parseFloat(process.env.REFLOW_PARAGRAPH_GAP_MUL)
    : 1.1;
// Font sizes above this ratio vs the median are treated as headings.
const H1_FONT_RATIO = 2.0;
const H2_FONT_RATIO = 1.35;

const isBlank = (s: string) => s.trim().length === 0;

/**
 * Cluster loose text items into visual lines (sorting by baseline then x) and
 * approximate each fragment's rendered width so we know its end x.
 */
function clusterLines(items: ReflowItem[]): Line[] {
  const lines: Line[] = [];
  for (const item of items) {
    if (!item.dir || !item.str || isBlank(item.str)) continue;
    // find an existing line whose baseline is close to this item's
    let line = lines.find((l) => Math.abs(l.y - item.y) <= SAME_LINE_Y_TOL);
    if (!line) {
      line = { y: item.y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  }

  // Sort items within a line left -> right. For RTL fragments pdf.js spaces
  // them in reading order already; sorting by x keeps visual order.
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
  }

  // Sort lines top -> bottom by baseline.
  lines.sort((a, b) => a.y - b.y);
  return lines;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function joinLineText(items: ReflowItem[]): string {
  // Join fragments of a line with a single space. pdf.js splits words into
  // fragments; adding one space between non-space fragments is the safest
  // reconstruction (avoids gluing "hel lo" and avoids double spaces).
  let out = "";
  for (const it of items) {
    const str = it.str.trim();
    if (!str) continue;
    out += (out && !out.endsWith(" ") ? " " : "") + str;
  }
  return out;
}

function fontSizeOf(item: ReflowItem): number {
  return Math.abs(item.fontSize) || 0;
}

/**
 * Build reflowable blocks from a single PDF page's text items.
 *
 * Heuristics (economics of reading reconstruction — we trade perfect layout
 * fidelity for readable, reflowable prose):
 *   - lines are separated by baseline deltas;
 *   - a vertical gap > ~1.1x the median line height ends a paragraph;
 *   - fragments much larger than the median font are headings.
 */
export function buildReflowBlocks(rawItems: ReflowItem[]): ReflowBlock[] {
  const items = rawItems.filter((it) => it.dir && it.str && !isBlank(it.str));
  if (items.length === 0) return [];

  const fontSizes = items.map(fontSizeOf).filter((s) => s > 0);
  const bodyFont = median(fontSizes) || 10;
  const lineHeights = items.map((it) => it.height).filter((h) => h > 0);
  const bodyLineH = median(lineHeights) || 14;

  const lines = clusterLines(items);
  const blocks: ReflowBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect headings from font size vs. the body median.
    const maxFont = Math.max(...line.items.map(fontSizeOf));
    const rel = bodyFont > 0 ? maxFont / bodyFont : 1;

    const text = joinLineText(line.items);
    if (!text) continue;

    if (rel >= H1_FONT_RATIO) {
      blocks.push({ type: "h1", text });
    } else if (rel >= H2_FONT_RATIO) {
      blocks.push({ type: "h2", text });
    } else {
      // Paragraph continuation: if the last block is a paragraph and the
      // vertical gap to it is small, append the line as a continuation
      // (with a space) so sentences flow across multiple visual lines.
      const last = blocks[blocks.length - 1];
      const gapToPrev =
        i > 0 ? lines[i].y - lines[i - 1].y : Infinity;
      const prevIsParagraph =
        blocks.length > 0 && blocks[blocks.length - 1].type === "p";
      const sameParagraph =
        prevIsParagraph && gapToPrev <= bodyLineH * PARAGRAPH_GAP_MUL + 1;

      if (sameParagraph) {
        blocks[blocks.length - 1] = {
          type: "p",
          text: last.type === "p" ? last.text + " " + text : text,
        };
      } else {
        blocks.push({ type: "p", text });
      }
    }
  }

  return blocks;
}

/**
 * Extract ReflowItem[] from a pdf.js page's text content result.
 * @param textContent the value of `await page.getTextContent()`.
 */
export function itemsFromTextContent(textContent: {
  items: Array<{
    str?: string;
    dir?: string;
    width?: number;
    height?: number;
    transform?: number[];
    hasEOL?: boolean;
    fontName?: string;
  }>;
}): ReflowItem[] {
  return textContent.items
    .filter(
      (it: any) => typeof it.str === "string" && it.str.trim().length > 0
    )
    .map((it: any): ReflowItem => {
      const t = it.transform || [0, 0, 0, 0, 0, 0];
      return {
        str: it.str,
        width: it.width ?? 0,
        height: it.height ?? 0,
        dir: it.dir ?? "ltr",
        x: t[4] ?? 0,
        y: t[5] ?? 0,
        fontSize: t[0] ?? 0,
        hasEOL: !!it.hasEOL,
      };
    });
}
