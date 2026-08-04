interface ReaderBottomBarProps {
  visible: boolean;
  format: "epub" | "pdf";
  fontSize: number;
  lineHeight: number;
  onFontSize: (v: number) => void;
  onLineHeight: (v: number) => void;
}

export default function ReaderBottomBar({
  visible,
  format,
  fontSize,
  lineHeight,
  onFontSize,
  onLineHeight,
}: ReaderBottomBarProps) {
  return (
    <footer
      className={`flex items-center gap-4 px-3 sm:px-6 py-2 border-t border-white/10 bg-black z-10 safe-bottom transition-transform duration-200 min-h-[56px] ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <Slider
        label="Text size"
        value={fontSize}
        min={8}
        max={32}
        step={2}
        onChange={onFontSize}
      />
      {format === "epub" && (
        <Slider
          label="Line spacing"
          value={lineHeight}
          min={4}
          max={24}
          step={2}
          onChange={onLineHeight}
        />
      )}
    </footer>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 flex-1 min-w-0">
      <span className="text-xs text-white/50 whitespace-nowrap hidden sm:inline">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 min-w-0 accent-white"
        aria-label={label}
      />
    </label>
  );
}
