"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { cn } from "@/lib/cn";

export type ToastVariant = "info" | "success" | "warning" | "danger";

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toasts: ToastMessage[];
  toast: (input: Omit<ToastMessage, "id" | "variant"> & { variant?: ToastVariant }) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  info: "border-info",
  success: "border-success",
  warning: "border-warning",
  danger: "border-danger",
};

const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Lightweight toast provider (no external dep). Mount near the app root (wired
 * into providers.tsx during F1); call `useToast().toast(...)` to enqueue.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastContextValue["toast"]>(
    (input) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : String(Date.now() + Math.random());
      const message: ToastMessage = {
        id,
        title: input.title,
        description: input.description,
        variant: input.variant ?? "info",
      };
      setToasts((prev) => [...prev, message]);
      if (typeof window !== "undefined") {
        window.setTimeout(() => dismiss(id), DEFAULT_TIMEOUT_MS);
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,22rem)] flex-col gap-2"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "pointer-events-auto rounded-card border-l-4 border border-border bg-surface p-3 text-fg shadow-md",
            VARIANT_CLASSES[t.variant],
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{t.title}</p>
              {t.description ? (
                <p className="mt-0.5 text-xs text-muted">{t.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              className="text-muted hover:text-fg"
              onClick={() => onDismiss(t.id)}
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Access the toast API. Must be used under a `ToastProvider`. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
