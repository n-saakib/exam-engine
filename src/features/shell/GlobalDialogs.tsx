"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/Dialog";
import { Button } from "@/components/Button";

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
}

type ConfirmResolver = (confirmed: boolean) => void;

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions;
  resolve: ConfirmResolver;
}

interface GlobalDialogsContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const GlobalDialogsContext = createContext<GlobalDialogsContextValue | null>(null);

const DEFAULT_CONFIRM: ConfirmOptions = {
  title: "Are you sure?",
  confirmLabel: "Confirm",
  cancelLabel: "Cancel",
  variant: "danger",
};

/**
 * Host for application-wide dialog flows: confirm/discard/exhausted.
 * Mount once at the app root (wired into providers.tsx during F1). Feature
 * screens call `useGlobalDialogs().confirm(...)` which returns a Promise<boolean>
 * that resolves when the user responds. F4/F6/F8 reuse this for discard/reset.
 */
export function GlobalDialogsProvider({ children }: { children: React.ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  // Ref mirrors the current state so the unmount cleanup can resolve any
  // in-flight promise even after the state has been reset. Mirrored in an
  // effect (not during render) to satisfy react-hooks/refs.
  const stateRef = useRef<ConfirmState | null>(null);
  useEffect(() => {
    stateRef.current = confirmState;
  }, [confirmState]);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({
        open: true,
        options: { ...DEFAULT_CONFIRM, ...options },
        resolve,
      });
    });
  }, []);

  // If the provider unmounts while a confirm is pending, resolve the
  // outstanding promise as `false` so the caller doesn't hang on a
  // never-resolving Promise (which can also surface as an act() timeout).
  useEffect(() => {
    return () => {
      const pending = stateRef.current;
      if (pending) pending.resolve(false);
    };
  }, []);

  const handleConfirm = () => {
    confirmState?.resolve(true);
    setConfirmState(null);
  };

  const handleCancel = () => {
    confirmState?.resolve(false);
    setConfirmState(null);
  };

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <GlobalDialogsContext.Provider value={value}>
      {children}
      {/* Confirm Dialog */}
      <Dialog open={confirmState?.open ?? false} onOpenChange={(open) => {
        if (!open) handleCancel();
      }}>
        {confirmState && (
          <DialogContent>
            <DialogTitle>{confirmState.options.title}</DialogTitle>
            {confirmState.options.description && (
              <DialogDescription>
                {confirmState.options.description}
              </DialogDescription>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                {confirmState.options.cancelLabel}
              </Button>
              <Button
                variant={confirmState.options.variant ?? "danger"}
                size="sm"
                onClick={handleConfirm}
              >
                {confirmState.options.confirmLabel}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </GlobalDialogsContext.Provider>
  );
}

/** Access global dialog utilities. Must be used under a GlobalDialogsProvider. */
export function useGlobalDialogs(): GlobalDialogsContextValue {
  const ctx = useContext(GlobalDialogsContext);
  if (!ctx) {
    throw new Error("useGlobalDialogs must be used within a GlobalDialogsProvider");
  }
  return ctx;
}
