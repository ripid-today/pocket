// Database schema for Pocket — Postgres dialect (Neon).
// Run SCHEMA_SQL once against the Neon project after provisioning.
// All statements use IF NOT EXISTS so the script is re-runnable.

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT        UNIQUE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token         TEXT        UNIQUE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

-- NOTE: no 'attempts' column — OTP has no attempt counter / lockout
-- (per spec: wrong code simply returns "Invalid code.", user may retry freely).
CREATE TABLE IF NOT EXISTS otp_codes (
  id            SERIAL PRIMARY KEY,
  email         TEXT        NOT NULL,
  code          TEXT        NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  used          INTEGER     DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(email, created_at DESC);

-- Raw file bytes live in R2 (r2_key); the DB holds only metadata.
-- No chunks_json / source_file / cover_r2_key — native render reads R2 directly.
CREATE TABLE IF NOT EXISTS books (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  author        TEXT,
  format        TEXT        NOT NULL CHECK (format IN ('epub', 'pdf')),
  content_hash  TEXT        NOT NULL,
  file_name     TEXT        NOT NULL,
  file_size     BIGINT      NOT NULL,
  r2_key        TEXT        NOT NULL,
  spine_json    TEXT,                -- EPUB only: ordered chapter list [{id,label,href}]
  page_count    INTEGER,             -- PDF only
  word_count    INTEGER     DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_books_user ON books(user_id);

-- Single manual bookmark per (user, book), overwritten on each "Save spot".
-- Replaces Libra's reading_progress (which auto-tracked chunk/element/offset).
CREATE TABLE IF NOT EXISTS bookmarks (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id       INTEGER     NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  locator       TEXT        NOT NULL,   -- EPUB: foliate CFI; PDF: JSON {page, scrollPct}
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_book ON bookmarks(user_id, book_id);

CREATE TABLE IF NOT EXISTS user_preferences (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER     NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  font_size     INTEGER     DEFAULT 18,
  line_height   INTEGER     DEFAULT 8,
  updated_at    TIMESTAMPTZ DEFAULT now()
);
`;
