"use client";

import { motion } from "motion/react";
import { useId } from "react";

import { spring, tap } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Scrollable chip tabs; the active pill glides between them. */
export function CategoryTabs({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const id = useId();
  return (
    <div
      role="tablist"
      aria-label={label}
      className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4 py-2 md:mx-0 md:px-0"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <motion.button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            whileTap={tap}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative h-11 shrink-0 rounded-full px-4 text-small font-medium transition-tokens",
              selected
                ? "text-primary-foreground"
                : "bg-surface-2 text-muted-foreground hover:text-foreground",
            )}
          >
            {selected ? (
              <motion.span
                layoutId={`tab-${id}`}
                transition={spring.snappy}
                className="absolute inset-0 rounded-full bg-primary"
              />
            ) : null}
            <span className="relative">{option.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
