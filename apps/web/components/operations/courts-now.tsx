"use client";

import type { CourtNow, CourtsNow, PlayerSummary } from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CloudRain, GraduationCap, LogOut, Timer, Trophy, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { MemberPicker } from "@/components/members/member-picker";
import { useSession } from "@/components/providers/session-provider";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { Button, ButtonLink } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { enter, haptic, listItemVariants, popVariants, sheetVariants, spring } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";
import { useLastDefined } from "@/lib/use-last-defined";
import { cn } from "@/lib/utils";

import { CountdownDigits, useServerCountdown } from "./server-countdown";

const STATE_STYLE: Record<CourtNow["state"], string> = {
  free: "border-primary/60 bg-ball-soft",
  in_use: "border-border bg-card",
  offered: "border-warning/50 bg-warning-soft",
  blocked: "border-border bg-surface-2 striped",
  closed: "border-border bg-surface-2 striped opacity-70",
};

function CourtCard({
  court,
  data,
  onCheckIn,
  onEnd,
}: {
  court: CourtNow;
  data: CourtsNow;
  onCheckIn: (court: CourtNow) => void;
  /** Staff end any check-in. */
  onEnd?: (checkInId: string) => void;
}) {
  const t = useTranslations("courtsNow");
  const format = useFormat();
  const mineOffer =
    data.queue.me?.status === "OFFERED" && data.queue.me.offeredCourtId === court.court.id;
  const canTake = court.state === "free" || mineOffer;
  const surface = court.court.surface === "HARTRU" ? "bg-hartru" : "bg-saibro";
  return (
    <motion.div
      layout
      transition={spring.gentle}
      className={cn(
        "flex min-h-36 flex-col gap-3 rounded-lg border p-4 shadow-card",
        STATE_STYLE[court.state],
        mineOffer && "ring-2 ring-primary",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-md font-display text-title font-bold text-white",
            surface,
          )}
        >
          {court.court.name}
        </span>
        <span className="text-small font-semibold">{t(`state.${court.state}`)}</span>
      </div>
      <div className="flex-1 text-small text-muted-foreground">
        {court.state === "in_use" && court.checkIn ? (
          <div className="space-y-1">
            <AvatarStack people={court.checkIn.players} size="sm" />
            <p>{t("until", { time: format.time(court.checkIn.endsAt) })}</p>
          </div>
        ) : court.state === "blocked" ? (
          <p className="inline-flex items-center gap-1.5">
            {court.blockedBy === "lesson" ? (
              <GraduationCap className="size-4" />
            ) : court.blockedBy === "tournament" ? (
              <Trophy className="size-4" />
            ) : (
              <CloudRain className="size-4" />
            )}
            {t(`blocked.${court.blockedBy ?? "frozen"}`)}
          </p>
        ) : court.state === "offered" && court.offeredUntil ? (
          <p>
            {mineOffer
              ? t("yoursUntil", { time: format.time(court.offeredUntil) })
              : t("heldUntil", { time: format.time(court.offeredUntil) })}
          </p>
        ) : court.state === "free" ? (
          <p>{t("freeHint")}</p>
        ) : null}
      </div>
      {canTake && data.mode === "FREE_PLAY" && !data.myCheckIn && !onEnd ? (
        <Button size="sm" onClick={() => onCheckIn(court)}>
          {t("checkIn")}
        </Button>
      ) : null}
      {onEnd && court.checkIn ? (
        <Button size="sm" variant="secondary" onClick={() => onEnd(court.checkIn!.id)}>
          {t("end")}
        </Button>
      ) : null}
    </motion.div>
  );
}

function CheckInSheet({
  court: requested,
  onOpenChange,
}: {
  court: CourtNow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("courtsNow");
  const { user } = useSession();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const court = useLastDefined(requested);
  const [partners, setPartners] = useState<PlayerSummary[]>([]);
  const mutation = useMutation({
    mutationFn: () =>
      api.freePlay.checkIn({
        courtId: court!.court.id,
        partnerIds: partners.map((player) => player.id),
      }),
    onSuccess: () => {
      haptic([12, 40, 12]);
      toast.success(t("checkedIn", { court: court!.court.name }));
      setPartners([]);
      void client.invalidateQueries({ queryKey: queryKeys.freePlay });
      onOpenChange(false);
    },
    onError: (failure) => {
      toast.error(errorMessage(failure));
      void client.invalidateQueries({ queryKey: queryKeys.freePlay });
    },
  });
  return (
    <Sheet
      open={requested !== null}
      onOpenChange={onOpenChange}
      title={t("checkInTitle", { court: court?.court.name ?? "" })}
      description={t("checkInDescription")}
      footer={
        <Button size="lg" block loading={mutation.isPending} onClick={() => mutation.mutate()}>
          {t("checkInConfirm")}
        </Button>
      }
    >
      <MemberPicker
        label={t("partners")}
        selected={partners}
        onChange={setPartners}
        max={3}
        excludeIds={user ? [user.id] : []}
      />
    </Sheet>
  );
}

/**
 * Live free-play screen: which courts are free, in use, held for the queue or blocked, the
 * member's own check-in (with the automatic check-out time) and the digital queue.
 */
export function CourtsNowView({ staff = false }: { staff?: boolean }) {
  const t = useTranslations("courtsNow");
  const format = useFormat();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const [checkInCourt, setCheckInCourt] = useState<CourtNow | null>(null);
  const now = useQuery({
    queryKey: queryKeys.freePlay,
    queryFn: api.freePlay.now,
    refetchInterval: 30_000,
  });
  const data = now.data;
  const refresh = () => void client.invalidateQueries({ queryKey: queryKeys.freePlay });
  const action = <T,>(fn: () => Promise<T>, success: string) =>
    ({
      mutationFn: fn,
      onSuccess: () => {
        haptic(10);
        toast.success(success);
        refresh();
      },
      onError: (failure: unknown) => {
        toast.error(errorMessage(failure));
        refresh();
      },
    }) as const;
  const checkOut = useMutation(
    action(() => api.freePlay.checkOut(data!.myCheckIn!.id), t("checkedOut")),
  );
  const join = useMutation(action(() => api.freePlay.join(), t("joined")));
  const leave = useMutation(action(() => api.freePlay.leave(), t("left")));
  const endCheckIn = useMutation({
    mutationFn: (id: string) => api.freePlay.checkOut(id),
    onSuccess: () => {
      toast.success(t("ended"));
      refresh();
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const me = data?.queue.me ?? null;
  const offerLeft = useServerCountdown(
    me?.status === "OFFERED" ? me.offerExpiresAt : null,
    data?.serverNow ?? null,
  );
  const sessionLeft = useServerCountdown(data?.myCheckIn?.endsAt ?? null, data?.serverNow ?? null);

  if (now.isError) return <ErrorState onRetry={() => void now.refetch()} />;
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((key) => (
          <Skeleton key={key} className="h-36 rounded-lg" />
        ))}
      </div>
    );
  }
  if (data.mode !== "FREE_PLAY") {
    return (
      <EmptyState
        icon={CalendarDays}
        title={t("bookingDayTitle")}
        description={t("bookingDayDescription")}
        action={staff ? null : <ButtonLink href="/app/courts">{t("toCalendar")}</ButtonLink>}
      />
    );
  }
  const offeredCourt =
    me?.status === "OFFERED"
      ? data.courts.find((court) => court.court.id === me.offeredCourtId)
      : undefined;
  const anyFree = data.courts.some((court) => court.state === "free");
  const myCourt = data.myCheckIn
    ? data.courts.find((court) => court.court.id === data.myCheckIn!.courtId)
    : undefined;

  return (
    <div className="space-y-6">
      {!staff ? (
        <AnimatePresence mode="popLayout" initial={false}>
          {data.myCheckIn ? (
            <motion.section
              key="mine"
              variants={sheetVariants}
              initial={enter("hidden")}
              animate="show"
              exit="exit"
              className="flex items-center gap-4 rounded-xl border border-primary/50 bg-ball-soft p-4 shadow-card"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-small font-semibold text-ball-ink">
                  {t("onCourt", { court: myCourt?.court.name ?? "" })}
                </p>
                <p className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
                  <Timer className="size-3.5" />
                  {t("autoCheckout")} <CountdownDigits milliseconds={sessionLeft} className="num" />
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                loading={checkOut.isPending}
                onClick={() => checkOut.mutate()}
              >
                <LogOut />
                {t("checkOut")}
              </Button>
            </motion.section>
          ) : offeredCourt ? (
            <motion.section
              key="offer"
              variants={popVariants}
              initial={enter("hidden")}
              animate="show"
              exit="exit"
              className="space-y-3 rounded-xl border-2 border-primary bg-ball-soft p-5 text-center shadow-glow"
            >
              <p className="font-display text-title font-semibold">
                {t("offerTitle", { court: offeredCourt.court.name })}
              </p>
              <CountdownDigits
                milliseconds={offerLeft}
                className="num font-display text-display font-bold"
              />
              <p className="text-small text-muted-foreground">{t("offerHint")}</p>
              <div className="flex justify-center gap-2">
                <Button onClick={() => setCheckInCourt(offeredCourt)}>{t("claim")}</Button>
                <Button variant="ghost" loading={leave.isPending} onClick={() => leave.mutate()}>
                  {t("leave")}
                </Button>
              </div>
            </motion.section>
          ) : me?.status === "WAITING" ? (
            <motion.section
              key="waiting"
              variants={sheetVariants}
              initial={enter("hidden")}
              animate="show"
              exit="exit"
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-card"
            >
              <motion.span
                key={me.position}
                variants={popVariants}
                initial={enter("hidden")}
                animate="show"
                className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary font-display text-headline font-bold text-primary-foreground"
              >
                {me.position}
              </motion.span>
              <div className="min-w-0 flex-1">
                <p className="text-small font-semibold">
                  {t("inLine", { position: me.position ?? 0 })}
                </p>
                <p className="text-caption text-muted-foreground">{t("inLineHint")}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                loading={leave.isPending}
                onClick={() => leave.mutate()}
              >
                {t("leave")}
              </Button>
            </motion.section>
          ) : !anyFree && data.queue.enabled ? (
            <motion.section
              key="join"
              variants={sheetVariants}
              initial={enter("hidden")}
              animate="show"
              exit="exit"
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-card"
            >
              <Users className="size-6 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-small font-semibold">{t("allBusy")}</p>
                <p className="text-caption text-muted-foreground">
                  {t("waitingCount", { count: data.queue.waiting })}
                </p>
              </div>
              <Button size="sm" loading={join.isPending} onClick={() => join.mutate()}>
                {t("join")}
              </Button>
            </motion.section>
          ) : null}
        </AnimatePresence>
      ) : (
        <p className="text-small text-muted-foreground">
          {t("staffHint", { count: data.queue.waiting })}
        </p>
      )}

      <section className="space-y-3">
        <SectionLabel>{t("courts", { time: format.time(data.serverNow) })}</SectionLabel>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {data.courts.map((court, index) => (
            <motion.li
              key={court.court.id}
              custom={index}
              variants={listItemVariants}
              initial={enter("hidden")}
              animate="show"
            >
              <CourtCard
                court={court}
                data={data}
                onCheckIn={setCheckInCourt}
                onEnd={staff ? (id) => endCheckIn.mutate(id) : undefined}
              />
            </motion.li>
          ))}
        </ul>
      </section>
      {!staff ? (
        <CheckInSheet
          court={checkInCourt}
          onOpenChange={(open) => !open && setCheckInCourt(null)}
        />
      ) : null}
    </div>
  );
}
