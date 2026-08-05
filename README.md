# Pocket — Personal eBook Reader

A self-hosted, dark-mode eBook reader for large (up to 1GB) EPUB and PDF
textbooks. Native rendering preserves diagrams, charts, tables, and equations.
Deployed as a Next.js container on Railway with raw files on Cloudflare R2 and
metadata on Neon Postgres.

## Stack
- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4
- Cloudflare R2 (raw files, private, zero egress) via @aws-sdk/client-s3
- Neon Postgres (metadata, bookmarks, preferences, OTP, sessions)
- foliate-js (native EPUB render) + pdf.js (native PDF render)
- Email OTP auth (nodemailer + Gmail)

## Local dev
```bash
cp .env.example .env   # fill in Neon + R2 + Gmail secrets
npm install
npm run dev
```

## Deploy (Railway)
1. Push this repo to GitHub.
2. Create a Railway service from the repo (auto-detects Dockerfile).
3. Set all env vars from `.env.example` in Railway.
4. Point your domain's CNAME at the Railway service's `up.railway.app` host.

## Reader features
- **EPUB**: tap either edge (or use ←/→, ↑/↓, PgUp/PgDn, Space) to turn pages;
  the bottom bar shows the real reading position (e.g. `147 / 471`).
- **PDF — Native layout (default)**: preserves all tables, equations, and
  diagrams. The **Aa** control zooms the page so text genuinely grows/shrinks
  on screen. Line-spacing is unavailable here because PDF is fixed-layout (a
  page is a raster image—there is no line-height to change).
- **PDF — Reflow mode** (bottom-bar `Reflow` toggle): reconstructs the text as
  flowable paragraphs (via pdf.js `getTextContent`) so both the **Aa** font-size
  and the **↕** line-spacing controls work. Trade-off: tables, equations, and
  diagrams are not preserved—use Native layout to see them.
- Bookmarks store which mode (native/reflow) a PDF was last read in and restore it.
