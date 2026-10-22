"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Accessible modal built on the native <dialog>: focus trapping, Escape and
 * top-layer rendering come from the browser. Enter/exit transitions live in
 * globals.css (.cl-dialog).
 *
 * Content stays mounted while the exit transition plays, and is re-keyed on
 * every open so forms always start fresh.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  width = "lg",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  width?: "md" | "lg";
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [session, setSession] = useState(0);
  const [prevOpen, setPrevOpen] = useState(open);

  // Derive a new session id when the dialog transitions to open.
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setSession((s) => s + 1);
  }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // React's autoFocus runs before the dialog is shown, so focus the
      // marked field explicitly once the dialog is open.
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => {
        if (open) onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Clicking the backdrop (the dialog element itself) closes it.
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "cl-dialog m-auto w-[calc(100%-2rem)] rounded-xl border-0 bg-panel p-0 text-fg shadow-pop",
        width === "md" ? "max-w-md" : "max-w-lg",
        className,
      )}
    >
      {session > 0 && (
        <div key={session} className="flex max-h-[85dvh] flex-col">
          <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
            <div>
              <h2 id={titleId} className="text-[15px] font-semibold tracking-[-0.01em]">
                {title}
              </h2>
              {description && (
                <p className="mt-1 text-[13px] leading-5 text-fg-subtle">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-1.5 -mt-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 pb-4 pt-1">{children}</div>
        </div>
      )}
    </dialog>
  );
}

/** Footer row for forms inside a Modal. */
export function ModalActions({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-5 -mb-4 mt-5 flex items-center justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3">
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[12.5px] font-medium text-fg-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12px] text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-[12px] text-fg-subtle">{hint}</p>
      )}
    </div>
  );
}

export const inputClasses =
  "h-9 w-full rounded-[7px] border border-line-strong bg-panel px-3 text-[13.5px] text-fg placeholder:text-fg-faint outline-none transition-[border-color,box-shadow] duration-150 focus:border-accent/60 focus:shadow-[0_0_0_3px_rgb(38_115_77/0.12)]";
