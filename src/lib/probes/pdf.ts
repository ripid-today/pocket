import { getDocumentProxy, getMeta } from "unpdf";

export interface PdfProbeResult {
  title: string;
  author?: string;
  pageCount: number;
}

// Probe a PDF's metadata + page count only. getDocumentProxy parses just the
// document structure (trailer + page tree), so even a large PDF is probed
// quickly without rendering or extracting every page's text.
//
// pdf.js takes ownership of the array it's handed and may detach it; copy first.
export async function probePdf(
  buffer: Buffer,
  fileName: string
): Promise<PdfProbeResult> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));

  const [meta] = await Promise.all([getMeta(pdf)]);

  const title = cleanMeta(meta.info?.Title) || titleFromFileName(fileName);
  const author = cleanMeta(meta.info?.Author);

  const pageCount = pdf.numPages;
  if (!pageCount || pageCount === 0) {
    throw new Error("No readable content found in this PDF.");
  }

  return { title, author, pageCount };
}

function titleFromFileName(fileName: string): string {
  return (
    fileName.replace(/\.pdf$/i, "").replace(/[-_]/g, " ").trim() || "Untitled"
  );
}

function cleanMeta(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
