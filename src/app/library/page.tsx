import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getBooksByUser, type BookSummary } from "@/lib/db/books";
import LibraryClient from "@/components/LibraryClient";

export default async function LibraryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const books = await getBooksByUser(user.id);

  return (
    <LibraryClient
      email={user.email}
      books={books.map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author,
        format: b.format,
        file_size: Number(b.file_size),
        created_at: b.created_at,
      })) satisfies Pick<BookSummary, "id" | "title" | "author" | "format" | "file_size" | "created_at">[]}
    />
  );
}
