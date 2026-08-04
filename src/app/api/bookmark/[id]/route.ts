import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { getBookById } from "@/lib/db/books";
import { getBookmark } from "@/lib/db/bookmarks";

// Fetch the saved bookmark for restore on open/refresh.
export async function GET(
  _request: Request,
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
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  const bookmark = await getBookmark(userId, bookId);
  return NextResponse.json({ locator: bookmark?.locator ?? null });
}
