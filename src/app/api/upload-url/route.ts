import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import {
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
  extOf,
  formatForExt,
  getBookByHash,
} from "@/lib/db/books";
import { presignPut, r2KeyFor } from "@/lib/r2";

// Request body: { fileName, fileSize, contentHash }
// Returns: { presignedUrl, r2Key } — the browser then PUTs the file directly
// to R2 (bypassing any server body limit), then calls POST /api/import.
export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id: userId } = auth.user;

  const body = await request.json().catch(() => ({}));
  const fileName = body?.fileName?.toString() || "";
  const fileSize = Number(body?.fileSize);
  const contentHash = body?.contentHash?.toString() || "";

  if (!fileName || !Number.isFinite(fileSize) || !contentHash) {
    return NextResponse.json(
      { error: "fileName, fileSize, and contentHash are required." },
      { status: 400 }
    );
  }

  // Validate extension (B3).
  const ext = extOf(fileName);
  if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
    return NextResponse.json(
      { error: "Unsupported file format. Use EPUB or PDF." },
      { status: 400 }
    );
  }

  // Validate size (B4).
  if (fileSize > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File is too large. Maximum size is 1 GB." },
      { status: 400 }
    );
  }

  // Dedup by content hash (B5): abort before uploading.
  const existing = await getBookByHash(userId, contentHash);
  if (existing) {
    return NextResponse.json(
      { error: "This book is already in your library." },
      { status: 409 }
    );
  }

  const format = formatForExt(ext)!;
  const contentType = format === "epub" ? "application/epub+zip" : "application/pdf";
  const r2Key = r2KeyFor(userId, fileName);
  const presignedUrl = await presignPut(r2Key, contentType);

  return NextResponse.json({ presignedUrl, r2Key, format });
}
