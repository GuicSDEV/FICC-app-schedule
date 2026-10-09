"use client";

import type { CourtSummary, ScheduleBookingInfo, SlotSummary } from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/components/providers/session-provider";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { api, ApiError } from "@/lib/api";
import { formatDay, formatTime } from "@/lib/format";
import { haptic } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useLastDefined } from "@/lib/use-last-defined";

import { FavoriteToggle } from "./favorite-toggle";

export interface BookingInfoTarget {
  date: string;
  court: CourtSummary;
  slot: SlotSummary;
  booking: ScheduleBookingInfo;
  favorite: boolean;
  past: boolean;
}

const PLAYER_STATUS = {
  CONFIRMED: { label: "Confirmado", tone: "ballSoft" },
  PENDING: { label: "Aguardando", tone: "warning" },
  DECLINED: { label: "Recusou", tone: "danger" },
} as const;

/** A taken slot: who plays, and for the players themselves confirm / decline / cancel. */
export function BookingInfoSheet({
  target: requested,
  onOpenChange,
}: {
  target: BookingInfoTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const target = useLastDefined(requested);
  const { user } = useSession();
  const client = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const booking = target?.booking;
  const me = booking?.players.find((player) => player.user.id === user?.id);
  const detail = useQuery({
    queryKey: queryKeys.booking(booking?.id ?? ""),
    queryFn: () => api.bookings.get(booking!.id),
    enabled: Boolean(me && booking && booking.id !== "optimistic"),
  });

  const action = useMutation({
    mutationFn: (kind: "confirm" | "decline" | "cancel") => api.bookings[kind](booking!.id),
    onSuccess: (_result, kind) => {
      haptic();
      toast.success(
        kind === "confirm"
          ? "Presença confirmada"
          : kind === "decline"
            ? "Convite recusado"
            : "Reserva cancelada",
      );
      onOpenChange(false);
    },
    onError: (failure) =>
      toast.error(failure instanceof ApiError ? failure.message : "Algo deu errado."),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.schedule() });
      void client.invalidateQueries({ queryKey: queryKeys.bookingsMine });
    },
  });

  function close(open: boolean) {
    if (!open) setConfirmCancel(false);
    onOpenChange(open);
  }

  const canAnswer = me?.status === "PENDING" && booking?.status === "PENDING" && !target?.past;
  const canCancel =
    Boolean(me) && me?.status !== "DECLINED" && !target?.past && booking?.status !== "CANCELLED";

  return (
    <Sheet
      open={requested !== null}
      onOpenChange={close}
      title={me ? "Sua reserva" : "Quadra reservada"}
      footer={
        canAnswer ? (
          <div className="flex gap-2">
            <Button
              variant="dangerSoft"
              size="lg"
              className="flex-1"
              loading={action.isPending && action.variables === "decline"}
              onClick={() => action.mutate("decline")}
            >
              Recusar
            </Button>
            <Button
              size="lg"
              className="flex-1"
              loading={action.isPending && action.variables === "confirm"}
              onClick={() => action.mutate("confirm")}
            >
              Confirmar
            </Button>
          </div>
        ) : canCancel ? (
          confirmCancel ? (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={() => setConfirmCancel(false)}
              >
                Manter
              </Button>
              <Button
                variant="danger"
                size="lg"
                className="flex-1"
                loading={action.isPending}
                onClick={() => action.mutate("cancel")}
              >
                Cancelar reserva
              </Button>
            </div>
          ) : (
            <Button variant="dangerSoft" size="lg" block onClick={() => setConfirmCancel(true)}>
              Cancelar reserva
            </Button>
          )
        ) : undefined
      }
    >
      {target && booking ? (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-display text-title font-semibold">
                {target.court.name} · {formatDay(target.date)}
              </p>
              <p className="num text-small text-muted-foreground">
                {target.slot.startTime}–{target.slot.endTime} ·{" "}
                {booking.type === "SINGLES" ? "Simples" : "Duplas"}
              </p>
            </div>
            <FavoriteToggle
              courtId={target.court.id}
              timeSlotId={target.slot.id}
              favorite={target.favorite}
              compact
            />
          </div>
          {booking.status === "PENDING" ? (
            <p className="rounded-md bg-warning-soft px-3 py-2 text-small text-warning-ink">
              Aguardando confirmação
              {detail.data ? ` até ${formatTime(detail.data.expiresAt)}` : ""}. Sem resposta, o
              horário é liberado.
            </p>
          ) : null}
          {confirmCancel ? (
            <p className="rounded-md bg-danger-soft px-3 py-2 text-small text-danger-ink">
              Cancelar libera o horário para outros sócios e avisa os demais jogadores.
            </p>
          ) : null}
          <div className="space-y-2">
            <SectionLabel>Jogadores</SectionLabel>
            <ul className="space-y-1">
              {booking.players.map((player) => {
                const status = PLAYER_STATUS[player.status];
                return (
                  <li key={player.user.id} className="flex h-14 items-center gap-3">
                    <Avatar name={player.user.name} src={player.user.photoUrl} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {player.user.name}
                        {player.user.id === user?.id ? (
                          <span className="text-muted-foreground"> (você)</span>
                        ) : null}
                      </span>
                      <span className="block num text-caption text-muted-foreground">
                        Elo {player.user.elo}
                      </span>
                    </span>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
