"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import EpubReader, { type EpubReaderHandle } from "./EpubReader";
import PdfReader, { type PdfReaderHandle } from "./PdfReader";
import ReaderTopBar from "./ReaderTopBar";
import ReaderBottomBar from "./ReaderBottomBar";

interface ReaderShellProps {
  bookId: number;
  title: string;
  format: "epub" | "pdf";
  pageCount: number | null;
  prefs: { fontSize: number; lineHeight: number };
  bookmark: { locator: string } | null;
}

export default function ReaderShell({
  bookId,
  title,
  format,
  pageCount,
  prefs,
  bookmark,
}: ReaderShellProps) {
  const router = useRouter();
  const epubRef = useRef<EpubReaderHandle>(null);
  const pdfRef = useRef<PdfReaderHandle>(null);

  const [fontSize, setFontSize] = useState(prefs.fontSize);
  const [lineHeight, setLineHeight] = useState(prefs.lineHeight);
  const [bottomVisible, setBottomVisible] = useState(true);
  const [invert] = useState(true); // PDF dark mode
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(
    format === "pdf" ? pageCount || 1 : 1
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist typography changes (debounced) — F8, F9.
  const persistPrefs = useCallback((fs: number, lh: number) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/preferences/font-size", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fontSize: fs }),
      }).catch(() => {});
      fetch("/api/preferences/line-height", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineHeight: lh }),
      }).catch(() => {});
    }, 600);
  }, []);

  // Libra-style delta handlers (bottom bar calls with ±2).
  const handleFontSize = useCallback(
    (delta: number) => {
      setFontSize((prev) => {
        const next = Math.min(32, Math.max(8, prev + delta));
        persistPrefs(next, lineHeight);
        return next;
      });
    },
    [lineHeight, persistPrefs]
  );
  const handleLineHeight = useCallback(
    (delta: number) => {
      setLineHeight((prev) => {
        const next = Math.min(24, Math.max(4, prev + delta));
        persistPrefs(fontSize, next);
        return next;
      });
    },
    [fontSize, persistPrefs]
  );

  // Apply typography to the active renderer.
  useEffect(() => {
    if (format === "epub") epubRef.current?.setTypography(fontSize, lineHeight);
    if (format === "pdf") {
      // Map font-size to PDF zoom (1 at default 18px).
      pdfRef.current?.setZoom(1 + (fontSize - 18) / 18);
    }
  }, [fontSize, lineHeight, format]);

  // Track PDF total pages + current page from the reader handle. The PDF
  // reader detects the real page count asynchronously once pdf.js loads, so
  // poll to sync both totalPages and currentPage into the bottom bar.
  useEffect(() => {
    if (format !== "pdf") return;
    const t = setInterval(() => {
      const n = pdfRef.current?.getNumPages?.();
      if (n && n !== totalPages) setTotalPages(n);
      setCurrentPage(pdfRef.current?.getPage() ?? 1);
    }, 500);
    return () => clearInterval(t);
  }, [format, totalPages]);

  // Auto-hide bottom bar on scroll down, show on scroll up (M19).
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const last = (window as any).__lastScrollY ?? 0;
      if (Math.abs(y - last) < 8) return;
      setBottomVisible(y < last);
      (window as any).__lastScrollY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleSaveSpot = useCallback(async () => {
    let locator: string;
    if (format === "epub") {
      locator = epubRef.current?.getLocator() ?? "start";
    } else {
      const page = pdfRef.current?.getPage() ?? 1;
      const scrollPct = pdfRef.current?.getScrollPct() ?? 0;
      locator = JSON.stringify({ page, scrollPct });
    }
    try {
      await fetch("/api/bookmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, locator }),
      });
    } catch {
      // best-effort; minimal handling
    }
  }, [bookId, format]);

  const handleClose = useCallback(() => router.push("/library"), [router]);

  return (
    <div className="flex flex-col h-screen bg-black">
      <ReaderTopBar title={title} onSave={handleSaveSpot} onClose={handleClose} />

      <div className="relative flex-1 overflow-hidden">
        {format === "epub" ? (
          <EpubReader
            ref={epubRef}
            bookId={bookId}
            initialLocator={bookmark?.locator ?? null}
          />
        ) : (
          <PdfReader
            ref={pdfRef}
            bookId={bookId}
            initialPage={parsePdfPage(bookmark?.locator)}
            initialScrollPct={parsePdfScrollPct(bookmark?.locator)}
            invert={invert}
          />
        )}
      </div>

      <ReaderBottomBar
        visible={bottomVisible}
        format={format}
        fontSize={fontSize}
        lineHeight={lineHeight}
        currentPage={currentPage}
        totalPages={totalPages}
        onFontSizeChange={handleFontSize}
        onLineHeightChange={handleLineHeight}
      />
    </div>
  );
}

function parsePdfPage(locator?: string | null): number | undefined {
  if (!locator) return undefined;
  try {
    const p = JSON.parse(locator);
    return typeof p.page === "number" ? p.page : undefined;
  } catch {
    return undefined;
  }
}

function parsePdfScrollPct(locator?: string | null): number | undefined {
  if (!locator) return undefined;
  try {
    const p = JSON.parse(locator);
    return typeof p.scrollPct === "number" ? p.scrollPct : undefined;
  } catch {
    return undefined;
  }
}
