"use client";

interface ReaderBottomBarProps {
  visible: boolean;
  format: "epub" | "pdf";
  fontSize: number;
  lineHeight: number;
  // Reading progress as a 0–100 percentage (consistent across all books).
  percent: number;
  // Libra-style delta handlers: the bar computes +/- and calls with the delta.
  onFontSizeChange: (delta: number) => void;
  onLineHeightChange: (delta: number) => void;
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
  fontSize,
  lineHeight,
  percent,
  onFontSizeChange,
  onLineHeightChange,
}: ReaderBottomBarProps) {
  const canDecFont = fontSize - STEP >= FONT_MIN;
  const canIncFont = fontSize + STEP <= FONT_MAX;
  const canDecLine = lineHeight - STEP >= LINE_MIN;
  const canIncLine = lineHeight + STEP <= LINE_MAX;
  // Line-spacing is only meaningful for reflowable EPUB text. PDF is native
  // fixed layout (preserves charts/equations), so it exposes no line-height.
  const showsLineHeight = format === "epub";

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 safe-bottom ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="bg-black/85 backdrop-blur-md border-t border-white/10 px-2 sm:px-4 py-2.5">
        <div className="max-w-3xl mx-auto flex items-center justify-center gap-3 sm:gap-8">
          {/* Progress percentage (consistent across books, screens, zoom) */}
          <span className="text-xs text-white/60 tabular-nums whitespace-nowrap">
            {percent}%
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

          {/* Line spacing (reflowable EPUB text only) */}
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
        </div>
      </div>
    </div>
  );
}
