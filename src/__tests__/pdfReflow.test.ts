import { describe, it, expect } from "vitest";
import {
  buildReflowBlocks,
  itemsFromTextContent,
  type ReflowItem,
} from "@/lib/pdfReflow";

function line(
  items: Array<[string, number, number]>, // [text, x, fontSize]
  y: number,
  hasEOL = true
): ReflowItem[] {
  return items.map(([str, x, fontSize], k) => ({
    str,
    width: str.length * fontSize * 0.5,
    height: fontSize * 1.2,
    dir: "ltr",
    x,
    y,
    fontSize,
    hasEOL: hasEOL && k === items.length - 1,
  }));
}

describe("pdfReflow", () => {
  it("reconstructs simple paragraphs and headings", () => {
    // body font 12, heading font 24
    const rows: ReflowItem[] = [
      ...line([["Chapter", 100, 24], ["One", 160, 24]], 100), // h1
      ...line([["This", 100, 12], ["is", 180, 12]], 150), // first body line
      ...line([["a", 100, 12], ["paragraph", 180, 12]], 166), // continuation
      ...line([["Second", 100, 12], ["paragraph", 180, 12]], 200), // new para (gap)
    ];
    const blocks = buildReflowBlocks(rows);
    const texts = blocks.map((b) => (b.type === "p" ? b.text : `h:${b.text}`));
    // Assert all tokens are present and headings are detected.
    expect(blocks[0].type).toBe("h1");
    expect(blocks[0].text).toBe("Chapter One");
    // Paragraph 1 (continuation merged)
    const p1 = blocks.find((b) => b.type === "p") as any;
    expect(p1.text).toContain("This is a");
    expect(p1.text).toContain("paragraph");
    // Paragraph 2 separate (large gap)
    const pTexts = blocks.filter((b) => b.type === "p").map((b) => b.text);
    expect(pTexts.some((t) => t.startsWith("Second paragraph"))).toBe(true);
    expect(texts.length).toBeGreaterThanOrEqual(3);
  });

  it("ignores empty lines and blank fragments", () => {
    const rows: ReflowItem[] = [
      ...line([["  ", 100, 12], ["Hello", 150, 12]], 100),
    ];
    const blocks = buildReflowBlocks(rows);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("p");
    expect(blocks[0].text).not.toContain("  ");
  });

  it("returns empty for no content", () => {
    expect(buildReflowBlocks([])).toEqual([]);
  });

  it("maps pdf.js text content result to items", () => {
    const items = itemsFromTextContent({
      items: [
        { str: "Hi", dir: "ltr", width: 30, height: 12, transform: [12,0,0,12,50,70] },
        { str: "", dir: "ltr", width: 0, height: 0, transform: [12,0,0,12,50,90] },
        { type: "beginMarkedContent", id: "x" } as any,
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ str: "Hi", x: 50, y: 70, fontSize: 12 });
  });
});
