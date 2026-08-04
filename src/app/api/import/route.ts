import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { createBook, extOf, formatForExt, getBookByHash, type BookFormat } from "@/lib/db/books";

// Body: { r2Key, contentHash, fileName, format, title? }
//
// Finalize inserts the book row WITHOUT reading the file back from R2.
// Railway's egress to r2.cloudflarestorage.com is blocked, so the server
// cannot fetch object bytes to probe/re-hash. Instead:
//   - dedup uses the client-computed contentHash (SHA-256 of the file),
//   - title is supplied by the client (filename-derived, per the chosen scope),
//   - spine_json / page_count are left null (the reader derives everything
//     from the file itself via foliate-js / pdf.js).
export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id: userId } = auth.user;

  const body = await request.json().catch(() => ({}));
  const r2Key = body?.r2Key?.toString() || "";
  const contentHash = body?.contentHash?.toString() || "";
  const fileName = body?.fileName?.toString() || "";
  const format = body?.format?.toString() as BookFormat | undefined;
  const title = body?.title?.toString().trim() || "";

  if (!r2Key || !contentHash || !fileName || !format) {
    return NextResponse.json(
      { error: "r2Key, contentHash, fileName, and format are required." },
      { status: 400 }
    );
  }

  // Validate format against extension.
  const ext = extOf(fileName);
  if (formatForExt(ext) !== format) {
    return NextResponse.json(
      { error: "File format does not match its extension." },
      { status: 400 }
    );
  }

  // K3: the r2Key must belong to this user's namespace prefix.
  if (!r2Key.startsWith(`u${userId}/`)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // Dedup by content hash (C8). No R2 read needed.
  const existing = await getBookByHash(userId, contentHash);
  if (existing) {
    return NextResponse.json(
      { error: "This book is already in your library." },
      { status: 409 }
    );
  }

  // Derive a display title from the filename if none supplied.
  const displayTitle =
    title ||
    fileName
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]/g, " ")
      .trim() ||
    "Untitled";

  const book = await createBook({
    userId,
    title: displayTitle,
    author: null,
    format,
    contentHash,
    fileName,
    fileSize: Number(body?.fileSize) || 0,
    r2Key,
    spineJson: null,
    pageCount: null,
  });

  return NextResponse.json({ bookId: book.id });
}
