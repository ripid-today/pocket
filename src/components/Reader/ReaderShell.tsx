"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
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
  const { showToast } = useToast();
  const saveInFlightRef = useRef(false);

  const [fontSize, setFontSize] = useState(prefs.fontSize);
  const [lineHeight, setLineHeight] = useState(prefs.lineHeight);
  const [bottomVisible, setBottomVisible] = useState(true);
  const [invert] = useState(true); // PDF dark mode
  // Consistent reading progress across all books: a 0–100 percentage derived
  // from scroll position. PDF reports it via getScrollPct(); EPUB (continuous
  // scroll) reports it via onProgress. Unlike page numbers, percent is stable
  // across books, chapters, screens, and zoom levels.
  const [percent, setPercent] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset progress when switching books.
  useEffect(() => {
    setPercent(0);
  }, [bookId]);

  // Persist typography changes (debounced).
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
  // EPUB is reflowable (font-size + line-height). PDF is fixed native layout:
  // font-size maps to whole-page zoom (text + charts scale together); line-height
  // is intentionally not adjustable for PDF.
  useEffect(() => {
    if (format === "epub") epubRef.current?.setTypography(fontSize, lineHeight);
    if (format === "pdf") {
      pdfRef.current?.setZoom(1 + (fontSize - 18) / 18);
    }
  }, [fontSize, lineHeight, format]);

  // PDF progress: poll the scroll fraction and surface it as a percentage.
  useEffect(() => {
    if (format !== "pdf") return;
    const t = setInterval(() => {
      const pct = pdfRef.current?.getScrollPct?.();
      if (typeof pct === "number") {
        setPercent(Math.round(Math.min(1, Math.max(0, pct)) * 100));
      }
    }, 500);
    return () => clearInterval(t);
  }, [format]);

  // EPUB progress: continuous scroll reports a 0–100 percentage via onProgress.
  // (Typography is already applied in the effect above.)

  // Auto-hide bottom bar on scroll down, show on scroll up.
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
        locator = JSON.stringify({ page, scrollPct });
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
  }, [bookId, format, showToast]);

  const handleClose = useCallback(() => router.push("/library"), [router]);

  return (
    // Use dynamic viewport height so the reader fills exactly the visible
    // phone area (100vh can overflow on mobile browsers with a URL bar).
    <div className="flex flex-col h-screen max-h-screen h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-black">
      <ReaderTopBar title={title} onSave={handleSaveSpot} onClose={handleClose} />

      <div className="relative flex-1 overflow-hidden">
        {format === "epub" ? (
          <EpubReader
            ref={epubRef}
            bookId={bookId}
            initialLocator={bookmark?.locator ?? null}
            onProgress={(cur, tot) => {
              // cur is 0..100, tot always 100.
              if (tot > 0) setPercent(Math.round(Math.min(100, Math.max(0, cur))));
            }}
          />
        ) : (
          <PdfReader
            ref={pdfRef}
            bookId={bookId}
            initialPage={parsePdfPage(bookmark?.locator)}
            initialScrollPct={parsePdfScrollPct(bookmark?.locator)}
            initialFontSize={fontSize}
            invert={invert}
          />
        )}
      </div>

      <ReaderBottomBar
        visible={bottomVisible}
        format={format}
        fontSize={fontSize}
        lineHeight={lineHeight}
        percent={percent}
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
