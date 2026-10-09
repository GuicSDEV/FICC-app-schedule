"use client";

import {
  type BookingDetail,
  type BookingType,
  type CourtSummary,
  type CourtsResponse,
  createBookingSchema,
  OTHER_PLAYERS_BY_TYPE,
  type PlayerSummary,
  type SlotAlternative,
  type SlotSummary,
} from "@ficc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Timer } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MemberPicker } from "@/components/members/member-picker";
import { useServerCountdown } from "@/components/operations/server-countdown";
import { useSession } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { api, ApiError } from "@/lib/api";
import { enter, fadeVariants, haptic, listItemVariants, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { patchScheduleCells } from "@/lib/schedule-cache";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";
import { useIssueMessage } from "@/lib/use-issue-message";
import { useLastDefined } from "@/lib/use-last-defined";
import { cn } from "@/lib/utils";

import { BookingConfirmed } from "./booking-confirmed";
import { formatClock } from "./hold-wait-sheet";
import { FavoriteToggle } from "./favorite-toggle";

export interface BookingTarget {
  date: string;
  court: CourtSummary;
  slot: SlotSummary;
  favorite: boolean;
  /** The court is kept for the member until `expiresAt` (server clock) while they book it. */
  hold?: { expiresAt: string; serverNow: string };
}

/**
 * Bottom sheet to book a free slot. The calendar updates optimistically while the request runs;
 * on success the sheet turns into the "booking confirmed" moment and `onBooked` lets the
 * calendar play the surface-color fill on the cell.
 */
export function BookingSheet({
  target: requested,
  onOpenChange,
  onBooked,
}: {
  target: BookingTarget | null;
  onOpenChange: (open: boolean) => void;
  onBooked: (booking: BookingDetail) => void;
}) {
  const t = useTranslations();
  const format = useFormat();
  const issueMessage = useIssueMessage();
  const errorMessage = useErrorMessage();
  const typeOptions = [
    { value: "SINGLES", label: t("common.singles") },
    { value: "DOUBLES", label: t("common.doubles") },
  ] as const;
  const { user } = useSession();
  const client = useQueryClient();
  const [type, setType] = useState<BookingType>("SINGLES");
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<BookingDetail | null>(null);
  const [alternatives, setAlternatives] = useState<SlotAlternative[]>([]);
  /** The member picked one of the free options offered after "just taken". */
  const [moved, setMoved] = useState<BookingTarget | null>(null);
  const open = requested !== null;
  const lastRequested = useLastDefined(requested);
  const target = moved ?? lastRequested;
  const holdLeft = useServerCountdown(
    open && !booked ? (target?.hold?.expiresAt ?? null) : null,
    target?.hold?.serverNow ?? null,
  );
  const [switching, setSwitching] = useState(false);

  // Fresh form every time the sheet opens on a slot.
  useEffect(() => {
    if (requested) {
      setType("SINGLES");
      setPlayers([]);
      setError(null);
      setBooked(null);
      setAlternatives([]);
      setMoved(null);
    }
  }, [requested]);

  async function pickAlternative(option: SlotAlternative) {
    const layout = client.getQueryData<CourtsResponse>(queryKeys.courts);
    const court = layout?.courts.find((entry) => entry.id === option.courtId);
    const slot = layout?.slots.find((entry) => entry.id === option.timeSlotId);
    if (!court || !slot || !target) return;
    haptic(10);
    // Keep the new court first (this gives the previous one back), then book it.
    setSwitching(true);
    try {
      const view = await api.slotHolds.claim({
        courtId: court.id,
        timeSlotId: slot.id,
        date: target.date,
      });
      if (view.status !== "HOLDING" || !view.expiresAt) {
        toast(t("hold.alternativeBusy"));
        return;
      }
      setMoved({
        date: target.date,
        court,
        slot,
        favorite: false,
        hold: { expiresAt: view.expiresAt, serverNow: view.serverNow },
      });
      setAlternatives([]);
      setError(null);
    } catch (failure) {
      toast.error(errorMessage(failure));
    } finally {
      setSwitching(false);
    }
  }

  /** Closing without booking gives the court back, so the next member in line gets it at once. */
  function close(nextOpen: boolean) {
    if (!nextOpen && !booked && target?.hold) void api.slotHolds.release().catch(() => undefined);
    onOpenChange(nextOpen);
  }

  const mutation = useMutation({
    mutationFn: (input: { type: BookingType; players: PlayerSummary[] }) =>
      api.bookings.create({
        courtId: target!.court.id,
        timeSlotId: target!.slot.id,
        date: target!.date,
        type: input.type,
        playerIds: input.players.map((player) => player.id),
      }),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: queryKeys.schedule(target!.date) });
      const me = user ? [{ user: toPlayer(user), status: "CONFIRMED" as const }] : [];
      return patchScheduleCells(
        client,
        (cell) =>
          cell.date === target!.date &&
          cell.courtId === target!.court.id &&
          cell.timeSlotId === target!.slot.id,
        (cell) => ({
          ...cell,
          state: "booking",
          booking: {
            id: "optimistic",
            type: input.type,
            status: "PENDING",
            players: [
              ...me,
              ...input.players.map((player) => ({ user: player, status: "PENDING" as const })),
            ],
          },
        }),
      );
    },
    onError: (failure, _input, rollback) => {
      rollback?.();
      const message = errorMessage(failure, t("booking.failed"));
      setError(message);
      toast.error(message);
      const details =
        failure instanceof ApiError
          ? (failure.details as { alternatives?: SlotAlternative[] } | undefined)
          : undefined;
      setAlternatives(
        failure instanceof ApiError && failure.code === "SLOT_TAKEN"
          ? (details?.alternatives ?? [])
          : [],
      );
    },
    onSuccess: (booking) => {
      haptic([12, 40, 12]);
      setBooked(booking);
      onBooked(booking);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.schedule() });
      void client.invalidateQueries({ queryKey: queryKeys.bookingsMine });
    },
  });

  function changeType(next: BookingType) {
    setType(next);
    setPlayers((current) => current.slice(0, OTHER_PLAYERS_BY_TYPE[next]));
    setError(null);
  }

  function submit() {
    if (!target) return;
    const parsed = createBookingSchema.safeParse({
      courtId: target.court.id,
      timeSlotId: target.slot.id,
      date: target.date,
      type,
      playerIds: players.map((player) => player.id),
    });
    if (!parsed.success) {
      setError(issueMessage(parsed.error.issues[0]));
      return;
    }
    setError(null);
    mutation.mutate({ type, players });
  }

  const needed = OTHER_PLAYERS_BY_TYPE[type];
  const surface = target?.court.surface ?? "HARTRU";

  return (
    <Sheet
      open={open}
      onOpenChange={close}
      title={booked ? t("booking.doneTitle") : t("booking.title")}
      footer={
        booked ? (
          <Button block size="lg" onClick={() => close(false)}>
            {t("common.close")}
          </Button>
        ) : (
          <Button
            block
            size="lg"
            loading={mutation.isPending || switching}
            onClick={submit}
            disabled={!target}
          >
            {players.length < needed
              ? t("booking.choosePlayers", { count: needed - players.length })
              : t("booking.submit", {
                  court: target?.court.name ?? "",
                  time: target?.slot.startTime ?? "",
                })}
          </Button>
        )
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {booked ? (
          <motion.div
            key="done"
            variants={fadeVariants}
            initial={enter("hidden")}
            animate="show"
            exit="exit"
          >
            <BookingConfirmed booking={booked} />
          </motion.div>
        ) : target ? (
          <motion.div
            key="form"
            variants={fadeVariants}
            initial={enter("hidden")}
            animate="show"
            exit="exit"
            className="space-y-6"
          >
            {target.hold ? (
              <div
                role="status"
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 text-small",
                  holdLeft > 0
                    ? "border-primary/40 bg-ball-soft text-ball-ink"
                    : "border-warning/50 bg-warning-soft text-warning-ink",
                )}
              >
                <Timer aria-hidden className="size-5 shrink-0" />
                <p className="min-w-0 flex-1 font-medium">
                  {holdLeft > 0 ? t("hold.keptForYou") : t("hold.timeUp")}
                </p>
                {holdLeft > 0 ? (
                  <span className="num font-display text-title font-semibold" aria-hidden>
                    {formatClock(holdLeft)}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-3">
              <span
                className={cn(
                  "flex size-14 shrink-0 flex-col items-center justify-center rounded-md text-white",
                  surface === "HARTRU" ? "bg-hartru" : "bg-saibro",
                )}
              >
                <span className="font-display text-title leading-none font-bold">
                  {target.court.name}
                </span>
                <span className="text-[0.625rem] font-medium tracking-wide uppercase opacity-90">
                  {t(`labels.surface.${surface}`)}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="leading-snug font-medium">{format.longDayTitle(target.date)}</p>
                <p className="num text-small text-muted-foreground">
                  {target.slot.startTime}–{target.slot.endTime} ·{" "}
                  {t("common.minutes", { count: target.slot.durationMinutes })}
                </p>
              </div>
              <FavoriteToggle
                courtId={target.court.id}
                timeSlotId={target.slot.id}
                favorite={target.favorite}
                compact
              />
            </div>

            <SegmentedControl
              label={t("booking.typeLabel")}
              options={typeOptions}
              value={type}
              onChange={changeType}
            />

            <MemberPicker
              label={type === "SINGLES" ? t("booking.opponent") : t("booking.partners")}
              selected={players}
              onChange={(next) => {
                setPlayers(next);
                setError(null);
              }}
              max={needed}
              excludeIds={user ? [user.id] : []}
              invalid={Boolean(error)}
            />
            {type === "DOUBLES" ? (
              <p className="-mt-3 text-small text-muted-foreground">{t("booking.doublesHint")}</p>
            ) : null}
            <FieldError>{error}</FieldError>
            {alternatives.length > 0 ? (
              <section className="space-y-2" aria-label={t("booking.alternatives")}>
                <p className="text-small font-medium">{t("booking.alternatives")}</p>
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
                        onClick={() => void pickAlternative(option)}
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-md border border-primary/50 bg-ball-soft text-small font-semibold text-ball-ink"
                      >
                        {option.courtName} · <span className="num">{option.startTime}</span>
                      </motion.button>
                    </motion.li>
                  ))}
                </ul>
              </section>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Sheet>
  );
}

function toPlayer(user: NonNullable<ReturnType<typeof useSession>["user"]>): PlayerSummary {
  return {
    id: user.id,
    name: user.name,
    membershipId: user.membershipId,
    photoUrl: user.photoUrl,
    elo: user.elo,
    categories: user.categories,
  };
}
