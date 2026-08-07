// Builds a single, continuous, scrollable HTML document from a foliate `book`
// object so the ENTIRE EPUB renders in one flow (libra-style) instead of the
// paged/lazy one-section-at-a-time iframe used by foliate's view.
//
// foliate's `makeBook(file)` already parses the EPUB (container -> OPF ->
// manifest/spine/toc, reading order, linearity, encryption), and exposes the
// public `loadText(href)` / `loadBlob(href)` loader methods we reuse here. We
// only assemble + sanitize the sections and inline images, then the reader
// renders the result in a normal scrollable <div>.
//
// All element ids are namespaced per section (sec-i--<id>) and links are
// rewritten to the matching in-document anchor, so TOC / footnote links and
// cross-section hrefs (e.g. "OEBPS/text00002.html#chapter-2") resolve within
// the assembled document for in-document scrolling.

interface ManifestItem {
  href: string;
  id: string;
  mediaType?: string;
}

export interface WholeBookHtml {
  html: string;
  /** Ordered TOC label -> in-document anchor target (e.g. "#sec-1--chapter-2"). */
  toc: { label: string; target: string }[];
  /** Number of non-empty sections assembled. */
  sectionCount: number;
}

// Minimal RFC-3986 resolution for relative URLs against a base path (no
// origin in EPUBs). Mirrors foliate's internal resolveURL.
function resolveURL(url: string, relativeTo: string): string {
  try {
    if (/^(https?:|data:|blob:)/i.test(url)) return url;
    if (!relativeTo) return url; // already root-relative (e.g. manifest href)
    const root = "x://base/";
    const baseDir = relativeTo.includes("/")
      ? relativeTo.slice(0, relativeTo.lastIndexOf("/") + 1)
      : "";
    const obj = new URL(url, root + baseDir);
    obj.hash = "";
    obj.search = "";
    let out = obj.href.replace(root, "");
    return decodeURI(out);
  } catch {
    return url;
  }
}

// Resolve a resource reference (e.g. an <img src> or <math altimg>) to the
// exact href form foliate uses as keys in its manifest. foliate normalizes every
// manifest item href against the OPF path using a virtual `file:////base/` root,
// so its `resources.resolveHref(ref)` produces the same key we can look up in
// itemByHref / hand to book.loadBlob(). Fall back to plain relative resolution
// when that isn't available. Protocol/data URIs pass through unchanged.
function resolveBookRef(ref: string, href: string, book: any): string {
  if (/^(https?:|data:|blob:|mailto:|tel:|cid:)/i.test(ref)) return ref;
  try {
    const fr = book?.resources?.resolveHref?.(ref);
    if (typeof fr === "string" && fr) return fr;
  } catch {
    /* fall through */
  }
  return resolveURL(ref, href);
}

// Find the manifest item for a resolved resource href. Tries, in order:
//  1. exact match against itemByHref
//  2. suffix match against the same map (handles a leading base prefix)
//  3. a unique bare-filename match (books often reference by basename)
// Returns the foliate manifest item (whose .href book.loadBlob accepts) or null.
function findManifestItem(
  resolved: string,
  itemByHref: Map<string, any>,
  manifest: any[],
): any | null {
  if (!resolved) return null;
  const exact = itemByHref.get(resolved);
  if (exact) return exact;
  // Try a unique bare-filename match (books often reference by basename).
  const baseName = String(resolved).split("/").pop();
  let uniqueByBase = null;
  for (const m of manifest) {
    const mh = String(m.href);
    if (mh === resolved) return m;
    if (baseName && mh.endsWith("/" + baseName)) {
      if (uniqueByBase) { uniqueByBase = null; break; } // ambiguous basename
      uniqueByBase = m;
    }
  }
  return uniqueByBase;
}

// Rewrite an href to an in-document anchor given the section index where the
// link originates and the target resolution.
function rewriteHref(
  href: string,
  originIndex: number,
  originHref: string,
  pathToIndex: Map<string, number>,
): string {
  if (!href) return href;
  // Leave protocols / data URIs untouched.
  if (/^(https?:|data:|blob:|mailto:|tel:)/i.test(href)) return href;
  if (href.startsWith("#")) return href;
  const fragIdx = href.indexOf("#");
  const rawPath = fragIdx >= 0 ? href.slice(0, fragIdx) : href;
  const frag = fragIdx >= 0 ? href.slice(fragIdx + 1) : "";

  // Resolve the path relative to the section where the link appears, then
  // map it to the spine index (handles links like "text00002.html#chapter-2").
  const path = resolveURL(rawPath, originHref);
  let targetIndex = originIndex;
  if (rawPath) {
    targetIndex =
      pathToIndex.get(String(path)) ??
      pathToIndex.get(String(path.split("/").pop())) ??
      originIndex;
  }
  return `#sec-${targetIndex}${frag ? `--${frag}` : ""}`;
}

function cleanNode(el: Element): void {
  // Remove scripts and style tags, and event handler attributes.
  el.querySelectorAll("script, style, link, meta, title, base").forEach((n) => n.remove());
  const attrsToStrip = [
    "onclick", "onload", "onerror", "onmouseover", "onfocus", "onblur",
    "onsubmit", "ondblclick", "onkeydown", "onkeypress", "onkeyup",
    "onmousedown", "onmousemove", "onmouseout", "onmouseup", "ontouchstart",
    "ontouchend", "ontouchmove",
  ];
  el.querySelectorAll("*").forEach((n) => {
    attrsToStrip.forEach((a) => n.removeAttribute(a));
    // Strip inline styling that fights the dark reader theme or line-height.
    const style = n.getAttribute("style");
    if (style) {
      const cleaned = style
        .split(";")
        .map((d) => d.trim())
        .filter((d) => {
          if (!d) return true;
          const lower = d.toLowerCase();
          if (/^(color|background|background-color|line-height)\s*:/i.test(lower)) return false;
          return true;
        })
        .join("; ");
      if (cleaned) n.setAttribute("style", cleaned);
      else n.removeAttribute("style");
    }
  });
}

export async function buildWholeBookHtml(book: any): Promise<WholeBookHtml> {
  const manifest: ManifestItem[] = book?.resources?.manifest ?? [];
  const spine: { idref: string; linear?: string }[] = book?.resources?.spine ?? [];
  const toc: { label?: string; href?: string }[] = book?.toc ?? [];

  // path (normalized href) -> manifest item
  const itemById = new Map<string, ManifestItem>();
  const itemByHref = new Map<string, ManifestItem>();
  for (const item of manifest) {
    itemById.set(item.id, item);
    itemByHref.set(String(item.href), item);
  }

  // Map spine href -> spine index (0-based), honoring the requested order.
  // Index by the full resolved href AND by the bare filename so links written
  // as either "OEBPS/text00002.html" or "text00002.html" both resolve.
  const ordered: { item: ManifestItem; href: string }[] = [];
  const pathToIndex = new Map<string, number>();
  const setPath = (path: string, idx: number) => {
    if (path && !pathToIndex.has(path)) pathToIndex.set(path, idx);
    const base = path.split("/").pop() || path;
    if (base && base !== path && !pathToIndex.has(base)) pathToIndex.set(base, idx);
  };
  for (let i = 0; i < spine.length; i++) {
    const item = itemById.get(spine[i].idref);
    if (!item) continue;
    // Only include linear content (skip non-linear backmatter like copyrights).
    if (spine[i].linear === "no") continue;
    ordered.push({ item, href: String(item.href) });
    setPath(String(item.href), ordered.length - 1);
  }

  const parser = new DOMParser();
  const sectionHtml: string[] = [];
  const parserWarnings: string[] = [];

  for (let i = 0; i < ordered.length; i++) {
    const { item, href } = ordered[i];
    try {
      const raw = await book.loadText(href);
      if (!raw || !raw.trim()) continue;
      const doc = parser.parseFromString(
        raw,
        (item.mediaType || "text/html") as DOMParserSupportedType,
      );
      let body = doc.body as HTMLElement | null;
      if (!body) {
        body = doc.documentElement.children.length
          ? (doc.documentElement as unknown as HTMLElement)
          : null;
      }
      if (!body) continue;
      const bodyHtml = body.innerHTML;

      // Parse body fragment separately so we can transform its subtree.
      const frag = parser.parseFromString(
        `<body xmlns="http://www.w3.org/1999/xhtml">${bodyHtml}</body>`,
        "text/html",
      ).body as HTMLElement;

      cleanNode(frag);

      // Namespace ids and rewrite anchors.
      frag.querySelectorAll("[id]").forEach((n) => {
        const oldId = n.getAttribute("id")!;
        n.setAttribute("id", `sec-${i}--${oldId}`);
      });
      frag.querySelectorAll("a").forEach((a) => {
        const h = a.getAttribute("href");
        if (h) a.setAttribute("href", rewriteHref(h, i, href, pathToIndex));
      });
      // Handle legacy <a name> anchors and aria-labelledby etc. not needed here.

      // Inline images by resolving their href against the section's manifest href.
      const images = Array.from(frag.querySelectorAll("img, image"));
      for (const img of images) {
        const src = img.getAttribute("src") || img.getAttribute("xlink:href") || img.getAttribute("href");
        if (!src) continue;
        if (/^data:/i.test(src)) continue;
        const resolved = resolveBookRef(src, href, book);
        const matched = findManifestItem(resolved, itemByHref, manifest);
        if (!matched) {
          img.remove();
          continue;
        }
        try {
          const blob = await book.loadBlob(matched.href);
          const dataUri = await blobToDataUrl(blob);
          img.setAttribute("src", dataUri);
          img.removeAttribute("xlink:href");
          img.removeAttribute("href");
        } catch {
          img.remove();
        }
      }

      // Render equation bitmaps. Many textbooks encode formulas as MathML that
      // ALSO carries a bitmap fallback in the `altimg` attribute (and sometimes
      // a cached copy in `data-uri`). Chromium only implements MathML Core, so
      // complex formulas (fractions <mfrac>, sub/superscripts <msub/msup>, and
      // accents <mover>) cannot be laid out and get painted as missing-glyph
      // "OBJ" boxes. This book has zero standalone <img> figures — the ONLY
      // graphics are these MathML altimg bitmaps, which the img/image handler
      // above never sees (they are attributes, not <img> children).
      //
      // Fix: when a <math> element has a resolvable altimg (or data-uri)
      // bitmap, load it, inline it as a data:image, and REPLACE the <math>
      // element with an <img> so the publisher's own equation image displays
      // instead of the OBJ box. If the bitmap can't be resolved or loaded, we
      // LEAVE the MathML untouched (no worse than today) and log a warning.
      const mathEls = Array.from(frag.querySelectorAll("math"));
      for (const mathEl of mathEls) {
        const altImg = mathEl.getAttribute("altimg");
        const dataUriSrc = mathEl.getAttribute("data-uri");
        let ref = altImg || dataUriSrc || "";
        // Prefer a real bitmap over an empty data-uri bookkeeping field.
        if (!ref && dataUriSrc) ref = dataUriSrc;
        if (!ref) continue;

        const resolved = resolveBookRef(ref, href, book);
        // Already a data/remote URI directly (no manifest lookup needed).
        if (/^data:/i.test(resolved)) {
          replaceMathWithImg(mathEl, resolved);
          continue;
        }
        const matched = findManifestItem(resolved, itemByHref, manifest);
        if (!matched) {
          parserWarnings.push(
            `[math altimg] no manifest item for ${resolved} (kept MathML)`
          );
          continue;
        }
        try {
          const blob = await book.loadBlob(matched.href);
          const dataUri = await blobToDataUrl(blob);
          replaceMathWithImg(mathEl, dataUri);
        } catch (e) {
          parserWarnings.push(
            `[math altimg] load failed for ${resolved} (kept MathML): ${String(e && (e as Error).message || e)}`
          );
        }
      }

      const inner = frag.innerHTML
        .replace(/^\s*</, "<")
        .trim();
      sectionHtml.push(
        `<section id="sec-${i}" class="epub-section" data-section="${i}">${inner}</section>`,
      );
    } catch (e) {
      parserWarnings.push(String(e && (e as Error).message || e));
    }
  }

  const html = sectionHtml.join("\n");

  // Build TOC: map each book.toc href (e.g. "OEBPS/text00002.html#chapter-2")
  // to an in-document anchor.
  const mappedToc: { label: string; target: string }[] = [];
  for (const entry of toc) {
    if (!entry.href) continue;
    const target = rewriteHref(String(entry.href), 0, "", pathToIndex);
    mappedToc.push({ label: String(entry.label || "").trim() || target, target });
  }

  if (parserWarnings.length) {
    // Cap output so a book with many unresolved math altimg refs doesn't flood
    // the console. Always log the total count (useful for diagnosing losses).
    const shownAlt = parserWarnings.filter((w) => w.startsWith("[math altimg]")).length;
    const capped =
      parserWarnings.length > 20
        ? parserWarnings.slice(0, 20).concat(`...and ${parserWarnings.length - 20} more`)
        : parserWarnings;
    console.warn(
      `[epubWhole] ${parserWarnings.length} warning(s) (${shownAlt} math-altimg), e.g.:`,
      capped
    );
  }

  return { html, toc: mappedToc, sectionCount: ordered.length };
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const base64 = typeof btoa === "function" ? btoa(binary) : "";
  const mime = (blob.type || "image/png").split(";")[0];
  return `data:${mime};base64,${base64}`;
}

// Replace a <math> element with an <img> rendering the equation's bitmap
// fallback. Honors the publisher's altimg-width / altimg-height (CSS px), and
// keeps the surrounding layout intact by swapping the node in place.
function replaceMathWithImg(mathEl: Element, dataUri: string): void {
  const img = mathEl.ownerDocument.createElement("img");
  img.setAttribute("src", dataUri);
  img.setAttribute("alt", "equation");
  img.setAttribute("loading", "lazy");
  img.setAttribute("decoding", "async");

  const w = mathEl.getAttribute("altimg-width");
  const h = mathEl.getAttribute("altimg-height");
  // altimg-* dimensions come in CSS px. Set them as style so width/height
  // attributes (which some books use as layout hints) don't win out.
  const dims: string[] = [];
  if (w) { img.setAttribute("width", w); dims.push(`width: ${w}px`); }
  if (h) { img.setAttribute("height", h); dims.push(`height: ${h}px`); }
  if (dims.length) img.setAttribute("style", dims.join("; "));
  // Preserve inline/block intent: a block equation should sit on its own
  // line, an inline one should stay in the text flow.
  const display = mathEl.getAttribute("display");
  if (display !== "inline") img.setAttribute("style", `${img.getAttribute("style") || ""}; display: block; margin: 0.5rem 0;`.replace(/^; /, ""));

  // Copy ids so in-document anchors / TOC links to this equation keep working.
  if (mathEl.id) img.id = mathEl.id;
  mathEl.replaceWith(img);
}
