import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { getBookById } from "@/lib/db/books";
import { getObjectRange } from "@/lib/r2";

// Authenticated range-proxy: the reader (foliate-js / pdf.js) requests byte
// ranges here; this route streams them from private R2 after verifying the
// session + book ownership. The bucket itself never has a public URL (K5).
//
// Behavior:
//  - Range header present  → 206 Partial Content, stream the requested range.
//  - No Range header       → 206 with the first 64KB + hints to request more.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id: userId } = auth.user;

  const { id } = await params;
  const bookId = parseInt(id, 10);
  if (isNaN(bookId)) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }

  const book = await getBookById(bookId, userId);
  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const contentType =
    book.format === "epub" ? "application/epub+zip" : "application/pdf";

  // Parse the Range header. Supports "bytes=start-end", "bytes=start-",
  // and "bytes=-suffix" forms.
  const rangeHeader = request.headers.get("range") || "";
  const range = parseRange(rangeHeader);

  // First, HEAD-equivalent: we need the total size. getObjectRange returns it
  // from the Content-Range. If no Range, request the first 64KB to learn the
  // total (and serve it as the initial chunk).
  const FIRST_CHUNK = 64 * 1024;
  let start: number;
  let end: number;

  if (range) {
    start = range.start;
    end = range.end; // may be Infinity for open-ended; clamp below after we know total
  } else {
    start = 0;
    end = FIRST_CHUNK - 1;
  }

  // We don't know the total yet. Request start..end; if end is Infinity,
  // request start..(start + FIRST_CHUNK - 1) to bound it.
  const boundedEnd = end === Infinity ? start + FIRST_CHUNK - 1 : end;

  let result;
  try {
    result = await getObjectRange(book.r2_key, start, boundedEnd);
  } catch {
    return NextResponse.json({ error: "Could not read file." }, { status: 500 });
  }

  const total = result.total;
  if (total === 0) {
    return NextResponse.json({ error: "Empty file." }, { status: 500 });
  }

  // Clamp end to the last byte for the Content-Range header.
  const actualEnd = Math.min(boundedEnd, total - 1);
  const contentLength = actualEnd - start + 1;

  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Length": contentLength.toString(),
    "Content-Range": `bytes ${start}-${actualEnd}/${total}`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  });

  // 206 in all cases (range or first-chunk) so clients treat it as partial.
  return new NextResponse(result.body as unknown as BodyInit, {
    status: 206,
    headers,
  });
}

function parseRange(header: string): { start: number; end: number } | null {
  // Support "bytes=start-end" and "bytes=start-" (open-ended). These are the
  // two forms foliate-js and pdf.js actually emit.
  const match = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const start = parseInt(match[1], 10);
  const end = match[2] === "" ? Infinity : parseInt(match[2], 10);
  return { start, end };
}
