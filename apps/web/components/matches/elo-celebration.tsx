"use client";

import type { NotificationItem, NotificationPayloads } from "@ficc/shared";
import confetti from "canvas-confetti";
import { ArrowUp, Trophy } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useSocketEvent } from "@/components/providers/socket-provider";
import { Button } from "@/components/ui/button";
import { CourtLines } from "@/components/ui/court-lines";
import { NumberTicker } from "@/components/ui/number-ticker";
import { duration, ease, enter, haptic, popVariants, spring, transitions } from "@/lib/motion";
import { formatDelta } from "@/lib/use-format";
import { cn } from "@/lib/utils";

type Result = NotificationPayloads["MATCH_CONFIRMED"];

/** Club palette for the confetti (lime ball, court greens and terracotta). */
const CONFETTI_COLORS = ["#D7F24A", "#4F8A68", "#D2603A", "#F7F6F2"];

function burst() {
  const base = { colors: CONFETTI_COLORS, disableForReducedMotion: true, zIndex: 70 };
  void confetti({ ...base, particleCount: 70, spread: 70, startVelocity: 42, origin: { y: 0.42 } });
  setTimeout(() => {
    void confetti({ ...base, particleCount: 40, angle: 60, spread: 55, origin: { x: 0, y: 0.6 } });
    void confetti({ ...base, particleCount: 40, angle: 120, spread: 55, origin: { x: 1, y: 0.6 } });
  }, duration.slow * 1000);
}

function Celebration({ result, onClose }: { result: Result; onClose: () => void }) {
  const t = useTranslations("celebration");
  const router = useRouter();
  const reduce = useReducedMotion();
  const [elo, setElo] = useState(result.eloBefore);
  const [revealed, setRevealed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const climbed = result.rankAfter < result.rankBefore;
  const won = result.won;

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    haptic(won ? [12, 50, 12, 50, 24] : 12);
    // Let the screen land, then roll the number and pop the chip.
    const roll = setTimeout(
      () => {
        setElo(result.eloAfter);
        setRevealed(true);
        if (won && !reduce) burst();
      },
      reduce ? 0 : duration.slow * 1000,
    );
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(roll);
      window.removeEventListener("keydown", onKey);
    };
  }, [result, won, reduce, onClose]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={won ? t("titleWon") : t("title")}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={transitions.base}
      className="grain fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-background/95 px-6 pt-safe pb-safe text-center backdrop-blur-md"
    >
      <CourtLines className="opacity-[0.06]" />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/3 left-1/2 size-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl",
          won ? "bg-primary/25" : "bg-surface-3/60",
        )}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transitions.slow}
        className="relative space-y-2"
      >
        <p className="text-caption font-medium tracking-[0.12em] text-muted-foreground uppercase">
          {won ? t("titleWon") : t("title")}
        </p>
        <p className="num text-title font-semibold">{result.score}</p>
      </motion.div>

      <div className="relative mt-8 flex flex-col items-center">
        <NumberTicker
          value={elo}
          from={result.eloBefore}
          className="font-display text-[5.5rem] leading-none font-bold tracking-tight"
        />
        <p className="mt-2 text-small text-muted-foreground">{t("newElo")}</p>
        <div className="mt-5 h-12">
          <AnimatePresence>
            {revealed ? (
              <motion.span
                variants={popVariants}
                initial={enter("hidden")}
                animate="show"
                transition={{ ...spring.snappy, delay: duration.fast }}
                className={cn(
                  "inline-flex h-12 items-center rounded-full px-5 num text-title font-bold",
                  result.delta > 0
                    ? "bg-ball text-on-color shadow-glow"
                    : result.delta < 0
                      ? "bg-danger-soft text-danger-ink"
                      : "bg-surface-2 text-muted-foreground",
                )}
              >
                {formatDelta(result.delta)}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <div className="relative mt-8 h-14">
        {climbed ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={revealed ? { opacity: 1, scale: [0.6, 1.15, 1] } : { opacity: 0, scale: 0.6 }}
            transition={{ duration: duration.slow, ease: ease.out, delay: duration.slow }}
            className="inline-flex h-14 items-center gap-3 rounded-full border border-gold/40 bg-card px-5 shadow-card"
          >
            <Trophy className="size-5 text-gold" aria-hidden />
            <span className="relative flex h-7 items-center overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={revealed ? "after" : "before"}
                  initial={{ y: 24, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -24, opacity: 0 }}
                  transition={{ ...spring.snappy, delay: revealed ? duration.slow * 1.6 : 0 }}
                  className="num text-title font-bold"
                >
                  #{revealed ? result.rankAfter : result.rankBefore}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className="inline-flex items-center gap-1 text-small font-medium text-success-ink">
              <ArrowUp className="size-4" aria-hidden />
              {t("climbed", { count: result.rankBefore - result.rankAfter })}
            </span>
          </motion.div>
        ) : (
          <p className="pt-4 text-small text-muted-foreground">
            {t("rank", { rank: result.rankAfter })}
          </p>
        )}
      </div>

      <div className="relative mt-10 flex w-full max-w-xs flex-col gap-2">
        <Button
          size="lg"
          block
          onClick={() => {
            onClose();
            router.push("/app/ranking");
          }}
        >
          {t("seeRanking")}
        </Button>
        <Button ref={closeRef} size="lg" variant="ghost" block onClick={onClose}>
          {t("close")}
        </Button>
      </div>
    </motion.div>
  );
}

/**
 * Fullscreen Elo celebration for each confirmed result the player receives (approval by the
 * opponent, auto-approval or admin resolution). Several arriving together play one after another.
 */
export function EloCelebration() {
  const [queue, setQueue] = useState<Result[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useSocketEvent("notification.created", (notification: NotificationItem) => {
    if (notification.type !== "MATCH_CONFIRMED") return;
    setQueue((current) =>
      current.some((entry) => entry.matchId === notification.payload.matchId)
        ? current
        : [...current, notification.payload],
    );
  });

  const close = useCallback(() => setQueue((current) => current.slice(1)), []);
  const current = queue[0];
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {current ? <Celebration key={current.matchId} result={current} onClose={close} /> : null}
    </AnimatePresence>,
    document.body,
  );
}
