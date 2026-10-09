"use client";

import { motion } from "motion/react";
import { useId } from "react";

import { spring, tap } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Pill segmented control whose highlight glides between options. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("flex rounded-full border border-border bg-surface-2 p-1", className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <motion.button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            whileTap={tap}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative h-10 min-w-0 flex-1 rounded-full px-3 text-small font-medium transition-tokens",
              selected ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {selected ? (
              <motion.span
                layoutId={`segment-${id}`}
                transition={spring.snappy}
                className="absolute inset-0 rounded-full bg-primary shadow-card"
              />
            ) : null}
            <span className="relative truncate">{option.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
