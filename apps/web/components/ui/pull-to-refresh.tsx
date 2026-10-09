"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { type ReactNode, useRef, useState } from "react";

import { haptic, PULL_THRESHOLD, spring } from "@/lib/motion";

import { TennisBall } from "./tennis-ball";

/**
 * Pull down at the top of the page to refresh. A tennis ball follows the pull and spins while
 * refreshing. Touch-only; mouse and keyboard users refresh through the page's own controls.
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown>;
  children: ReactNode;
}) {
  const pull = useMotionValue(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<number | null>(null);
  const ballY = useTransform(pull, (value) => Math.min(value, PULL_THRESHOLD * 1.4) - 40);
  const ballRotate = useTransform(pull, [0, PULL_THRESHOLD], [0, 300]);
  const ballOpacity = useTransform(pull, [0, PULL_THRESHOLD * 0.5], [0, 1]);
  const contentY = useTransform(pull, (value) => Math.min(value, PULL_THRESHOLD * 1.4) * 0.5);

  function onTouchStart(event: React.TouchEvent) {
    start.current = window.scrollY <= 0 && !refreshing ? (event.touches[0]?.clientY ?? null) : null;
  }

  function onTouchMove(event: React.TouchEvent) {
    if (start.current === null) return;
    const distance = (event.touches[0]?.clientY ?? 0) - start.current;
    // Resistance: the further you pull, the less it moves.
    pull.set(distance > 0 ? distance * 0.55 : 0);
  }

  async function onTouchEnd() {
    if (start.current === null) return;
    start.current = null;
    if (pull.get() >= PULL_THRESHOLD) {
      haptic();
      setRefreshing(true);
      void animate(pull, PULL_THRESHOLD, spring.gentle);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        void animate(pull, 0, spring.gentle);
      }
    } else {
      void animate(pull, 0, spring.gentle);
    }
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={() => void onTouchEnd()}
      className="relative"
    >
      <motion.div
        aria-hidden
        style={{ y: ballY, opacity: ballOpacity, rotate: refreshing ? undefined : ballRotate }}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
      >
        <TennisBall spinning={refreshing} className="size-9 drop-shadow" />
      </motion.div>
      {refreshing ? (
        <span className="sr-only" role="status">
          Atualizando…
        </span>
      ) : null}
      <motion.div style={{ y: contentY }}>{children}</motion.div>
    </div>
  );
}
