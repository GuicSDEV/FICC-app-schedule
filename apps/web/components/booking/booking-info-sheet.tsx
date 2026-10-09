"use client";

import type { CourtSummary, ScheduleBookingInfo, SlotSummary } from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/components/providers/session-provider";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { haptic } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";
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

const PLAYER_STATUS_TONE = {
  CONFIRMED: "ballSoft",
  PENDING: "warning",
  DECLINED: "danger",
} as const;

/** A taken slot: who plays, and for the players themselves confirm / decline / cancel. */
export function BookingInfoSheet({
  target: requested,
  onOpenChange,
  staff = false,
}: {
  target: BookingInfoTarget | null;
  onOpenChange: (open: boolean) => void;
  /** Staff view (BOOKINGS_MANAGE): cancel any booking, mark no-shows of any player. */
  staff?: boolean;
}) {
  const target = useLastDefined(requested);
  const t = useTranslations();
  const format = useFormat();
  const errorMessage = useErrorMessage();
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
          ? t("bookingInfo.confirmed")
          : kind === "decline"
            ? t("bookingInfo.declined")
            : t("bookingInfo.cancelled"),
      );
      onOpenChange(false);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.schedule() });
      void client.invalidateQueries({ queryKey: queryKeys.bookingsMine });
    },
  });

  const [marked, setMarked] = useState<string[]>([]);
  const noShow = useMutation({
    mutationFn: (userId: string) => api.bookings.markNoShow(booking!.id, userId),
    onSuccess: (_result, userId) => {
      haptic(10);
      setMarked((current) => [...current, userId]);
      toast.success(t("bookingInfo.noShowMarked"));
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const staffCancel = useMutation({
    mutationFn: () => api.bookings.staffCancel(booking!.id),
    onSuccess: () => {
      haptic();
      toast.success(t("bookingInfo.cancelled"));
      onOpenChange(false);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
    onSettled: () => void client.invalidateQueries({ queryKey: queryKeys.schedule() }),
  });

  function close(open: boolean) {
    if (!open) setMarked([]);
    if (!open) setConfirmCancel(false);
    onOpenChange(open);
  }

  const canAnswer = me?.status === "PENDING" && booking?.status === "PENDING" && !target?.past;
  const canCancel =
    Boolean(me) && me?.status !== "DECLINED" && !target?.past && booking?.status !== "CANCELLED";
  /** After the slot started, a co-player (or staff) can say someone did not show up. */
  const canMarkNoShow = (playerId: string, status: string) =>
    Boolean(target?.past) &&
    status !== "DECLINED" &&
    playerId !== user?.id &&
    (staff || Boolean(me)) &&
    !marked.includes(playerId);

  return (
    <Sheet
      open={requested !== null}
      onOpenChange={close}
      title={me ? t("bookingInfo.mine") : t("bookingInfo.taken")}
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
              {t("common.decline")}
            </Button>
            <Button
              size="lg"
              className="flex-1"
              loading={action.isPending && action.variables === "confirm"}
              onClick={() => action.mutate("confirm")}
            >
              {t("common.confirm")}
            </Button>
          </div>
        ) : staff && !target?.past && booking?.status !== "CANCELLED" ? (
          confirmCancel ? (
            <Button
              variant="danger"
              size="lg"
              block
              loading={staffCancel.isPending}
              onClick={() => staffCancel.mutate()}
            >
              {t("bookingInfo.staffCancelConfirm")}
            </Button>
          ) : (
            <Button variant="dangerSoft" size="lg" block onClick={() => setConfirmCancel(true)}>
              {t("bookingInfo.staffCancel")}
            </Button>
          )
        ) : canCancel ? (
          confirmCancel ? (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={() => setConfirmCancel(false)}
              >
                {t("common.keep")}
              </Button>
              <Button
                variant="danger"
                size="lg"
                className="flex-1"
                loading={action.isPending}
                onClick={() => action.mutate("cancel")}
              >
                {t("bookingInfo.cancel")}
              </Button>
            </div>
          ) : (
            <Button variant="dangerSoft" size="lg" block onClick={() => setConfirmCancel(true)}>
              {t("bookingInfo.cancel")}
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
                {target.court.name} · {format.day(target.date)}
              </p>
              <p className="num text-small text-muted-foreground">
                {target.slot.startTime}–{target.slot.endTime} ·{" "}
                {booking.type === "SINGLES" ? t("common.singles") : t("common.doubles")}
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
              {detail.data
                ? t("bookingInfo.waitingUntil", { time: format.time(detail.data.expiresAt) })
                : t("bookingInfo.waiting")}
            </p>
          ) : null}
          {confirmCancel ? (
            <p className="rounded-md bg-danger-soft px-3 py-2 text-small text-danger-ink">
              {t("bookingInfo.cancelWarning")}
            </p>
          ) : null}
          <div className="space-y-2">
            <SectionLabel>{t("bookingInfo.players")}</SectionLabel>
            <ul className="space-y-1">
              {booking.players.map((player) => {
                return (
                  <li key={player.user.id} className="flex h-14 items-center gap-3">
                    <Avatar name={player.user.name} src={player.user.photoUrl} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {player.user.name}
                        {player.user.id === user?.id ? (
                          <span className="text-muted-foreground"> {t("common.you")}</span>
                        ) : null}
                      </span>
                      <span className="block num text-caption text-muted-foreground">
                        {t("common.elo", { elo: player.user.elo })}
                      </span>
                    </span>
                    {canMarkNoShow(player.user.id, player.status) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={noShow.isPending && noShow.variables === player.user.id}
                        onClick={() => noShow.mutate(player.user.id)}
                      >
                        {t("bookingInfo.markNoShow")}
                      </Button>
                    ) : marked.includes(player.user.id) ? (
                      <Badge tone="danger">{t("bookingInfo.noShow")}</Badge>
                    ) : (
                      <Badge tone={PLAYER_STATUS_TONE[player.status]}>
                        {t(`bookingInfo.status.${player.status}`)}
                      </Badge>
                    )}
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
