import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getBookById } from "@/lib/db/books";
import { getPreferences } from "@/lib/db/preferences";
import { getBookmark } from "@/lib/db/bookmarks";
import ReaderShell from "@/components/Reader/ReaderShell";

export default async function ReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const bookId = parseInt(id, 10);
  if (isNaN(bookId)) redirect("/library");

  const book = await getBookById(bookId, user.id);
  if (!book) redirect("/library");

  const [prefs, bookmark] = await Promise.all([
    getPreferences(user.id),
    getBookmark(user.id, bookId),
  ]);

  return (
    <ReaderShell
      bookId={book.id}
      title={book.title}
      format={book.format}
      pageCount={book.page_count}
      prefs={{ fontSize: prefs.font_size, lineHeight: prefs.line_height }}
      bookmark={bookmark ? { locator: bookmark.locator } : null}
    />
  );
}
