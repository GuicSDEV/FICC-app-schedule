"use client";

import { motion } from "motion/react";
import { useId } from "react";

import { duration, ease, transitions } from "@/lib/motion";
import { cn } from "@/lib/utils";

const WIDTH = 300;
const HEIGHT = 72;
const PAD = 6;

/** Smooth path through the points (Catmull-Rom converted to cubic Béziers). */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  let d = `M ${first!.x} ${first!.y}`;
  for (let index = 0; index < rest.length; index++) {
    const p0 = points[index - 1] ?? points[index]!;
    const p1 = points[index]!;
    const p2 = points[index + 1]!;
    const p3 = points[index + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/**
 * Elo sparkline: the line draws itself, the area fades in under it and the latest point pulses.
 * Purely decorative (the numbers are next to it), so it is hidden from screen readers.
 */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const id = useId();
  const series = values.length === 1 ? [values[0]!, values[0]!] : values;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const points = series.map((value, index) => ({
    x: PAD + (index / Math.max(series.length - 1, 1)) * (WIDTH - PAD * 2),
    y: PAD + (1 - (value - min) / span) * (HEIGHT - PAD * 2),
  }));
  const line = smoothPath(points);
  const last = points[points.length - 1];
  const area = last ? `${line} L ${last.x} ${HEIGHT} L ${points[0]!.x} ${HEIGHT} Z` : "";

  return (
    <div className={cn("relative h-16 w-full text-primary", className)}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden
        className="h-full w-full overflow-visible"
      >
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {series.length > 0 ? (
          <>
            <motion.path
              d={area}
              fill={`url(#${id}-fill)`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...transitions.slow, delay: duration.slow }}
            />
            <motion.path
              d={line}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: duration.slow * 2, ease: ease.out }}
            />
          </>
        ) : null}
      </svg>
      {/* The end point is HTML so it stays round while the SVG stretches to the card width. */}
      {last ? (
        <motion.span
          aria-hidden
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...transitions.base, delay: duration.slow * 2 }}
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${(last.x / WIDTH) * 100}%`, top: `${(last.y / HEIGHT) * 100}%` }}
        >
          <span className="absolute -inset-1.5 animate-ping rounded-full bg-current opacity-30" />
          <span className="absolute inset-0 rounded-full bg-current ring-2 ring-card" />
        </motion.span>
      ) : null}
    </div>
  );
}
