import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import {
  createBook,
  extOf,
  formatForExt,
  getBookByHash,
} from "@/lib/db/books";
import { hashBuffer } from "@/lib/hash";
import { deleteObject, getObjectBuffer, headObject } from "@/lib/r2";
import { probeEpub } from "@/lib/probes/epub";
import { probePdf } from "@/lib/probes/pdf";

// Body: { r2Key, contentHash, fileName, format }
// Verifies the R2 object exists, re-hashes it server-side for dedup, probes
// metadata, and inserts the books row. The raw file stays in R2 (native render
// reads it back at read time via the range-proxy).
export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id: userId } = auth.user;

  const body = await request.json().catch(() => ({}));
  const r2Key = body?.r2Key?.toString() || "";
  const clientHash = body?.contentHash?.toString() || "";
  const fileName = body?.fileName?.toString() || "";
  const format = body?.format?.toString() as "epub" | "pdf" | undefined;

  if (!r2Key || !clientHash || !fileName || !format) {
    return NextResponse.json(
      { error: "r2Key, contentHash, fileName, and format are required." },
      { status: 400 }
    );
  }

  // K3: the r2Key must belong to this user's namespace prefix.
  if (!r2Key.startsWith(`u${userId}/`)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // Verify the object exists (C5).
  const head = await headObject(r2Key);
  if (!head) {
    return NextResponse.json(
      { error: "Uploaded file not found. Please try importing again." },
      { status: 404 }
    );
  }

  // Fetch + re-hash for authoritative dedup (C8: race / replay guard).
  let buffer: Buffer;
  try {
    buffer = await getObjectBuffer(r2Key);
  } catch {
    return NextResponse.json(
      { error: "Could not read the uploaded file." },
      { status: 500 }
    );
  }

  const serverHash = hashBuffer(buffer);
  if (serverHash !== clientHash) {
    // The client-computed hash must match what landed in R2.
    await deleteObject(r2Key);
    return NextResponse.json(
      { error: "File content changed during upload. Please try again." },
      { status: 400 }
    );
  }

  const existing = await getBookByHash(userId, serverHash);
  if (existing) {
    // Duplicate — clean up the orphan object we just uploaded.
    await deleteObject(r2Key);
    return NextResponse.json(
      { error: "This book is already in your library." },
      { status: 409 }
    );
  }

  // Probe metadata by format.
  let title: string;
  let author: string | null = null;
  let spineJson: string | null = null;
  let pageCount: number | null = null;

  try {
    if (format === "epub") {
      const probe = await probeEpub(buffer);
      title = probe.title;
      author = probe.author || null;
      spineJson = JSON.stringify(probe.spine);
    } else {
      const probe = await probePdf(buffer, fileName);
      title = probe.title;
      author = probe.author || null;
      pageCount = probe.pageCount;
    }
  } catch (err) {
    await deleteObject(r2Key);
    const msg = err instanceof Error ? err.message : "Could not parse this file.";
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  const book = await createBook({
    userId,
    title,
    author,
    format,
    contentHash: serverHash,
    fileName,
    fileSize: buffer.length,
    r2Key,
    spineJson,
    pageCount,
  });

  return NextResponse.json({ bookId: book.id });
}
