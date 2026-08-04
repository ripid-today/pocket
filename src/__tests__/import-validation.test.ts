import { describe, it, expect } from "vitest";
import {
  MAX_FILE_SIZE,
  ALLOWED_EXTENSIONS,
  extOf,
  formatForExt,
} from "@/lib/db/books";

describe("import validation (B3, B4, I4)", () => {
  it("accepts epub and pdf only", () => {
    expect([...ALLOWED_EXTENSIONS]).toEqual([".epub", ".pdf"]);
    expect(formatForExt(".epub")).toBe("epub");
    expect(formatForExt(".pdf")).toBe("pdf");
    expect(formatForExt(".txt")).toBeNull();
    expect(formatForExt(".docx")).toBeNull();
  });

  it("enforces a 1 GB cap", () => {
    expect(MAX_FILE_SIZE).toBe(1024 * 1024 * 1024);
  });

  it("extracts the lowercase extension", () => {
    expect(extOf("Book.PDF")).toBe(".pdf");
    expect(extOf("my book.epub")).toBe(".epub");
  });
});
