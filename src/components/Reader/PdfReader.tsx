"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from "react";
import {
  itemsFromTextContent,
  buildReflowBlocks,
  type ReflowBlock,
} from "@/lib/pdfReflow";

// pdf.js is browser-only. Import dynamically so SSR/build doesn't try to run it.
// The worker is loaded from a CDN matched to the installed pdfjs-dist version.
const PDFJS_VERSION = "4.10.38";
const WORKER_SRC = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

export type PdfReaderMode = "native" | "reflow";

export interface PdfReaderHandle {
  // The currently visible (topmost) page number.
  getPage: () => number;
  // Overall document scroll fraction 0..1 (through all pages).
  getScrollPct: () => number;
  // Jump to a page + document scroll fraction (bookmark restore).
  goTo: (page: number, scrollPct: number) => Promise<void>;
  // Scale every page uniformly (native/render mode).
  setZoom: (scale: number) => void;
  // Apply font-size + line-height to reflowed text (reflow mode).
  setTypography: (fontSize: number, lineHeight: number) => void;
  // Switch between the raster "native" view and reflowed-text view.
  setMode: (mode: PdfReaderMode) => void;
  // Total number of source PDF pages.
  getNumPages: () => number;
}

interface PdfReaderProps {
  bookId: number;
  initialPage?: number;
  initialScrollPct?: number;
  invert: boolean;
  initialMode?: PdfReaderMode;
  initialFontSize?: number;
  onModeChange?: (mode: PdfReaderMode) => void;
}

// Continuous vertical scroll of ALL pages, rendered as stacked canvases.
// Native mode lazily renders pages near the viewport. Reflow mode instead
// reconstructs readable, flowable text (font-size + line-height adjustable)
// since native PDF is fixed-layout and cannot reflow.
const PdfReader = forwardRef<PdfReaderHandle, PdfReaderProps>(function PdfReader(
  { bookId, initialPage, initialScrollPct, invert, initialMode = "native", initialFontSize = 18, onModeChange },
  ref
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  const numPagesRef = useRef(0);
  const zoomRef = useRef(1 + (initialFontSize - 18) / 18);
  const fontSizeRef = useRef(initialFontSize);
  const lineHeightRef = useRef(8);
  const modeRef = useRef<PdfReaderMode>(initialMode);
  const pageElsRef = useRef<HTMLDivElement[]>([]);
  const renderedRef = useRef<Set<number>>(new Set());
  // Last zoom that rasters were actually drawn at; used to compute the zoom
  // ratio when preserving the reader's scroll position on a zoom change.
  const lastRenderZoomRef = useRef(zoomRef.current);
  const [zoom, setZoomState] = useState(zoomRef.current);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage || 1);
  const initialRestoreDone = useRef(false);
  // Reflow content bookkeeping.
  const [typography, setTypographyState] = useState({
    fontSize: initialFontSize,
    lineHeight: 8,
  });
  const modeChangeRef = useRef(onModeChange);
  useEffect(() => {
    modeChangeRef.current = onModeChange;
  }, [onModeChange]);

  // React to an external mode switch (e.g. the bottom-bar toggle in
  // ReaderShell). `setMode` fires onModeChange with the same value on the
  // round-trip, so this settles without looping.
  useEffect(() => {
    if (initialMode !== modeRef.current) setMode(initialMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode]);

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
      setNumPages(pdf.numPages);

      const scroll = scrollRef.current;
      if (!scroll) return;
      scroll.innerHTML = "";

      if (modeRef.current === "reflow") {
        await buildReflowDocument(pdf, scroll);
      } else {
        buildNativePages(pdf, scroll);
      }

      // Restore to bookmarked position.
      if (!initialRestoreDone.current) {
        initialRestoreDone.current = true;
        if (initialPage && initialPage > 1) {
          await jumpTo(initialPage);
        } else if (initialScrollPct) {
          scroll.scrollTop = scroll.scrollHeight * initialScrollPct;
        }
      }

      if (modeRef.current === "reflow") renderNearReflow();
      else renderNear();
      applyTypographyToReflow();
    })();
    return () => {
      cancelled = true;
      pdfDocRef.current?.destroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  // ---- Native mode: build empty page containers ----
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

  // ---- Reflow mode: build reflowable text document ----
  const buildReflowDocument = async (pdf: any, scroll: HTMLDivElement) => {
    scroll.innerHTML = "";
    pageElsRef.current = [];
    renderedRef.current = new Set();

    const wrapper = document.createElement("div");
    wrapper.id = "reflow-content";
    wrapper.style.cssText = "max-width:720px;margin:0 auto;padding:24px 20px 48px;";
    scroll.appendChild(wrapper);

    // Extract text for all pages. Do it in modest chunks so the UI stays
    // responsive; each page of text is rebuilt into flowable blocks.
    const total = pdf.numPages;
    const CHUNK = 30;
    for (let start = 0; start < total; start += CHUNK) {
      if (!pdfDocRef.current) return;
      const end = Math.min(total, start + CHUNK);
      // Concurrently get text for this chunk.
      const pagesText = await Promise.all(
        Array.from({ length: end - start }, (_, k) =>
          pdf.getPage(start + k + 1).then((p: any) => p.getTextContent())
        )
      );
      if (!pdfDocRef.current) return;
      for (let k = 0; k < pagesText.length; k++) {
        const blocks = buildReflowBlocks(itemsFromTextContent(pagesText[k]));
        appendPageBlocks(wrapper, blocks, start + k + 1);
      }
      // yield to keep tab responsive
      await new Promise((r) => setTimeout(r, 0));
    }
  };

  const blockToTitle = (b: ReflowBlock) =>
    b.type === "h1" ? "h1" : b.type === "h2" ? "h2" : "p";

  const appendPageBlocks = (
    wrapper: HTMLElement,
    blocks: ReflowBlock[],
    pageNum: number
  ) => {
    if (blocks.length === 0) return;
    const section = document.createElement("section");
    section.className = "reflow-page";
    section.dataset.reflowPage = String(pageNum);
    for (const b of blocks) {
      const el = document.createElement(blockToTitle(b));
      el.textContent = b.text;
      el.style.fontSize = "inherit";
      el.style.margin = b.type === "h1" ? "1.6em 0 0.4em" : b.type === "h2" ? "1.2em 0 0.4em" : "0 0 0.3em";
      section.appendChild(el);
    }
    wrapper.appendChild(section);
  };

  // Apply font-size + line-height CSS to the reflow document.
  const applyTypographyToReflow = () => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const wrapper = scroll.querySelector("#reflow-content") as HTMLElement | null;
    if (!wrapper) return;
    wrapper.style.cssText =
      "max-width:720px;margin:0 auto;padding:24px 20px 48px;" +
      `font-size:${fontSizeRef.current}px;line-height:${lineHeightRef.current};`;
  };

  // Reflow current pseudo-page from scroll.
  const updateReflowPage = () => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const vh = scroll.clientHeight || 1;
    const totalPseudo = Math.max(1, Math.round(scroll.scrollHeight / vh));
    const current = Math.min(totalPseudo, Math.max(1, Math.floor(scroll.scrollTop / vh) + 1));
    // Update footer via total pages = max(source pages, pseudo pages count)
    setNumPages(Math.max(numPagesRef.current, totalPseudo));
    setCurrentPage(current);
  };

  // placeholder pass-through for reflow rendering when scrolling (no raster).
  const renderNearReflow = () => updateReflowPage();

  // ---- Native mode: render pages near viewport (lazy) ----
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

  // Render one page into its canvas element. NOTE: the displayed width is
  // scaled by zoom so that "font size Aa" genuinely enlarges the page on
  // screen (before this fix, zoom only changed internal canvas resolution
  // while the CSS width stayed pinned at 100%/720px, so text never grew).
  const renderPage = async (pdf: any, pageNum: number, el: HTMLDivElement) => {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: zoomRef.current });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = viewport.width * dpr;
    canvas.height = viewport.height * dpr;
    // Displayed width follows zoom (native "text size"): base width is 720px
    // at zoom 1 (fontSize 18), scaling linearly after. On narrow/mobile
    // screens the page is capped to the scroll container's width so pages fit
    // on screen and later pages are actually readable when scrolled to.
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
    // Double-buffer: only swap the new canvas in after it has finished
    // rendering, so the previous canvas stays visible while the page is being
    // repainted at the new scale. This prevents the "blank black flash" when
    // the reader re-renders after a zoom/text-size change (image-heavy pages
    // render slowly, so clearing the old canvas first would leave a blank).
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

  // Re-render when zoom or invert changes. We preserve the reader's position
  // by scaling scrollTop by the zoom ratio (the whole raster document scales
  // uniformly) instead of clearing every page and losing the user's place.
  // Rendered pages are re-rendered lazily and double-buffered (see renderPage),
  // so there is no blank flash and the scrollbar stays usable throughout.
  useEffect(() => {
    const scroll = scrollRef.current;
    const pdf = pdfDocRef.current;
    if (!scroll || !pdf || modeRef.current === "reflow") return;

    const ratio =
      lastRenderZoomRef.current > 0 ? zoom / lastRenderZoomRef.current : 1;
    lastRenderZoomRef.current = zoom;
    // Preserve the relative reading position (the page near the viewport
    // top stays roughly at the same place).
    scroll.scrollTop = scroll.scrollTop * ratio;

    // Mark rendered pages stale so renderNear repaints them at the new scale;
    // re-rendering is lazy (near-viewport only) and double-buffered.
    renderedRef.current = new Set();
    requestAnimationFrame(() => renderNear());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, invert]);

  // Rebuild reflow text when typography changes.
  useEffect(() => {
    if (modeRef.current !== "reflow") return;
    applyTypographyToReflow();
    // Recompute pseudo-pages on next frame after layout.
    requestAnimationFrame(() => updateReflowPage());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typography]);

  // Scroll listener: lazy-render + track current page + bottom-bar sync.
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const onScroll = () => {
      if (modeRef.current === "reflow") renderNearReflow();
      else {
        renderNear();
        updateCurrentPage();
      }
    };
    scroll.addEventListener("scroll", onScroll, { passive: true });
    return () => scroll.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle mode (native <-> reflow). Rebuilds the scroll content.
  const setMode = (mode: PdfReaderMode) => {
    const scroll = scrollRef.current;
    const pdf = pdfDocRef.current;
    if (!scroll || !pdf || mode === modeRef.current) {
      modeRef.current = mode;
      if (modeRef.current === "reflow") applyTypographyToReflow();
      return;
    }
    modeRef.current = mode;
    const prevPct = scroll.scrollHeight > 0 ? scroll.scrollTop / scroll.scrollHeight : 0;
    scroll.innerHTML = "";
    if (mode === "reflow") {
      buildReflowDocument(pdf, scroll).then(() => {
        applyTypographyToReflow();
        scroll.scrollTop = scroll.scrollHeight * prevPct;
        renderNearReflow();
      });
    } else {
      buildNativePages(pdf, scroll);
      scroll.scrollTop = scroll.scrollHeight * prevPct;
      renderNear();
    }
    setCurrentPage(1);
  };

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
      getNumPages: () => numPagesRef.current,
      goTo: async (page: number, scrollPct: number) => {
        const pdf = pdfDocRef.current;
        if (!pdf) return;
        if (modeRef.current === "reflow") {
          const scroll = scrollRef.current;
          if (scroll) scroll.scrollTop = scroll.scrollHeight * scrollPct;
          return;
        }
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
        if (modeRef.current !== "reflow") setZoomState(scale);
      },
      setTypography: (fontSize: number, lineHeight: number) => {
        fontSizeRef.current = fontSize;
        lineHeightRef.current = lineHeight;
        setTypographyState({ fontSize, lineHeight });
        if (modeRef.current === "reflow") applyTypographyToReflow();
      },
      setMode,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentPage]
  );

  return (
    <div
      ref={scrollRef}
      className="w-full h-full overflow-y-auto overflow-x-hidden bg-black"
      data-reader-mode={modeRef.current}
    />
  );
});

export default PdfReader;
