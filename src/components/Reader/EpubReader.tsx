"use client";

import {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useState,
} from "react";
import { buildWholeBookHtml, type WholeBookHtml } from "@/lib/epubWhole";

export interface EpubReaderHandle {
  // Returns the current save-spot locator (a JSON string with section + %
  // scroll within it), mirroring the PDF reader's scroll-based bookmark.
  getLocator: () => string | null;
  // Restore a previously saved locator (scroll to the saved position).
  goTo: (locator: string) => Promise<void>;
  // Apply font-size (px) and line-height (unitless) to the whole-book flow.
  setTypography: (fontSize: number, lineHeight: number) => void;
  // Scroll forward / backward by one viewport height.
  next: () => void;
  prev: () => void;
  // Ordered TOC entries: { label, target: "#sec-i--frag" | "#sec-i" }.
  getToc: () => { label: string; target: string }[];
  // Scroll to an in-document anchor target (used by a potential TOC overlay).
  goToAnchor: (target: string) => void;
}

interface EpubReaderProps {
  bookId: number;
  initialLocator?: string | null;
  // Called whenever the current page changes so the bottom bar can show a real
  // "X / Y" instead of a hardcoded 1 / 1.
  onProgress?: (current: number, total: number) => void;
  // The whole EPUB is built as one continuous flow; we still report a
  // page-equivalent count based on scroll position.
}

export function parseEpubLocator(
  locator?: string | null,
): { sec: number; pct: number } | null {
  if (!locator) return null;
  try {
    const p = JSON.parse(locator);
    if (typeof p.sec === "number" && typeof p.pct === "number") {
      return { sec: p.sec, pct: Math.max(0, Math.min(1, p.pct)) };
    }
    if (typeof p.sec === "number") return { sec: p.sec, pct: 0 };
    return null;
  } catch {
    return null;
  }
}

const EpubReader = forwardRef<EpubReaderHandle, EpubReaderProps>(
  function EpubReader({ bookId, initialLocator, onProgress }, ref) {
    const containerRef = useRef<HTMLDivElement>(null); // scroll container
    const bookRef = useRef<WholeBookHtml | null>(null);
    const onProgressRef = useRef(onProgress);
    const [fontSize, setFontSize] = useState(18);
    const [lineHeight, setLineHeight] = useState(8);
    const [html, setHtml] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const lastPageReportRef = useRef(-1);

    useEffect(() => {
      onProgressRef.current = onProgress;
    }, [onProgress]);

    // Build + mount the whole-book HTML.
    useEffect(() => {
      let cancelled = false;
      const container = containerRef.current;
      setLoading(true);
      setError(null);

      (async () => {
        try {
          const { makeBook } = await import("foliate-js/view.js");

          // Get a presigned GET URL, then fetch the book bytes directly from R2.
          const metaRes = await fetch(`/api/book/${bookId}`);
          if (!metaRes.ok) throw new Error(`book meta ${metaRes.status}`);
          const meta = await metaRes.json();
          const r2Res = await fetch(meta.url);
          if (!r2Res.ok) throw new Error(`r2 ${r2Res.status}`);
          const blob = await r2Res.blob();
          const file = new File([blob], meta.fileName || "book.epub", {
            type: "application/epub+zip",
          });

          const book = await makeBook(file);
          // Continuous scroll: build the whole book as one HTML flow.
          const whole = await buildWholeBookHtml(book);
          if (cancelled) return;
          bookRef.current = whole;
          if (container) container.dataset.done = "1";

          setHtml(whole.html);
          setLoading(false);
        } catch (e) {
          if (cancelled) return;
          console.error("[epub] build failed", e);
          setError(String((e as Error)?.message || e));
          setLoading(false);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [bookId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Report progress based on scroll position. One "page" = one viewport
    // height of content over the whole flow; the total mirrors the section
    // count scaled to lookups so the counter moves as you scroll.
    const reportProgress = () => {
      const container = containerRef.current;
      const whole = bookRef.current;
      if (!container || !whole) return;
      const max = container.scrollHeight - container.clientHeight;
      if (max <= 0) return;
      const pct = container.scrollTop / max;
      const page = Math.max(1, Math.round(pct * whole.sectionCount * 4));
      if (page !== lastPageReportRef.current) {
        lastPageReportRef.current = page;
        onProgressRef.current?.(page, whole.sectionCount * 4);
      }
    };

    // Keep the parent counter in sync on scroll (throttled).
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const onScroll = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(reportProgress, 120);
      };
      container.addEventListener("scroll", onScroll, { passive: true });
      return () => {
        container.removeEventListener("scroll", onScroll);
        if (timer) clearTimeout(timer);
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Keyboard navigation.
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        const t = e.target as HTMLElement | null;
        if (
          t &&
          (t.tagName === "INPUT" ||
            t.tagName === "TEXTAREA" ||
            t.isContentEditable)
        )
          return;
        const c = containerRef.current;
        if (!c) return;
        const step = c.clientHeight * 0.9;
        if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
          if (e.key === " ") e.preventDefault();
          c.scrollBy({ top: step, behavior: "smooth" });
        } else if (e.key === "ArrowUp" || e.key === "PageUp") {
          c.scrollBy({ top: -step, behavior: "smooth" });
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, []);

    // Helper to scroll to a section + fraction within it.
    const restoreTo = (container: HTMLElement, sec: number, pct: number) => {
      const secEl = container.querySelector(`#sec-${sec}`);
      if (!secEl) return;
      const target = (secEl as HTMLElement).offsetTop +
        (secEl as HTMLElement).offsetHeight * pct;
      container.scrollTo({ top: target, behavior: "auto" });
    };

    useImperativeHandle(
      ref,
      (): EpubReaderHandle => {
        const container = () => containerRef.current;
        return {
          getLocator: () => {
            const c = container();
            const whole = bookRef.current;
            if (!c || !whole) return null;
            // Determine the current section (last section whose top is above the
            // viewport top) and the fraction of it scrolled.
            let cur = 0;
            const vt = c.scrollTop;
            for (let i = 0; i < whole.sectionCount; i++) {
              const el = c.querySelector(`#sec-${i}`);
              if (!el) break;
              if ((el as HTMLElement).offsetTop <= vt + 50) cur = i;
              else break;
            }
            const secEl = c.querySelector(`#sec-${cur}`);
            const secHeight = secEl ? (secEl as HTMLElement).offsetHeight : 0;
            const pct = secHeight > 0
              ? Math.max(0, Math.min(1, (vt - (secEl ? (secEl as HTMLElement).offsetTop : 0)) / secHeight))
              : 0;
            return JSON.stringify({ sec: cur, pct });
          },
          goTo: async (locator: string) => {
            const loc = parseEpubLocator(locator);
            const c = container();
            if (loc && c) restoreTo(c, loc.sec, loc.pct);
          },
          setTypography: (fs: number, lh: number) => {
            setFontSize(fs);
            setLineHeight(lh);
          },
          next: () => {
            const c = container();
            if (c) c.scrollBy({ top: c.clientHeight * 0.9, behavior: "smooth" });
          },
          prev: () => {
            const c = container();
            if (c) c.scrollBy({ top: -c.clientHeight * 0.9, behavior: "smooth" });
          },
          getToc: () => bookRef.current?.toc ?? [],
          goToAnchor: (target: string) => {
            const c = container();
            if (!c) return;
            const el = c.querySelector(target);
            if (el) c.scrollTo({ top: (el as HTMLElement).offsetTop, behavior: "smooth" });
          },
        };
      },
      [],
    );

    // Copy HTML into the container after it is prepared (keeps layout cheap),
    // then restore the saved reading position the moment the DOM is mounted.
    useEffect(() => {
      const container = containerRef.current;
      if (!container || !html) return;
      container.innerHTML = html;
      const loc = parseEpubLocator(initialLocator);
      if (loc) {
        const secEl = container.querySelector(`#sec-${loc.sec}`);
        if (secEl) {
          restoreTo(container, loc.sec, loc.pct);
        } else if (loc.sec === 0) {
          container.scrollTop = 0;
        }
      }
    }, [html, initialLocator]);

    return (
      <div
        ref={containerRef}
        className="epub-flow bg-black text-white select-text overflow-y-auto w-full h-full px-4 sm:px-8 py-6 sm:py-10"
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: `${lineHeight}`,
        }}
        data-whole-epub
      >
        {loading && !html && (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <div className="p-6 text-sm text-red-400">
            Failed to open the book: {error}
          </div>
        )}
      </div>
    );
  },
);

export default EpubReader;
