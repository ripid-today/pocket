"use server";

import { getSessionUser } from "@/lib/auth";
import { deleteBook } from "@/lib/db/books";
import { deleteObject } from "@/lib/r2";
import { revalidatePath } from "next/cache";

// Delete a book: remove the DB row (cascades its bookmark), then delete the
// raw file from R2. R2 failure is logged but not fatal (H6) — the DB row is
// already gone and the orphan object can be cleaned later.
export async function deleteBookAction(
  bookId: number
): Promise<{ success: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  const book = await deleteBook(bookId, user.id);
  if (!book) {
    return { success: false, error: "Book not found." };
  }

  await deleteObject(book.r2_key);
  revalidatePath("/library");
  return { success: true };
}
