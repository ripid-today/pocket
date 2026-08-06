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
  // Turn the page forward / backward (handles cross-section transitions).
  next: () => Promise<void>;
  prev: () => Promise<void>;
}

interface EpubReaderProps {
  bookId: number;
  initialLocator?: string | null;
  // Called whenever foliate relocates with the current reading progress so the
  // bottom bar can show a real "X / Y" instead of the hardcoded 1 / 1.
  onProgress?: (current: number, total: number) => void;
}

const EpubReader = forwardRef<EpubReaderHandle, EpubReaderProps>(
  function EpubReader({ bookId, initialLocator, onProgress }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<any>(null);
    // Non-reactive ref so the relocate handler always reads the latest prop.
    const onProgressRef = useRef(onProgress);
    useEffect(() => {
      onProgressRef.current = onProgress;
    }, [onProgress]);

    useEffect(() => {
      let cancelled = false;
      const container = containerRef.current;
      if (!container) return;

      let progressTimer: ReturnType<typeof setInterval> | null = null;
      let onKeyDown: ((e: KeyboardEvent) => void) | null = null;

      (async () => {
        // foliate-js is browser-only (custom elements, DOM). Import dynamically.
        const { View, makeBook } = await import("foliate-js/view.js");

        // Register the custom element (safe to call multiple times).
        const view = document.createElement("foliate-view") as any;
        // foliate-view has no :host height rule of its own; its paginator uses
        // height:100% which resolves to 0 unless the host has a definite height.
        // Force block + full height so the paginator gets real dimensions and
        // renders content instead of a blank viewport.
        view.style.display = "block";
        view.style.width = "100%";
        view.style.height = "100%";
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
        // Continuous scroll: put the paginator into "scrolled" flow so the
        // EPUB reads as one long scrollable page (libra-style) instead of
        // fixed column pages. This makes the book natively swipeable/scrollable
        // on a phone — the reader no longer requires tapping edge zones to turn
        // pages, and the scroll position is reconciled to `relocate` so the
        // bottom-bar counter keeps advancing. CFI bookmarks still work.
        view.renderer?.setAttribute?.("flow", "scrolled");
        await view.init({
          lastLocation: initialLocator || undefined,
        });

        // Apply dark theme once the renderer exists.
        if (view.renderer?.setStyles) {
          view.renderer.setStyles(DARK_CSS);
        }

        // --- Navigation wiring (fixes "only first page readable") -----------
        // foliate paginator renders all content as hidden multi-column layout
        // and only reveals one viewport at a time. Without an explicit way to
        // call prev()/next() the reader is stuck on page 1. We expose
        // next/prev on the handle and also bind keyboard + click/tap zones.

        // Keyboard navigation (ignore when user is typing / focused on a button).
        onKeyDown = (e: KeyboardEvent) => {
          const t = e.target as HTMLElement | null;
          if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
          switch (e.key) {
            case "ArrowRight":
            case "PageDown":
              e.preventDefault();
              view.next();
              break;
            case "ArrowLeft":
            case "PageUp":
              e.preventDefault();
              view.prev();
              break;
            case " ":
            case "ArrowDown":
              e.preventDefault();
              view.next();
              break;
            case "ArrowUp":
              e.preventDefault();
              view.prev();
              break;
          }
        };
        window.addEventListener("keydown", onKeyDown);

        // Sync page counter into the parent (foliate relocate -> location).
        const syncProgress = () => {
          const loc = view?.lastLocation;
          const tot = loc?.location?.total;
          const cur = loc?.location?.current;
          if (typeof cur === "number") onProgressRef.current?.(cur + 1, tot || 0);
        };
        // Listen to foliate's relocate events (fires on every page turn).
        view.addEventListener("relocate", syncProgress);
        // Warm initial sync + keep in sync while fonts settle.
        syncProgress();
        progressTimer = setInterval(() => {
          if (!viewRef.current) return;
          const l = viewRef.current.lastLocation;
          if (l) {
            const cur = l.location?.current;
            const tot = l.location?.total;
            onProgressRef.current?.(typeof cur === "number" ? cur + 1 : 1, tot || 0);
          }
        }, 500);
      })();

      return () => {
        cancelled = true;
        if (progressTimer) clearInterval(progressTimer);
        if (onKeyDown) window.removeEventListener("keydown", onKeyDown);
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
        // foliate's lastLocation is an object; the `cfi` field is the
        // persistent, serializable location string we save as the bookmark.
        // Returning the whole object previously produced "[object Object]".
        getLocator: () => {
          const loc = viewRef.current?.lastLocation;
          if (!loc) return null;
          return typeof loc.cfi === "string" ? loc.cfi : null;
        },
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
        next: async () => {
          const view = viewRef.current;
          if (!view) return;
          try {
            await view.next();
          } catch {
            /* ignore */
          }
        },
        prev: async () => {
          const view = viewRef.current;
          if (!view) return;
          try {
            await view.prev();
          } catch {
            /* ignore */
          }
        },
      }),
      []
    );

    return (
      <div
        ref={containerRef}
        className="bg-black cursor-default select-text"
        style={{ position: "absolute", inset: 0 }}
      />
    );
  }
);

export default EpubReader;
