import { getDb } from "../db";

export interface Bookmark {
  id: number;
  user_id: number;
  book_id: number;
  locator: string;
  updated_at: string;
}

// One bookmark per (user, book) — overwrites on each "Save spot" (G3).
export async function upsertBookmark(
  userId: number,
  bookId: number,
  locator: string
): Promise<Bookmark> {
  const db = await getDb();
  const { rows } = await db.query<Bookmark>(
    `INSERT INTO bookmarks (user_id, book_id, locator)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, book_id)
     DO UPDATE SET locator = excluded.locator, updated_at = now()
     RETURNING *`,
    [userId, bookId, locator]
  );
  return rows[0];
}

export async function getBookmark(
  userId: number,
  bookId: number
): Promise<Bookmark | undefined> {
  const db = await getDb();
  const { rows } = await db.query<Bookmark>(
    "SELECT * FROM bookmarks WHERE user_id = $1 AND book_id = $2",
    [userId, bookId]
  );
  return rows[0];
}

export async function deleteBookmark(userId: number, bookId: number): Promise<void> {
  const db = await getDb();
  await db.query("DELETE FROM bookmarks WHERE user_id = $1 AND book_id = $2", [
    userId,
    bookId,
  ]);
}
