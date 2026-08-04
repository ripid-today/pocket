import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { getBookById } from "@/lib/db/books";
import { presignGet } from "@/lib/r2";

// Authenticated endpoint that hands the reader a short-lived presigned GET URL
// to the book's bytes in R2, so the BROWSER fetches the file directly from R2.
//
// Why: Railway's egress to r2.cloudflarestorage.com is blocked, so the server
// cannot proxy book bytes (the reader's range-proxy returned 'Could not read
// file'). Uploads already go browser->R2 via presigned PUT; reads now mirror
// that with a presigned GET. The URL is short-lived (120s) and the bucket stays
// private, so a leaked URL is useless almost immediately.
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

  const expiresIn = 120; // seconds; reader re-fetches a fresh URL per open
  const url = await presignGet(book.r2_key, expiresIn);

  return NextResponse.json({
    url,
    r2Key: book.r2_key,
    expiresIn,
    format: book.format,
    fileName: book.file_name,
  });
}
