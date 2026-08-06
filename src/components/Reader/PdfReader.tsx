"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from "react";

// pdf.js is browser-only. Import dynamically so SSR/build doesn't try to run it.
// The worker is loaded from a CDN matched to the installed pdfjs-dist version.
const PDFJS_VERSION = "4.10.38";
const WORKER_SRC = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

export interface PdfReaderHandle {
  // The currently visible (topmost) page number.
  getPage: () => number;
  // Overall document scroll fraction 0..1 (through all pages) — drives the
  // bottom bar's progress percentage.
  getScrollPct: () => number;
  // Jump to a page + document scroll fraction (bookmark restore).
  goTo: (page: number, scrollPct: number) => Promise<void>;
  // Scale every page uniformly (native fixed-layout zoom).
  setZoom: (scale: number) => void;
}

interface PdfReaderProps {
  bookId: number;
  initialPage?: number;
  initialScrollPct?: number;
  invert: boolean;
  initialFontSize?: number;
}

// Continuous vertical scroll of ALL pages, rendered as stacked canvases.
// Pages are lazily rendered near the viewport. This is the fixed-layout
// "native" mode: it preserves the original images/charts/equations and scales
// uniformly via zoom (there is no reflow). Line-height is intentionally not
// adjustable because a fixed-layout PDF cannot reflow.
const PdfReader = forwardRef<PdfReaderHandle, PdfReaderProps>(function PdfReader(
  { bookId, initialPage, initialScrollPct, invert, initialFontSize = 18 },
  ref
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  const numPagesRef = useRef(0);
  const zoomRef = useRef(1 + (initialFontSize - 18) / 18);
  const pageElsRef = useRef<HTMLDivElement[]>([]);
  const renderedRef = useRef<Set<number>>(new Set());
  // Last zoom that rasters were actually drawn at; used to compute the zoom
  // ratio when preserving the reader's scroll position on a zoom change.
  const lastRenderZoomRef = useRef(zoomRef.current);
  const [zoom, setZoomState] = useState(zoomRef.current);
  const [currentPage, setCurrentPage] = useState(initialPage || 1);
  const initialRestoreDone = useRef(false);

  // Load the PDF document once + render pages to fill the viewport.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;

      const metaRes = await fetch(`/api/book/${bookId}`);
      if (!metaRes.ok) return;
      const meta = await metaRes.json();
      const r2Res = await fetch(meta.url);
      if (!r2Res.ok) return;
      const data = new Uint8Array(await r2Res.arrayBuffer());
      const task = pdfjs.getDocument({ data });
      const pdf = await task.promise;
      if (cancelled) return;
      pdfDocRef.current = pdf;
      numPagesRef.current = pdf.numPages;

      const scroll = scrollRef.current;
      if (!scroll) return;
      buildNativePages(pdf, scroll);

      // Restore to bookmarked position.
      if (!initialRestoreDone.current) {
        initialRestoreDone.current = true;
        if (initialPage && initialPage > 1) {
          await jumpTo(initialPage);
        } else if (initialScrollPct) {
          scroll.scrollTop = scroll.scrollHeight * initialScrollPct;
        }
      }

      renderNear();
    })();
    return () => {
      cancelled = true;
      pdfDocRef.current?.destroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  // ---- Build empty page containers ----
  const buildNativePages = (pdf: any, scroll: HTMLDivElement) => {
    scroll.innerHTML = "";
    pageElsRef.current = [];
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= pdf.numPages; i++) {
      const el = document.createElement("div");
      el.style.cssText = "display:flex;justify-content:center;padding:0 4px 16px;";
      el.setAttribute("data-page", String(i));
      frag.appendChild(el);
      pageElsRef.current.push(el);
    }
    scroll.appendChild(frag);
    renderedRef.current = new Set();
  };

  // ---- Render pages near viewport (lazy) ----
  const renderNear = async () => {
    const scroll = scrollRef.current;
    const pdf = pdfDocRef.current;
    if (!scroll || !pdf) return;

    const vh = scroll.clientHeight;
    const top = scroll.scrollTop;
    const bottom = top + vh;
    for (let i = 0; i < pageElsRef.current.length; i++) {
      const el = pageElsRef.current[i];
      const pageNum = i + 1;
      const et = el.offsetTop;
      const eb = et + el.offsetHeight;
      if (et <= bottom + 600 && eb >= top - 600) {
        if (!renderedRef.current.has(pageNum)) {
          renderedRef.current.add(pageNum);
          renderPage(pdf, pageNum, el).catch(() => {
            renderedRef.current.delete(pageNum);
          });
        }
      }
    }
  };

  const updateCurrentPage = () => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const vh = scroll.clientHeight;
    const mid = scroll.scrollTop + vh * 0.5;
    let page = 1;
    for (let i = 0; i < pageElsRef.current.length; i++) {
      const el = pageElsRef.current[i];
      if (el.offsetTop <= mid) page = i + 1;
    }
    setCurrentPage(page);
  };

  // Render one page into its canvas element. Displayed width follows zoom
  // (native "text size"): base width 720px at zoom 1 (fontSize 18), scaling
  // linearly after. On narrow/mobile screens the page is capped to the scroll
  // container's width so pages fit and later pages are readable when scrolled.
  const renderPage = async (pdf: any, pageNum: number, el: HTMLDivElement) => {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: zoomRef.current });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = viewport.width * dpr;
    canvas.height = viewport.height * dpr;
    const container = scrollRef.current;
    const maxW = container?.clientWidth || Infinity;
    let displayW = Math.round(720 * zoomRef.current);
    if (maxW < displayW) displayW = Math.max(280, maxW);
    const style = canvas.style;
    style.width = `${displayW}px`;
    style.height = `${Math.round(viewport.height * (displayW / viewport.width))}px`;
    style.aspectRatio = `${viewport.width} / ${viewport.height}`;
    style.filter = invert ? "invert(1) hue-rotate(180deg)" : "none";
    ctx.scale(dpr, dpr);
    await page.render({ canvasContext: ctx, viewport }).promise;
    // Double-buffer: swap the new canvas in only after it has rendered, so the
    // previous canvas stays visible during repaint (no blank flash on zoom).
    const existing = el.querySelector("canvas");
    if (existing) el.replaceChild(canvas, existing);
    else el.appendChild(canvas);
    renderNear();
  };

  const jumpTo = async (page: number) => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    await renderNear();
    await new Promise((r) => requestAnimationFrame(() => r(0)));
    requestAnimationFrame(() => {
      const target =
        pageElsRef.current[Math.min(page, pageElsRef.current.length) - 1];
      if (target) scroll.scrollTop = target.offsetTop;
      setCurrentPage(page);
    });
  };

  // Re-render when zoom or invert changes. Preserve the reader's position by
  // scaling scrollTop by the zoom ratio (the whole raster document scales
  // uniformly) instead of clearing every page and losing the user's place.
  useEffect(() => {
    const scroll = scrollRef.current;
    const pdf = pdfDocRef.current;
    if (!scroll || !pdf) return;

    const ratio =
      lastRenderZoomRef.current > 0 ? zoom / lastRenderZoomRef.current : 1;
    lastRenderZoomRef.current = zoom;
    scroll.scrollTop = scroll.scrollTop * ratio;

    renderedRef.current = new Set();
    requestAnimationFrame(() => renderNear());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, invert]);

  // Scroll listener: lazy-render + track current page.
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const onScroll = () => {
      renderNear();
      updateCurrentPage();
    };
    scroll.addEventListener("scroll", onScroll, { passive: true });
    return () => scroll.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    ref,
    (): PdfReaderHandle => ({
      getPage: () => currentPage,
      getScrollPct: () => {
        const scroll = scrollRef.current;
        if (!scroll) return 0;
        const max = scroll.scrollHeight - scroll.clientHeight;
        return max > 0 ? scroll.scrollTop / max : 0;
      },
      goTo: async (page: number, scrollPct: number) => {
        const pdf = pdfDocRef.current;
        if (!pdf) return;
        if (page > 1) {
          await jumpTo(Math.min(page, pdf.numPages));
        } else {
          const scroll = scrollRef.current;
          if (scroll) {
            const max = scroll.scrollHeight - scroll.clientHeight;
            scroll.scrollTop = max * scrollPct;
          }
        }
      },
      setZoom: (scale: number) => {
        zoomRef.current = scale;
        setZoomState(scale);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentPage]
  );

  return <div ref={scrollRef} className="w-full h-full overflow-y-auto overflow-x-hidden bg-black" />;
});

export default PdfReader;
