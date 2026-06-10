"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";

/**
 * Accessible modal built on Radix Dialog (focus trap, ESC, scroll lock, ARIA).
 * Re-exports the Radix parts and provides themed Content/Title/Description so
 * confirm-flows (discard, submit, reset) compose them in F1+.
 */
export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;
export const DialogPortal = RadixDialog.Portal;

export function DialogOverlay({
  className,
  ...props
}: RadixDialog.DialogOverlayProps) {
  return (
    <RadixDialog.Overlay
      className={cn("fixed inset-0 z-40 bg-black/50", className)}
      {...props}
    />
  );
}

export interface DialogContentProps extends RadixDialog.DialogContentProps {
  className?: string;
}

export function DialogContent({ className, children, ...props }: DialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <RadixDialog.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2",
          "rounded-card border border-border bg-surface p-6 text-fg shadow-lg",
          "focus:outline-none",
          className,
        )}
        {...props}
      >
        {children}
      </RadixDialog.Content>
    </DialogPortal>
  );
}

export function DialogTitle({ className, ...props }: RadixDialog.DialogTitleProps) {
  return (
    <RadixDialog.Title
      className={cn("text-lg font-semibold text-fg", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: RadixDialog.DialogDescriptionProps) {
  return (
    <RadixDialog.Description
      className={cn("mt-1 text-sm text-muted", className)}
      {...props}
    />
  );
}
