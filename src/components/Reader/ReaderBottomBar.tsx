"use client";

interface ReaderBottomBarProps {
  visible: boolean;
  format: "epub" | "pdf";
  // PDF reader view mode (reflow text vs native raster).
  pdfMode?: "native" | "reflow";
  fontSize: number;
  lineHeight: number;
  currentPage: number;
  totalPages: number;
  // Libra-style delta handlers: the bar computes +/- and calls with the delta.
  onFontSizeChange: (delta: number) => void;
  onLineHeightChange: (delta: number) => void;
  onTogglePdfMode?: () => void;
}

const FONT_MIN = 8;
const FONT_MAX = 32;
const LINE_MIN = 4;
const LINE_MAX = 24;
const STEP = 2;

// Libra-style rounded -/+ buttons, one cluster per control. Touch-friendly.
function MinusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

export default function ReaderBottomBar({
  visible,
  format,
  pdfMode = "native",
  fontSize,
  lineHeight,
  currentPage,
  totalPages,
  onFontSizeChange,
  onLineHeightChange,
  onTogglePdfMode,
}: ReaderBottomBarProps) {
  const canDecFont = fontSize - STEP >= FONT_MIN;
  const canIncFont = fontSize + STEP <= FONT_MAX;
  const canDecLine = lineHeight - STEP >= LINE_MIN;
  const canIncLine = lineHeight + STEP <= LINE_MAX;
  // Line-spacing is meaningful when text can reflow: EPUB always, PDF only in
  // reflow mode (native PDF is fixed-layout).
  const showsLineHeight = format === "epub" || pdfMode === "reflow";

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 safe-bottom ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="bg-black/85 backdrop-blur-md border-t border-white/10 px-2 sm:px-4 py-2.5">
        <div className="max-w-3xl mx-auto flex items-center justify-center gap-3 sm:gap-8">
          {/* Page counter (Libra-style) */}
          <span className="text-xs text-white/60 tabular-nums whitespace-nowrap">
            {currentPage} / {totalPages}
          </span>

          {/* Text size */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-xs text-white/50 hidden sm:inline" aria-hidden>
              A<span className="text-[9px]">a</span>
            </span>
            <button
              onClick={() => onFontSizeChange(-STEP)}
              disabled={!canDecFont}
              aria-label="Decrease text size"
              className="w-11 h-11 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:pointer-events-none transition-colors touch-manipulation"
            >
              <MinusIcon />
            </button>
            <span className="text-sm text-white/90 w-7 text-center tabular-nums">
              {fontSize}
            </span>
            <button
              onClick={() => onFontSizeChange(STEP)}
              disabled={!canIncFont}
              aria-label="Increase text size"
              className="w-11 h-11 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:pointer-events-none transition-colors touch-manipulation"
            >
              <PlusIcon />
            </button>
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-white/15 hidden xs:block" />

          {/* Line spacing (reflowable text: EPUB always; PDF reflow mode) */}
          {showsLineHeight && (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-xs text-white/50 hidden sm:inline" aria-hidden>
                ↕
              </span>
              <button
                onClick={() => onLineHeightChange(-STEP)}
                disabled={!canDecLine}
                aria-label="Decrease line spacing"
                className="w-11 h-11 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:pointer-events-none transition-colors touch-manipulation"
              >
                <MinusIcon />
              </button>
              <span className="text-sm text-white/90 w-7 text-center tabular-nums">
                {lineHeight}
              </span>
              <button
                onClick={() => onLineHeightChange(STEP)}
                disabled={!canIncLine}
                aria-label="Increase line spacing"
                className="w-11 h-11 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:pointer-events-none transition-colors touch-manipulation"
              >
                <PlusIcon />
              </button>
            </div>
          )}

          {/* PDF view-mode toggle: reflow text vs native layout */}
          {format === "pdf" && onTogglePdfMode && (
            <button
              onClick={onTogglePdfMode}
              aria-label={
                pdfMode === "reflow"
                  ? "Switch to native layout"
                  : "Switch to reflowed text"
              }
              title={
                pdfMode === "reflow"
                  ? "Native layout (keeps charts/equations)"
                  : "Reflow text: adjustable text size & line spacing"
              }
              className="flex items-center gap-1.5 px-3 h-10 rounded-lg text-xs text-white/80 hover:text-white hover:bg-white/10 border border-white/15 transition-colors touch-manipulation"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
              <span className="hidden sm:inline">
                {pdfMode === "reflow" ? "Layout" : "Reflow"}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
