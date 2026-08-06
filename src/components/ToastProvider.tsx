"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

/** Access the toast trigger from any component under the provider. */
export function useToast() {
  return useContext(ToastContext);
}

// Reusable: the provider exposes a forwarded trigger so callers can render the
// shared toast container elsewhere if needed. Kept internal/simple here.
function useToastState(): {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType) => void;
} {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, type }]);
      const timer = setTimeout(() => dismiss(id), 2500);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  return { toasts, showToast };
}

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const { toasts, showToast } = useToastState();

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast list: fixed bottom-center, above the reader bottom bar. */}
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] safe-bottom flex flex-col items-center gap-2 pointer-events-none"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto px-4 py-2 rounded-xl shadow-lg text-sm font-medium animate-[toastIn_0.18s_ease-out] border ${
              toast.type === "success"
                ? "bg-green-900 text-green-100 border-green-700/60"
                : toast.type === "error"
                  ? "bg-red-900 text-red-100 border-red-700/60"
                  : "bg-stone-800 text-stone-100 border-stone-700/60"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
