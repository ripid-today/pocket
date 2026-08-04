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
    <main className="flex-1 flex flex-col">
      {/* Header: title left, import + logout right. Mobile: title + import one row. */}
      <header className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 border-b border-white/10 sticky top-0 bg-black z-10 safe-top">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-lg font-semibold text-white truncate">Pocket</h1>
          <span className="hidden sm:inline text-sm text-white/40 truncate">{email}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-white/90 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Import</span>
          </button>
          <button
            onClick={() => logoutAction()}
            title="Sign out"
            className="p-2 text-white/60 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      {/* Row list, centered, capped width on desktop. */}
      <div className="flex-1 w-full max-w-4xl mx-auto px-2 sm:px-6 py-2">
        {books.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center px-4">
            <p className="text-white/60 mb-4">Your library is empty.</p>
            <button
              onClick={() => setImportOpen(true)}
              className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-white/90"
            >
              Import your first book
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
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
    <li className="group flex items-center gap-3 px-3 sm:px-4 py-3 hover:bg-white/5 rounded-lg min-h-[56px] cursor-pointer"
        onClick={() => router.push(`/read/${book.id}`)}>
      <div className="min-w-0 flex-1">
        <p className="text-white truncate" title={book.title}>{book.title}</p>
        <p className="text-sm text-white/50 truncate">
          {book.author || "Unknown"} · <span className="uppercase text-white/40">{book.format}</span> · {formatSize(book.file_size)}
        </p>
      </div>
      <span className="hidden sm:block text-sm text-white/40 shrink-0">
        {new Date(book.created_at).toLocaleDateString()}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setConfirming((v) => !v);
        }}
        className="opacity-0 group-hover:opacity-100 sm:opacity-0 p-2 text-white/40 hover:text-red-400 rounded-lg hover:bg-white/10 transition-opacity"
        title="Delete"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
      {confirming && (
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleDelete}
            className="text-xs px-2 py-1 bg-red-500/90 text-white rounded hover:bg-red-500"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-xs px-2 py-1 text-white/60 hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}
    </li>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
