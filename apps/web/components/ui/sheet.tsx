"use client";

import type { ReactNode } from "react";
import { Drawer } from "vaul";

import { cn } from "@/lib/utils";

/**
 * Bottom sheet (vaul): drag to dismiss, the page behind scales down. On wide screens it stays a
 * bottom sheet capped at a readable width.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/55" />
        <Drawer.Content
          aria-describedby={description ? undefined : undefined}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl border border-b-0 border-border bg-surface shadow-raised outline-none",
            className,
          )}
        >
          <div
            aria-hidden
            className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full bg-border-strong"
          />
          <div className="px-5 pt-4 pb-2">
            <Drawer.Title className="font-display text-title font-semibold">{title}</Drawer.Title>
            {description ? (
              <Drawer.Description className="mt-1 text-small text-muted-foreground">
                {description}
              </Drawer.Description>
            ) : (
              <Drawer.Description className="sr-only">{title}</Drawer.Description>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
          {footer ? (
            <div className="border-t border-border px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          ) : (
            <div className="pb-[max(1rem,env(safe-area-inset-bottom))]" />
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
