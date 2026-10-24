"use client";

import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

type Tone = "success" | "info" | "warning";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: Tone;
  action?: ToastAction;
  leaving?: boolean;
}

interface ToastInput {
  title: string;
  description?: string;
  tone?: Tone;
  action?: ToastAction;
  /** ms before it hides (default 4200). */
  duration?: number;
}

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const icons = {
  success: <CircleCheck className="h-4 w-4 animate-check text-accent" />,
  info: <Info className="h-4 w-4 text-info" />,
  warning: <TriangleAlert className="h-4 w-4 text-warning" />,
};

const EXIT_MS = 180;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const push = useCallback(
    ({ tone = "success", duration = 4200, ...rest }: ToastInput) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-2), { id, tone, ...rest }]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[10px] bg-overlay p-3.5 shadow-pop transition-[opacity,transform] duration-200",
              t.leaving ? "translate-y-1 opacity-0" : "animate-toast-in",
            )}
          >
            <span className="mt-px">{icons[t.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-fg">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-[12.5px] leading-5 text-fg-subtle">{t.description}</p>
              )}
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                  className="mt-2 text-[12.5px] font-medium text-accent hover:text-accent-strong"
                >
                  {t.action.label} →
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
              className="rounded p-0.5 text-fg-faint transition-colors hover:text-fg"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
