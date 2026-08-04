"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/lib/actions/auth";
import { deleteBookAction } from "@/lib/actions/books";
import ImportDialog from "@/components/ImportDialog";

interface BookRow {
  id: number;
  title: string;
  author: string | null;
  format: "epub" | "pdf";
  file_size: number;
  created_at: string;
}

export default function LibraryClient({
  email,
  books,
}: {
  email: string;
  books: BookRow[];
}) {
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);

  return (
    <main className="flex flex-col min-h-screen bg-black">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/80 backdrop-blur-md safe-top">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white text-black">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.832 5.477 15.418 5 17.25 5s3.332.477 4.5 1.253" />
              </svg>
            </span>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-white leading-tight truncate">Pocket</h1>
              <p className="text-xs text-white/40 truncate">{email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 h-10 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 active:bg-white/80 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Import</span>
            </button>
            <button
              onClick={() => logoutAction()}
              title="Sign out"
              aria-label="Sign out"
              className="flex items-center justify-center w-10 h-10 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Book list */}
      <div className="flex-1 w-full max-w-4xl mx-auto px-2 sm:px-6 py-4">
        {books.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center px-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 text-white/40 mb-5">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.832 5.477 15.418 5 17.25 5s3.332.477 4.5 1.253" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white mb-1">Your library is empty</h2>
            <p className="text-sm text-white/50 mb-6">Import an EPUB or PDF to start reading.</p>
            <button
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5 px-5 h-11 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Import your first book
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-white/5 rounded-xl border border-white/10 overflow-hidden">
            {books.map((b) => (
              <BookRowItem key={b.id} book={b} onDeleted={() => router.refresh()} />
            ))}
          </ul>
        )}
      </div>

      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
    </main>
  );
}

function BookRowItem({ book, onDeleted }: { book: BookRow; onDeleted: () => void }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    const res = await deleteBookAction(book.id);
    if (res.success) onDeleted();
  }

  return (
    <li
      className="group flex items-center gap-3 px-4 sm:px-5 py-4 bg-white/[0.02] hover:bg-white/[0.06] active:bg-white/[0.08] transition-colors cursor-pointer min-h-[64px]"
      onClick={() => router.push(`/read/${book.id}`)}
    >
      <div className="min-w-0 flex-1">
        <p className="text-white font-medium truncate" title={book.title}>
          {book.title}
        </p>
        <p className="text-xs text-white/45 mt-0.5 truncate">
          <span className="uppercase text-[10px] tracking-wide text-white/35 border border-white/15 rounded px-1.5 py-0.5 mr-2">
            {book.format}
          </span>
          {book.author && book.author !== "Unknown" ? `${book.author} · ` : ""}
          {formatSize(book.file_size)}
        </p>
      </div>

      <span className="hidden sm:block text-xs text-white/35 shrink-0">
        {formatDate(book.created_at)}
      </span>

      {confirming ? (
        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleDelete}
            className="text-xs font-medium px-3 h-9 bg-red-500/90 text-white rounded-lg hover:bg-red-500"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-xs px-3 h-9 text-white/60 hover:text-white rounded-lg"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          title="Delete book"
          aria-label="Delete book"
          className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg text-white/35 hover:text-red-400 hover:bg-white/5 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </li>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  // Deterministic YYYY-MM-DD — identical on server and client, avoids
  // hydration mismatches from locale-specific toLocaleDateString().
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
