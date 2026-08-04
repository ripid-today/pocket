"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";

// Dark theme CSS injected into foliate's renderer iframes so source colors
// never override the white-on-black reading surface.
const DARK_CSS = `
  html, body { background: #000 !important; color: #fff !important; }
  a { color: #6cb6ff !important; }
  img { filter: invert(1) hue-rotate(180deg); }
  svg { filter: invert(1) hue-rotate(180deg); }
  /* strip any inline color/background declarations from source */
  [style*="color"] { color: #fff !important; }
  [style*="background"] { background: transparent !important; }
  [style*="line-height"] { line-height: inherit !important; }
`;

export interface EpubReaderHandle {
  // Returns the current CFI locator string (foliate's lastLocation), or null.
  getLocator: () => string | null;
  // Navigate to a previously saved CFI locator.
  goTo: (locator: string) => Promise<void>;
  // Apply font-size (px) and line-height. foliate accepts a CSS string.
  setTypography: (fontSize: number, lineHeight: number) => void;
}

interface EpubReaderProps {
  bookId: number;
  initialLocator?: string | null;
}

const EpubReader = forwardRef<EpubReaderHandle, EpubReaderProps>(
  function EpubReader({ bookId, initialLocator }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<any>(null);

    useEffect(() => {
      let cancelled = false;
      const container = containerRef.current;
      if (!container) return;

      (async () => {
        // foliate-js is browser-only (custom elements, DOM). Import dynamically.
        const { View, makeBook } = await import("foliate-js/view.js");

        // Register the custom element (safe to call multiple times).
        const view = document.createElement("foliate-view") as any;
        viewRef.current = view;
        if (cancelled) return;
        container.appendChild(view);

        // Get a presigned GET URL from the authenticated route, then fetch the
        // book's bytes DIRECTLY from R2 (Railway can't proxy them).
        const metaRes = await fetch(`/api/book/${bookId}`);
        if (!metaRes.ok) {
          console.error("[epub] /api/book fetch failed", metaRes.status);
          return;
        }
        const meta = await metaRes.json();
        const r2Res = await fetch(meta.url);
        if (!r2Res.ok) {
          console.error("[epub] R2 fetch failed", r2Res.status);
          return;
        }
        const blob = await r2Res.blob();
        const file = new File([blob], meta.fileName || "book.epub", {
          type: "application/epub+zip",
        });

        const book = await makeBook(file);
        if (cancelled) return;
        await view.open(book);
        await view.init({
          lastLocation: initialLocator || undefined,
        });

        // Apply dark theme once the renderer exists.
        if (view.renderer?.setStyles) {
          view.renderer.setStyles(DARK_CSS);
        }
      })();

      return () => {
        cancelled = true;
        try {
          viewRef.current?.close?.();
        } catch {
          /* ignore */
        }
        if (container) container.innerHTML = "";
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookId]);

    useImperativeHandle(
      ref,
      (): EpubReaderHandle => ({
        getLocator: () => viewRef.current?.lastLocation ?? null,
        goTo: async (locator: string) => {
          const view = viewRef.current;
          if (!view) return;
          try {
            await view.goTo(locator);
          } catch {
            // Unresolvable locator → silently fall back (G10).
          }
        },
        setTypography: (fontSize: number, lineHeight: number) => {
          const view = viewRef.current;
          if (!view?.renderer?.setStyles) return;
          const css =
            DARK_CSS +
            ` html, body { font-size: ${fontSize}px !important; line-height: ${lineHeight} !important; }`;
          view.renderer.setStyles(css);
        },
      }),
      []
    );

    return (
      <div
        ref={containerRef}
        className="reader-content flex-1 w-full h-full bg-black"
      />
    );
  }
);

export default EpubReader;
