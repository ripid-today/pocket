"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import EpubReader, { type EpubReaderHandle } from "./EpubReader";
import PdfReader, { type PdfReaderHandle, type PdfReaderMode } from "./PdfReader";
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
  const { showToast } = useToast();
  const saveInFlightRef = useRef(false);

  const [fontSize, setFontSize] = useState(prefs.fontSize);
  const [lineHeight, setLineHeight] = useState(prefs.lineHeight);
  const [bottomVisible, setBottomVisible] = useState(true);
  const [invert] = useState(true); // PDF dark mode
  // PDF reader view mode: native (raster, preserves layout) or reflow (text reflow).
  const [pdfMode, setPdfMode] = useState<PdfReaderMode>(
    parsePdfMode(bookmark?.locator) ?? "native"
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(
    format === "pdf" ? pageCount || 1 : 1
  );

  // EPUB: foliate reports real reading progress asynchronously (location-based).
  // Reflect it into the bottom bar so it's not stuck at "1 / 1" (M-fix).
  const [epubCurrent, setEpubCurrent] = useState(1);
  const [epubTotal, setEpubTotal] = useState(0);
  // Reset the epub progress markers when switching books.
  useEffect(() => {
    setEpubCurrent(1);
    setEpubTotal(0);
  }, [bookId]);
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
      if (pdfMode === "reflow") {
        pdfRef.current?.setTypography(fontSize, lineHeight);
      } else {
        // Map font-size to PDF zoom (1 at default 18px).
        pdfRef.current?.setZoom(1 + (fontSize - 18) / 18);
      }
    }
  }, [fontSize, lineHeight, format, pdfMode]);

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

  // EPUB: total pages come from foliate's relocate event (location-based
  // count). currentPage is the epub offset + 1 (location.current is 0-based).
  useEffect(() => {
    if (format !== "epub") return;
    if (epubTotal > 0) setTotalPages(epubTotal);
    if (epubCurrent > 0) setCurrentPage(epubCurrent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epubCurrent, epubTotal, format]);

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
    // Ignore rapid repeated clicks while a save is in flight.
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    try {
      let locator: string | null;
      if (format === "epub") {
        locator = epubRef.current?.getLocator() ?? null;
      } else {
        const page = pdfRef.current?.getPage() ?? 1;
        const scrollPct = pdfRef.current?.getScrollPct() ?? 0;
        locator = JSON.stringify({
          page,
          scrollPct,
          mode: pdfMode === "reflow" ? "reflow" : undefined,
        });
      }

      if (!locator) {
        // Reader not ready or no position yet — don't pretend we saved.
        showToast("Nothing to save yet", "info");
        return;
      }

      const res = await fetch("/api/bookmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, locator }),
      });
      if (res.ok) {
        showToast("Spot saved", "success");
      } else {
        console.error("[saveSpot] non-ok", res.status);
        showToast("Couldn’t save spot", "error");
      }
    } catch (e) {
      console.error("[saveSpot]", e);
      showToast("Couldn’t save spot", "error");
    } finally {
      saveInFlightRef.current = false;
    }
  }, [bookId, format, pdfMode, showToast]);

  const handleClose = useCallback(() => router.push("/library"), [router]);

  return (
    // Use dynamic viewport height so the reader fills exactly the visible
    // phone area. On mobile browsers 100vh includes the off-screen URL/toolbar
    // height, which pushes the scroll container below the fold and makes it
    // look like the book can't be scrolled. 100dvh tracks the real visible
    // viewport; h-screen is kept as the fallback for older browsers.
    <div className="flex flex-col h-screen max-h-screen h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-black">
      <ReaderTopBar title={title} onSave={handleSaveSpot} onClose={handleClose} />

      <div className="relative flex-1 overflow-hidden">
        {format === "epub" ? (
          <EpubReader
            ref={epubRef}
            bookId={bookId}
            initialLocator={bookmark?.locator ?? null}
            onProgress={(cur, tot) => {
              setEpubCurrent(cur);
              setEpubTotal(tot);
            }}
          />
        ) : (
          <PdfReader
            ref={pdfRef}
            bookId={bookId}
            initialPage={parsePdfPage(bookmark?.locator)}
            initialScrollPct={parsePdfScrollPct(bookmark?.locator)}
            initialMode={pdfMode}
            initialFontSize={fontSize}
            invert={invert}
            onModeChange={(m) => setPdfMode(m)}
          />
        )}
      </div>

      <ReaderBottomBar
        visible={bottomVisible}
        format={format}
        pdfMode={pdfMode}
        fontSize={fontSize}
        lineHeight={lineHeight}
        currentPage={currentPage}
        totalPages={totalPages}
        onFontSizeChange={handleFontSize}
        onLineHeightChange={handleLineHeight}
        onTogglePdfMode={() =>
          setPdfMode((m) => (m === "reflow" ? "native" : "reflow"))
        }
      />
    </div>
  );
}

function parsePdfMode(locator?: string | null): PdfReaderMode | undefined {
  if (!locator) return undefined;
  try {
    const p = JSON.parse(locator);
    return p.mode === "reflow" ? "reflow" : undefined;
  } catch {
    return undefined;
  }
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
