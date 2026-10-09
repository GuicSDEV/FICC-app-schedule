"use client";

import {
  type BookingDetail,
  type BookingType,
  type CourtSummary,
  createBookingSchema,
  OTHER_PLAYERS_BY_TYPE,
  type PlayerSummary,
  type SlotSummary,
  SURFACE_LABELS,
} from "@ficc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MemberPicker } from "@/components/members/member-picker";
import { useSession } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { api, ApiError } from "@/lib/api";
import { formatLongDayTitle } from "@/lib/format";
import { fadeVariants, haptic } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { patchScheduleCells } from "@/lib/schedule-cache";
import { useLastDefined } from "@/lib/use-last-defined";
import { cn } from "@/lib/utils";

import { BookingConfirmed } from "./booking-confirmed";
import { FavoriteToggle } from "./favorite-toggle";

export interface BookingTarget {
  date: string;
  court: CourtSummary;
  slot: SlotSummary;
  favorite: boolean;
}

const TYPE_OPTIONS = [
  { value: "SINGLES", label: "Simples" },
  { value: "DOUBLES", label: "Duplas" },
] as const;

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
  const { user } = useSession();
  const client = useQueryClient();
  const [type, setType] = useState<BookingType>("SINGLES");
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<BookingDetail | null>(null);
  const open = requested !== null;
  const target = useLastDefined(requested);

  // Fresh form every time the sheet opens on a slot.
  useEffect(() => {
    if (requested) {
      setType("SINGLES");
      setPlayers([]);
      setError(null);
      setBooked(null);
    }
  }, [requested]);

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
      const message = failure instanceof ApiError ? failure.message : "Não foi possível reservar.";
      setError(message);
      toast.error(message);
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
      setError(parsed.error.issues[0]?.message ?? "Confira os jogadores.");
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
      onOpenChange={onOpenChange}
      title={booked ? "Tudo certo" : "Reservar quadra"}
      footer={
        booked ? (
          <Button block size="lg" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        ) : (
          <Button block size="lg" loading={mutation.isPending} onClick={submit} disabled={!target}>
            {players.length < needed
              ? `Escolha ${needed - players.length} ${needed - players.length === 1 ? "jogador" : "jogadores"}`
              : `Reservar ${target?.court.name ?? ""} · ${target?.slot.startTime ?? ""}`}
          </Button>
        )
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {booked ? (
          <motion.div
            key="done"
            variants={fadeVariants}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            <BookingConfirmed booking={booked} />
          </motion.div>
        ) : target ? (
          <motion.div
            key="form"
            variants={fadeVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            className="space-y-6"
          >
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
                  {SURFACE_LABELS[surface]}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="leading-snug font-medium">{formatLongDayTitle(target.date)}</p>
                <p className="num text-small text-muted-foreground">
                  {target.slot.startTime}–{target.slot.endTime} · {target.slot.durationMinutes} min
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
              label="Tipo de jogo"
              options={TYPE_OPTIONS}
              value={type}
              onChange={changeType}
            />

            <MemberPicker
              label={type === "SINGLES" ? "Adversário" : "Parceiro e adversários"}
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
              <p className="-mt-3 text-small text-muted-foreground">
                O primeiro escolhido joga com você; os outros dois formam a dupla adversária.
              </p>
            ) : null}
            <FieldError>{error}</FieldError>
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
