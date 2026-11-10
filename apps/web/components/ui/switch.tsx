"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** On/off setting with its label and an optional hint; the whole row is the 44px+ target. */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center gap-3 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:opacity-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-small font-medium">{label}</span>
        {hint ? <span className="block text-caption text-muted-foreground">{hint}</span> : null}
      </span>
      <span
        aria-hidden
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full border transition-tokens",
          checked ? "border-primary bg-primary" : "border-border-strong bg-surface-3",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-[1.375rem] rounded-full bg-background shadow-card transition-tokens",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}
