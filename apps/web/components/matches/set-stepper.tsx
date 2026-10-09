"use client";

import { Minus, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { spring, tap, transitions } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * − value + for one side's games in a set. The number rolls up or down as it changes.
 */
export function Stepper({
  value,
  onChange,
  max,
  label,
  emphasis,
}: {
  value: number;
  onChange: (value: number) => void;
  max: number;
  label: string;
  emphasis?: boolean;
}) {
  const t = useTranslations("report");
  const [direction, setDirection] = useState(1);
  const step = (delta: number) => {
    setDirection(delta);
    onChange(Math.min(max, Math.max(0, value + delta)));
  };

  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-1 rounded-full border border-border bg-surface-2 p-1"
    >
      <motion.button
        type="button"
        whileTap={tap}
        transition={spring.snappy}
        disabled={value <= 0}
        onClick={() => step(-1)}
        aria-label={t("decrease", { label })}
        className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-tokens hover:bg-surface-3 hover:text-foreground disabled:opacity-40"
      >
        <Minus className="size-4" />
      </motion.button>
      <span
        aria-live="polite"
        className={cn(
          "relative flex h-11 w-9 items-center justify-center overflow-hidden num text-title font-semibold",
          emphasis ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.span
            key={value}
            custom={direction}
            variants={{
              enter: (dir: number) => ({ y: dir * 18, opacity: 0 }),
              center: { y: 0, opacity: 1 },
              exit: (dir: number) => ({ y: dir * -18, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={transitions.fast}
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </span>
      <motion.button
        type="button"
        whileTap={tap}
        transition={spring.snappy}
        disabled={value >= max}
        onClick={() => step(1)}
        aria-label={t("increase", { label })}
        className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-tokens hover:bg-surface-3 hover:text-foreground disabled:opacity-40"
      >
        <Plus className="size-4" />
      </motion.button>
    </div>
  );
}
