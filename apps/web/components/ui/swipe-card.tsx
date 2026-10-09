"use client";

import { Check, X } from "lucide-react";
import { animate, motion, type PanInfo, useMotionValue, useTransform } from "motion/react";
import { type ReactNode, useState } from "react";

import { haptic, spring, SWIPE_THRESHOLD, SWIPE_VELOCITY, transitions } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Card you swipe right to confirm and left to decline. A colored layer is revealed behind it as it
 * moves; past the threshold it flies off and the action runs, otherwise it springs back. The same
 * actions are always available as buttons (gestures are never the only way).
 */
export function SwipeCard({
  children,
  onConfirm,
  onDecline,
  confirmLabel = "Confirmar",
  declineLabel = "Recusar",
  disabled,
  className,
}: {
  children: ReactNode;
  onConfirm: () => void | Promise<unknown>;
  onDecline: () => void | Promise<unknown>;
  confirmLabel?: string;
  declineLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const x = useMotionValue(0);
  const [busy, setBusy] = useState(false);
  const confirmOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const declineOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);
  const iconScale = useTransform(x, [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD], [1, 0.6, 1]);

  async function commit(direction: "confirm" | "decline") {
    if (busy) return;
    setBusy(true);
    haptic();
    await animate(x, direction === "confirm" ? 480 : -480, transitions.base);
    try {
      await (direction === "confirm" ? onConfirm() : onDecline());
    } catch {
      // The caller shows the error; bring the card back.
      await animate(x, 0, spring.gentle);
    } finally {
      setBusy(false);
    }
  }

  function onDragEnd(_event: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_THRESHOLD || info.velocity.x > SWIPE_VELOCITY) void commit("confirm");
    else if (info.offset.x < -SWIPE_THRESHOLD || info.velocity.x < -SWIPE_VELOCITY)
      void commit("decline");
    else void animate(x, 0, spring.gentle);
  }

  return (
    <div className={cn("relative overflow-hidden rounded-lg", className)}>
      <motion.div
        aria-hidden
        style={{ opacity: confirmOpacity }}
        className="absolute inset-0 flex items-center justify-start bg-ball px-6 text-on-color"
      >
        <motion.span style={{ scale: iconScale }} className="flex items-center gap-2 font-semibold">
          <Check className="size-6" /> {confirmLabel}
        </motion.span>
      </motion.div>
      <motion.div
        aria-hidden
        style={{ opacity: declineOpacity }}
        className="absolute inset-0 flex items-center justify-end bg-danger px-6 text-on-color"
      >
        <motion.span style={{ scale: iconScale }} className="flex items-center gap-2 font-semibold">
          {declineLabel} <X className="size-6" />
        </motion.span>
      </motion.div>

      <motion.div
        drag={disabled || busy ? false : "x"}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.6}
        onDragEnd={onDragEnd}
        style={{ x, touchAction: "pan-y" }}
        className="relative rounded-lg border border-border bg-card shadow-card"
      >
        {children}
        <div className="flex gap-2 px-4 pb-4">
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void commit("decline")}
            className="h-11 flex-1 rounded-full bg-danger-soft text-small font-medium text-danger-ink transition-tokens disabled:opacity-50"
          >
            {declineLabel}
          </button>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void commit("confirm")}
            className="h-11 flex-1 rounded-full bg-primary text-small font-semibold text-primary-foreground transition-tokens disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
