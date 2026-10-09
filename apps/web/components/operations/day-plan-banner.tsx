"use client";

import type { DayPlanInfo } from "@ficc/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, Clock, Footprints, Info } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { ButtonLink } from "@/components/ui/button";
import { haptic, sheetVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useFormat } from "@/lib/use-format";

import { CountdownDigits, useServerCountdown } from "./server-countdown";

/**
 * What kind of day the calendar shows: closed, free play (no bookings) or bookings not open yet
 * with a live countdown by the server's clock. When the countdown ends the grid refetches.
 */
export function DayPlanBanner({
  date,
  plan,
  isToday,
}: {
  date: string;
  plan: DayPlanInfo;
  isToday: boolean;
}) {
  const t = useTranslations("dayPlan");
  const format = useFormat();
  const client = useQueryClient();
  const waiting =
    !plan.closed &&
    plan.mode === "BOOKING" &&
    plan.inWindow &&
    !plan.bookingOpen &&
    plan.opensAt !== null;
  const left = useServerCountdown(waiting ? plan.opensAt : null, plan.serverNow);
  const fired = useRef(false);

  useEffect(() => {
    fired.current = false;
  }, [date, plan.opensAt]);
  useEffect(() => {
    if (!waiting || left > 0 || fired.current) return;
    fired.current = true;
    haptic([10, 30, 10]);
    void client.invalidateQueries({ queryKey: queryKeys.schedule(date) });
  }, [waiting, left, client, date]);

  if (plan.closed) {
    return (
      <Banner icon={Ban} tone="muted" title={t("closedTitle")}>
        {plan.note ?? t("closedBody")}
      </Banner>
    );
  }
  if (plan.mode === "FREE_PLAY") {
    return (
      <Banner
        icon={Footprints}
        tone="ball"
        title={t("freePlayTitle")}
        action={
          isToday ? (
            <ButtonLink href="/app/courts-now" size="sm">
              {t("courtsNow")}
            </ButtonLink>
          ) : null
        }
      >
        {t("freePlayBody")}
        {plan.note ? ` ${plan.note}` : ""}
      </Banner>
    );
  }
  if (waiting) {
    return (
      <Banner
        icon={Clock}
        tone="ball"
        title={t("opensTitle", { when: format.dateTime(plan.opensAt!) })}
      >
        <span className="sr-only">{t("opensSr", { when: format.dateTime(plan.opensAt!) })}</span>
        <CountdownDigits
          milliseconds={left}
          className="num font-display text-headline font-semibold"
        />
        <span className="block text-caption text-muted-foreground">{t("serverTime")}</span>
      </Banner>
    );
  }
  if (plan.note || plan.closedCourtIds.length > 0) {
    return (
      <Banner icon={Info} tone="muted" title={t("noteTitle")}>
        {plan.note ?? t("someCourtsClosed")}
      </Banner>
    );
  }
  return null;
}

function Banner({
  icon: Icon,
  tone,
  title,
  children,
  action,
}: {
  icon: typeof Info;
  tone: "ball" | "muted";
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      variants={sheetVariants}
      initial="hidden"
      animate="show"
      role="status"
      className={
        tone === "ball"
          ? "flex items-start gap-3 rounded-lg border border-primary/40 bg-ball-soft p-4"
          : "flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-4"
      }
    >
      <Icon
        className={
          tone === "ball"
            ? "mt-0.5 size-5 shrink-0 text-ball-ink"
            : "mt-0.5 size-5 shrink-0 text-muted-foreground"
        }
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-small font-semibold">{title}</p>
        <div className="text-small text-muted-foreground">{children}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </motion.div>
  );
}
