interface ReaderTopBarProps {
  title: string;
  onSave: () => void;
  onClose: () => void;
}

export default function ReaderTopBar({ title, onSave, onClose }: ReaderTopBarProps) {
  return (
    <header className="z-10 border-b border-white/10 bg-black/80 backdrop-blur-md safe-top">
      <div className="flex items-center gap-1.5 px-2 sm:px-4 py-1.5">
        <button
          onClick={onClose}
          title="Back to library"
          aria-label="Back to library"
          className="flex items-center justify-center w-11 h-11 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <h1 className="flex-1 min-w-0 text-white text-sm sm:text-base font-medium truncate px-1" title={title}>
          {title}
        </h1>

        <button
          onClick={onSave}
          title="Save spot"
          aria-label="Save spot"
          className="inline-flex items-center gap-1.5 px-3 h-11 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          <span className="hidden sm:inline">Save spot</span>
        </button>
      </div>
    </header>
  );
}
