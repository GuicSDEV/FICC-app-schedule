"use client";

import type { BookingDetail } from "@ficc/shared";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";

import { duration, ease, spring, transitions } from "@/lib/motion";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";

import { TicketCard } from "./ticket-card";

/** A check mark that draws itself (circle, then tick) in the court's surface color. */
export function DrawnCheck({
  surface,
  className,
}: {
  surface: "HARTRU" | "SAIBRO";
  className?: string;
}) {
  return (
    <motion.span
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={spring.snappy}
      className={cn(
        "relative flex size-24 items-center justify-center rounded-full",
        surface === "HARTRU" ? "bg-hartru-soft text-hartru" : "bg-saibro-soft text-saibro",
        className,
      )}
    >
      <svg viewBox="0 0 52 52" aria-hidden className="size-full">
        <motion.circle
          cx="26"
          cy="26"
          r="23"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          initial={{ pathLength: 0, rotate: -90 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: duration.slow, ease: ease.out }}
          style={{ originX: "50%", originY: "50%" }}
        />
        <motion.path
          d="M15 27 l7 7 l15 -16"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: duration.slow, ease: ease.out, delay: duration.slow * 0.8 }}
        />
      </svg>
    </motion.span>
  );
}

/** Second step of the booking sheet: drawn check, headline and the ticket sliding up. */
export function BookingConfirmed({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("booking");
  const format = useFormat();
  const others = booking.players.filter((player) => player.status === "PENDING").length;
  return (
    <div className="flex flex-col items-center gap-5 pt-2 pb-2 text-center">
      <DrawnCheck surface={booking.court.surface} />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...transitions.base, delay: duration.slow }}
        className="space-y-1"
      >
        <p className="font-display text-headline font-semibold">{t("confirmedTitle")}</p>
        <p className="text-small text-muted-foreground">
          {others > 0
            ? t("confirmedWaiting", { count: others, deadline: format.time(booking.expiresAt) })
            : t("confirmedAll")}
        </p>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0, transition: { ...spring.gentle, delay: duration.slow * 1.6 } }}
        className="w-full text-left"
      >
        <TicketCard booking={booking} />
      </motion.div>
    </div>
  );
}
