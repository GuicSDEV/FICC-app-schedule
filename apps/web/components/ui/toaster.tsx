"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

/** Themed sonner toasts, above the bottom nav and safe area. */
export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === "light" ? "light" : "dark"}
      position="top-center"
      offset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
      mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border !border-border !bg-surface-2 !text-foreground !shadow-raised !font-sans",
          description: "!text-muted-foreground",
          actionButton: "!rounded-full !bg-primary !text-primary-foreground !font-medium",
        },
      }}
    />
  );
}
