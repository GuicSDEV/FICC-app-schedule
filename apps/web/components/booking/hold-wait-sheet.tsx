"use client";

import type { CourtsResponse, SlotAlternative, SlotHoldView } from "@ficc/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Hourglass, UserRound } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { useServerCountdown } from "@/components/operations/server-countdown";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { enter, haptic, listItemVariants, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useFormat } from "@/lib/use-format";

import type { BookingTarget } from "./booking-sheet";

/** How often a waiting screen checks in (the API drops members who stop doing so). */
const CHECK_IN_MS = 15_000;

export interface HoldWait {
  target: BookingTarget;
  view: SlotHoldView;
  /** Someone booked the court while the member was waiting. */
  taken: boolean;
  alternatives: SlotAlternative[];
}

/** "1:47" */
export function formatClock(milliseconds: number): string {
  const total = Math.ceil(milliseconds / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Shown when the court a member tapped is being booked by someone else: their place in line,
 * how long the other member still has, and other free courts. When their turn comes the court
 * opens for them by itself (socket event, or the check-in when the other member's time ends).
 */
export function HoldWaitSheet({
  wait,
  onOpenChange,
  onUpdate,
  onPick,
}: {
  wait: HoldWait | null;
  onOpenChange: (open: boolean) => void;
  /** The member's hold changed (their turn came, or they lost their place). */
  onUpdate: (view: SlotHoldView | null) => void;
  /** The member picked another free court instead. */
  onPick: (target: BookingTarget) => void;
}) {
  const t = useTranslations("hold");
  const format = useFormat();
  const client = useQueryClient();
  const view = wait?.view ?? null;
  const left = useServerCountdown(view?.holderExpiresAt ?? null, view?.serverNow ?? null);

  // Stay in line: check in regularly, and right when the other member's time runs out.
  useEffect(() => {
    if (!wait || wait.taken) return;
    let active = true;
    const check = async () => {
      const current = await api.slotHolds.mine().catch(() => undefined);
      if (active && current !== undefined) onUpdate(current);
    };
    const timer = setInterval(() => void check(), CHECK_IN_MS);
    const atExpiry = view?.holderExpiresAt
      ? setTimeout(() => void check(), Math.max(1000, left + 1000))
      : undefined;
    return () => {
      active = false;
      clearInterval(timer);
      clearTimeout(atExpiry);
    };
    // Re-arm when the holder or the place in line changes, not on every countdown tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wait?.taken, view?.holderExpiresAt, view?.position]);

  function pick(option: SlotAlternative) {
    const layout = client.getQueryData<CourtsResponse>(queryKeys.courts);
    const court = layout?.courts.find((entry) => entry.id === option.courtId);
    const slot = layout?.slots.find((entry) => entry.id === option.timeSlotId);
    if (!court || !slot || !wait) return;
    haptic(10);
    onPick({ date: wait.target.date, court, slot, favorite: false });
  }

  const alternatives = wait?.taken ? wait.alternatives : (view?.alternatives ?? []);

  return (
    <Sheet
      open={wait !== null}
      onOpenChange={onOpenChange}
      title={wait?.taken ? t("takenTitle") : t("waitTitle")}
      footer={
        <Button block size="lg" variant="secondary" onClick={() => onOpenChange(false)}>
          {wait?.taken ? t("close") : t("leave")}
        </Button>
      }
    >
      {wait ? (
        <div className="space-y-5">
          <div className="flex items-center gap-4 rounded-lg border border-warning/50 bg-warning-soft p-4 text-warning-ink">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-background/40">
              {wait.taken ? <UserRound className="size-6" /> : <Hourglass className="size-6" />}
            </span>
            <div className="min-w-0 space-y-0.5">
              <p className="font-semibold">
                {wait.target.court.name} · <span className="num">{wait.target.slot.startTime}</span>
              </p>
              <p className="text-small">{format.longDayTitle(wait.target.date)}</p>
            </div>
          </div>

          {wait.taken ? (
            <p className="text-body">{t("takenBody")}</p>
          ) : (
            <div className="space-y-3">
              <p className="text-body">{t("waitBody")}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-surface-2 p-3 text-center">
                  <p className="text-caption text-muted-foreground">{t("position")}</p>
                  <p className="num font-display text-headline font-semibold">
                    {t("positionValue", { position: view?.position ?? 1 })}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-2 p-3 text-center">
                  <p className="text-caption text-muted-foreground">{t("timeLeft")}</p>
                  <p className="num font-display text-headline font-semibold" aria-live="off">
                    {formatClock(left)}
                  </p>
                </div>
              </div>
              <p className="text-small text-muted-foreground">{t("waitHint")}</p>
            </div>
          )}

          {alternatives.length > 0 ? (
            <section className="space-y-2" aria-label={t("orPick")}>
              <p className="text-small font-medium">{t("orPick")}</p>
              <ul className="grid grid-cols-2 gap-2">
                {alternatives.map((option, index) => (
                  <motion.li
                    key={`${option.courtId}-${option.timeSlotId}`}
                    custom={index}
                    variants={listItemVariants}
                    initial={enter("hidden")}
                    animate="show"
                  >
                    <motion.button
                      type="button"
                      whileTap={tap}
                      onClick={() => pick(option)}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-md border border-primary/50 bg-ball-soft text-small font-semibold text-ball-ink"
                    >
                      {option.courtName} · <span className="num">{option.startTime}</span>
                    </motion.button>
                  </motion.li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
