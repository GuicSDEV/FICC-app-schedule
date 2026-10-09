import type { Transition, Variants } from "motion/react";

/*
 * Motion system (docs/SPEC.md, MOTION SYSTEM). Every animation in the app takes its timing from
 * here: no ad-hoc durations elsewhere. Only `transform` and `opacity` are animated, and
 * <MotionConfig reducedMotion="user"> turns movement into fades when the user prefers it.
 */

/** Seconds. fast = feedback, base = transitions, slow = entrances / hero moments. */
export const duration = { fast: 0.15, base: 0.25, slow: 0.45 } as const;

export const ease = {
  /** Entrances: fast start, gentle landing. */
  out: [0.22, 1, 0.36, 1],
  /** Movement on screen. */
  inOut: [0.65, 0, 0.35, 1],
} as const;

export const spring = {
  /** Buttons, toggles, chips. */
  snappy: { type: "spring", stiffness: 500, damping: 30 },
  /** Layout, sheets, reorders. */
  gentle: { type: "spring", stiffness: 200, damping: 25 },
} as const satisfies Record<string, Transition>;

/** List stagger: 40 ms between items, only the first 8 animate. */
export const STAGGER = 0.04;
export const MAX_STAGGERED = 8;

/** Ambient loops (CSS mirrors these in globals.css). */
export const loop = { shimmer: 1.6, spin: 0.9, rain: 1.1 } as const;

/** Swipe gestures commit past this horizontal distance (px) or velocity (px/s). */
export const SWIPE_THRESHOLD = 96;
export const SWIPE_VELOCITY = 600;

/** Pull-to-refresh triggers past this pull distance (px). */
export const PULL_THRESHOLD = 72;

/** Tap feedback for every pressable element. */
export const tap = { scale: 0.97 } as const;

export const transitions = {
  fast: { duration: duration.fast, ease: ease.out },
  base: { duration: duration.base, ease: ease.out },
  slow: { duration: duration.slow, ease: ease.out },
  move: { duration: duration.base, ease: ease.inOut },
} as const satisfies Record<string, Transition>;

/** Route transitions: fade + 8px slide-up. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  enter: { opacity: 1, y: 0, transition: transitions.base },
  exit: { opacity: 0, y: -4, transition: transitions.fast },
};

/** Delay for the n-th item of a staggered list (items past MAX_STAGGERED appear at once). */
export function staggerDelay(index: number): number {
  return index < MAX_STAGGERED ? index * STAGGER : 0;
}

/** Staggered list items; pass the index as `custom`. */
export const listItemVariants: Variants = {
  hidden: (index: number) => (index < MAX_STAGGERED ? { opacity: 0, y: 12 } : { opacity: 1, y: 0 }),
  show: (index: number) => ({
    opacity: 1,
    y: 0,
    transition:
      index < MAX_STAGGERED ? { ...transitions.base, delay: staggerDelay(index) } : { duration: 0 },
  }),
  exit: { opacity: 0, scale: 0.98, transition: transitions.fast },
};

/** A badge, chip or check that pops in with a spring. */
export const popVariants: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  show: { opacity: 1, scale: 1, transition: spring.snappy },
  exit: { opacity: 0, scale: 0.8, transition: transitions.fast },
};

/** Content that fades in place (skeleton → content crossfade). */
export const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: transitions.base },
  exit: { opacity: 0, transition: transitions.fast },
};

/** Panels sliding up from the bottom (ticket cards, action rows). */
export const sheetVariants: Variants = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: spring.gentle },
  exit: { opacity: 0, y: 24, transition: transitions.fast },
};

/** Banners dropping from the top (rain mode). */
export const dropVariants: Variants = {
  hidden: { opacity: 0, y: -24 },
  show: { opacity: 1, y: 0, transition: spring.snappy },
  exit: { opacity: 0, y: -16, transition: transitions.fast },
};

/** Horizontal shake for invalid input (login). */
export const shakeAnimation = {
  x: [0, -10, 10, -8, 8, -4, 4, 0],
  transition: { duration: duration.slow, ease: ease.inOut },
} as const;

/** Short vibration on key confirmations where supported. */
export function haptic(pattern: number | number[] = 10): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Some browsers throw when vibration is blocked by policy.
    }
  }
}
