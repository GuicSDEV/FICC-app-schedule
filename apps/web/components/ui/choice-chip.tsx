"use client";

import { Check } from "lucide-react";
import { type HTMLMotionProps, motion } from "motion/react";
import type { ReactNode } from "react";

import { tap } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Pill toggle for picking options (courts, weekdays, times…); 44px tall. */
export function ChoiceChip({
  selected,
  children,
  className,
  showCheck,
  ...props
}: Omit<HTMLMotionProps<"button">, "children"> & {
  selected: boolean;
  children: ReactNode;
  showCheck?: boolean;
}) {
  return (
    <motion.button
      type="button"
      whileTap={tap}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-4 text-small font-medium transition-tokens disabled:opacity-40",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-surface-2 text-foreground hover:bg-surface-3",
        className,
      )}
      {...props}
    >
      {showCheck && selected ? <Check className="size-4" /> : null}
      {children}
    </motion.button>
  );
}

/** Wrapping group of chips with an accessible label. */
export function ChipGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {children}
    </div>
  );
}
