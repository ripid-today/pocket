import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { getBookById } from "@/lib/db/books";
import { upsertBookmark } from "@/lib/db/bookmarks";

// Save the single bookmark for a book (overwrites). No auto-save anywhere —
// only this route is called from the "Save spot" CTA.
export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id: userId } = auth.user;

  const body = await request.json().catch(() => ({}));
  const bookId = Number(body?.bookId);
  const locator = body?.locator?.toString();

  if (!Number.isFinite(bookId) || !locator) {
    return NextResponse.json({ error: "bookId and locator are required." }, { status: 400 });
  }

  // Ownership check.
  const book = await getBookById(bookId, userId);
  if (!book) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  await upsertBookmark(userId, bookId, locator);
  return NextResponse.json({ success: true });
}
