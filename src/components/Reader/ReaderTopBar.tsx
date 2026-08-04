interface ReaderTopBarProps {
  title: string;
  onSave: () => void;
  onClose: () => void;
}

export default function ReaderTopBar({ title, onSave, onClose }: ReaderTopBarProps) {
  return (
    <header className="flex items-center gap-2 px-3 sm:px-6 py-2 border-b border-white/10 bg-black z-10 safe-top">
      <button
        onClick={onClose}
        title="Back to library"
        className="p-2 text-white/70 hover:text-white rounded-lg hover:bg-white/10 min-w-[44px] min-h-[44px] flex items-center justify-center"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <h1 className="flex-1 min-w-0 text-white text-sm sm:text-base truncate" title={title}>
        {title}
      </h1>

      <button
        onClick={onSave}
        title="Save spot"
        className="inline-flex items-center gap-1 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm min-h-[44px]"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
        <span className="hidden sm:inline">Save spot</span>
      </button>
    </header>
  );
}
