import { getDb } from "../db";

export type BookFormat = "epub" | "pdf";

export interface Book {
  id: number;
  user_id: number;
  title: string;
  author: string | null;
  format: BookFormat;
  content_hash: string;
  file_name: string;
  file_size: number;
  r2_key: string;
  spine_json: string | null;
  page_count: number | null;
  word_count: number;
  created_at: string;
}

// Library list view: everything except the (potentially large) spine_json.
export type BookSummary = Omit<Book, "spine_json">;

const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 GB
const ALLOWED_EXTENSIONS = [".epub", ".pdf"] as const;

export { MAX_FILE_SIZE, ALLOWED_EXTENSIONS };

export function extOf(fileName: string): string {
  return "." + (fileName.toLowerCase().split(".").pop() || "");
}

export function formatForExt(ext: string): BookFormat | null {
  if (ext === ".epub") return "epub";
  if (ext === ".pdf") return "pdf";
  return null;
}

// --- Lookup helpers (used by upload-url dedup + import finalize) ---

export async function getBookByHash(
  userId: number,
  contentHash: string
): Promise<Book | undefined> {
  const db = await getDb();
  const { rows } = await db.query<Book>(
    "SELECT * FROM books WHERE user_id = $1 AND content_hash = $2",
    [userId, contentHash]
  );
  return rows[0];
}

export async function getBookById(
  bookId: number,
  userId: number
): Promise<Book | undefined> {
  const db = await getDb();
  const { rows } = await db.query<Book>(
    "SELECT * FROM books WHERE id = $1 AND user_id = $2",
    [bookId, userId]
  );
  return rows[0];
}

export async function getBooksByUser(userId: number): Promise<BookSummary[]> {
  const db = await getDb();
  const { rows } = await db.query<BookSummary>(
    `SELECT id, user_id, title, author, format, content_hash, file_name,
            file_size, r2_key, page_count, word_count, created_at
     FROM books WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

// --- Insert / delete (used by import finalize + library delete) ---

export interface CreateBookParams {
  userId: number;
  title: string;
  author?: string | null;
  format: BookFormat;
  contentHash: string;
  fileName: string;
  fileSize: number;
  r2Key: string;
  spineJson?: string | null;
  pageCount?: number | null;
  wordCount?: number;
}

export async function createBook(params: CreateBookParams): Promise<Book> {
  const db = await getDb();
  const { rows } = await db.query<Book>(
    `INSERT INTO books
       (user_id, title, author, format, content_hash, file_name, file_size,
        r2_key, spine_json, page_count, word_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      params.userId,
      params.title,
      params.author ?? null,
      params.format,
      params.contentHash,
      params.fileName,
      params.fileSize,
      params.r2Key,
      params.spineJson ?? null,
      params.pageCount ?? null,
      params.wordCount ?? 0,
    ]
  );
  return rows[0];
}

export async function deleteBook(bookId: number, userId: number): Promise<Book | null> {
  const db = await getDb();
  const { rows } = await db.query<Book>(
    "DELETE FROM books WHERE id = $1 AND user_id = $2 RETURNING *",
    [bookId, userId]
  );
  return rows[0] || null;
}
