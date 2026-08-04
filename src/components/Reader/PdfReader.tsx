"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from "react";

// pdf.js is browser-only. Import dynamically so SSR/build doesn't try to run it.
// The worker is loaded from a CDN matched to the installed pdfjs-dist version.
const PDFJS_VERSION = "4.10.38";
const WORKER_SRC = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

export interface PdfReaderHandle {
  getPage: () => number;
  getScrollPct: () => number; // 0..1 within the page
  goTo: (page: number, scrollPct: number) => Promise<void>;
  setZoom: (scale: number) => void;
}

interface PdfReaderProps {
  bookId: number;
  initialPage?: number;
  initialScrollPct?: number;
  invert: boolean;
}

const PdfReader = forwardRef<PdfReaderHandle, PdfReaderProps>(function PdfReader(
  { bookId, initialPage, initialScrollPct, invert },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  const pageNumRef = useRef<number>(initialPage || 1);
  const zoomRef = useRef<number>(1);
  const [, force] = useState(0);

  // Load the PDF document once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;

      // Get a presigned GET URL, then load the PDF bytes DIRECTLY from R2
      // (Railway can't proxy them).
      const metaRes = await fetch(`/api/book/${bookId}`);
      if (!metaRes.ok) return;
      const meta = await metaRes.json();
      const r2Res = await fetch(meta.url);
      if (!r2Res.ok) return;
      const data = new Uint8Array(await r2Res.arrayBuffer());
      // pdf.js can also load directly from the presigned URL (HTTP range
      // requests) for large PDFs; buffering here is simplest and works for any
      // size on desktop/mobile with typical memory.
      const task = pdfjs.getDocument({ data });
      const pdf = await task.promise;
      if (cancelled) return;
      pdfDocRef.current = pdf;
      pageNumRef.current = Math.min(pageNumRef.current, pdf.numPages) || 1;
      force((n) => n + 1);
    })();
    return () => {
      cancelled = true;
      pdfDocRef.current?.destroy?.();
    };
  }, [bookId]);

  // Render the current page whenever page/zoom/invert changes.
  useEffect(() => {
    let cancelled = false;
    const pdf = pdfDocRef.current;
    const container = containerRef.current;
    if (!pdf || !container) return;

    (async () => {
      const page = await pdf.getPage(pageNumRef.current);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: zoomRef.current });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.style.maxWidth = "100%";
      canvas.style.filter = invert
        ? "invert(1) hue-rotate(180deg)"
        : "none";
      ctx.scale(dpr, dpr);
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (cancelled) return;

      container.innerHTML = "";
      container.appendChild(canvas);

      // Restore within-page scroll fraction.
      if (initialScrollPct && container.parentElement) {
        const scroller = container.parentElement;
        scroller.scrollTop =
          (scroller.scrollHeight - scroller.clientHeight) * initialScrollPct;
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumRef.current, zoomRef.current, invert, force]);

  useImperativeHandle(
    ref,
    (): PdfReaderHandle => ({
      getPage: () => pageNumRef.current,
      getScrollPct: () => {
        const scroller = containerRef.current?.parentElement;
        if (!scroller) return 0;
        const max = scroller.scrollHeight - scroller.clientHeight;
        return max > 0 ? scroller.scrollTop / max : 0;
      },
      goTo: async (page: number, scrollPct: number) => {
        const pdf = pdfDocRef.current;
        if (!pdf) return;
        pageNumRef.current = Math.min(Math.max(1, page), pdf.numPages);
        // Scroll restore happens in the render effect via initialScrollPct.
        (containerRef.current?.parentElement as HTMLElement | null)?.scrollTo?.({
          top: 0,
        });
        force((n) => n + 1);
        void scrollPct;
      },
      setZoom: (scale: number) => {
        zoomRef.current = scale;
        force((n) => n + 1);
      },
    }),
    []
  );

  return (
    <div className="flex-1 w-full h-full overflow-auto bg-black flex items-start justify-center">
      <div ref={containerRef} className="inline-block" />
    </div>
  );
});

export default PdfReader;
