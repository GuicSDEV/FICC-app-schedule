"use client";

import type { NotificationItem, NotificationPayloads } from "@ficc/shared";
import confetti from "canvas-confetti";
import { Trophy } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useSocketEvent } from "@/components/providers/socket-provider";
import { Button } from "@/components/ui/button";
import { CourtLines } from "@/components/ui/court-lines";
import { duration, haptic, spring, transitions } from "@/lib/motion";

type Title = NotificationPayloads["TOURNAMENT_CHAMPION"] & { key: string };

/** Gold and the club palette. */
const CONFETTI_COLORS = ["#E7B43A", "#F5D67B", "#D7F24A", "#F7F6F2", "#D2603A"];

function shower() {
  const base = { colors: CONFETTI_COLORS, disableForReducedMotion: true, zIndex: 70 };
  void confetti({
    ...base,
    particleCount: 120,
    spread: 100,
    startVelocity: 48,
    origin: { y: 0.35 },
  });
  setTimeout(() => {
    void confetti({ ...base, particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } });
    void confetti({ ...base, particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } });
  }, duration.slow * 1000);
  setTimeout(() => {
    void confetti({
      ...base,
      particleCount: 80,
      spread: 140,
      startVelocity: 30,
      origin: { y: 0.2 },
    });
  }, duration.slow * 2600);
}

function ChampionScreen({ title, onClose }: { title: Title; onClose: () => void }) {
  const t = useTranslations("tournaments.championScreen");
  const router = useRouter();
  const reduce = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    haptic([20, 60, 20, 60, 40]);
    const timer = setTimeout(() => !reduce && shower(), reduce ? 0 : duration.slow * 1000);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [reduce, onClose]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={transitions.base}
      className="grain fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-background/95 px-6 pt-safe pb-safe text-center backdrop-blur-md"
    >
      <CourtLines className="opacity-[0.06]" />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 left-1/2 size-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/25 blur-3xl"
      />
      <motion.div
        initial={reduce ? false : { scale: 0.3, rotate: -18, opacity: 0, y: 40 }}
        animate={{ scale: 1, rotate: 0, opacity: 1, y: 0 }}
        transition={{ ...spring.gentle, delay: duration.fast }}
        className="relative flex size-36 items-center justify-center rounded-full border border-gold/50 bg-card shadow-raised"
      >
        <motion.span
          animate={reduce ? undefined : { rotate: [0, -6, 6, -3, 0] }}
          transition={{ duration: duration.slow * 2, delay: duration.slow * 1.4 }}
        >
          <Trophy className="size-20 text-gold" aria-hidden />
        </motion.span>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...transitions.slow, delay: duration.slow }}
        className="relative mt-8 space-y-2"
      >
        <p className="text-caption font-medium tracking-[0.12em] text-gold uppercase">
          {t("title")}
        </p>
        <p className="font-display text-display font-bold">{title.categoryName}</p>
        <p className="text-small text-muted-foreground">{title.tournamentName}</p>
        {title.score ? <p className="num text-title font-semibold">{title.score}</p> : null}
      </motion.div>
      <div className="relative mt-10 flex w-full max-w-xs flex-col gap-2">
        <Button
          size="lg"
          block
          onClick={() => {
            onClose();
            router.push(`/app/tournaments/${title.tournamentId}?tab=draw`);
          }}
        >
          {t("seeDraw")}
        </Button>
        <Button ref={closeRef} size="lg" variant="ghost" block onClick={onClose}>
          {t("close")}
        </Button>
      </div>
    </motion.div>
  );
}

/** Champion screen (trophy + confetti) when the member wins a tournament category. */
export function ChampionCelebration() {
  const [queue, setQueue] = useState<Title[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useSocketEvent("notification.created", (notification: NotificationItem) => {
    if (notification.type !== "TOURNAMENT_CHAMPION") return;
    setQueue((current) =>
      current.some((entry) => entry.key === notification.id)
        ? current
        : [...current, { ...notification.payload, key: notification.id }],
    );
  });

  const close = useCallback(() => setQueue((current) => current.slice(1)), []);
  const current = queue[0];
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {current ? <ChampionScreen key={current.key} title={current} onClose={close} /> : null}
    </AnimatePresence>,
    document.body,
  );
}
