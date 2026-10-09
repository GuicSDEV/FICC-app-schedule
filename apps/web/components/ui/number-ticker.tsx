"use client";

import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";

import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Counts up or down to `value` with a spring (Elo, wins, win rate). Screen readers get the final
 * value only; reduced motion jumps straight to it.
 */
export function NumberTicker({
  value,
  from,
  format = (n) => String(n),
  className,
}: {
  value: number;
  /** Starting value on first render (defaults to `value`, i.e. no initial count). */
  from?: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const springValue = useSpring(from ?? value, {
    stiffness: spring.gentle.stiffness,
    damping: spring.gentle.damping,
  });
  const display = useTransform(springValue, (latest) => format(Math.round(latest)));

  useEffect(() => {
    if (reduce) springValue.jump(value);
    else springValue.set(value);
  }, [value, reduce, springValue]);

  return (
    <span className={cn("inline-block num", className)}>
      <motion.span aria-hidden>{display}</motion.span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
