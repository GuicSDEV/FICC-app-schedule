"use client";

import type { BookingDetail } from "@ficc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Hourglass } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";

import { TicketCard } from "@/components/booking/ticket-card";
import { SwipeCard } from "@/components/ui/swipe-card";
import { api, ApiError } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";

/** Pending invitations: swipe right to confirm, left to decline (buttons do the same). */
export function InviteList({ invites }: { invites: BookingDetail[] }) {
  const client = useQueryClient();
  const answer = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      accept ? api.bookings.confirm(id) : api.bookings.decline(id),
    onSuccess: (booking, { accept }) => {
      // Drop the card at once; the refetch fills in the confirmed booking.
      client.setQueryData(
        queryKeys.bookingsMine,
        (current: { invites: BookingDetail[] } | undefined) =>
          current
            ? { ...current, invites: current.invites.filter((invite) => invite.id !== booking.id) }
            : current,
      );
      toast.success(accept ? "Presença confirmada" : "Convite recusado", {
        description: accept
          ? booking.status === "CONFIRMED"
            ? "Todos confirmaram. A quadra é de vocês!"
            : "Falta a confirmação dos outros jogadores."
          : "Avisamos quem te convidou.",
      });
    },
    onError: (failure) => {
      toast.error(failure instanceof ApiError ? failure.message : "Não foi possível responder.");
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.bookingsMine });
      void client.invalidateQueries({ queryKey: queryKeys.schedule() });
    },
  });

  return (
    <ul className="space-y-3">
      <AnimatePresence initial={false}>
        {invites.map((invite, index) => {
          const inviter =
            invite.players.find((player) => player.user.id === invite.createdById)?.user.name ??
            "Um sócio";
          return (
            <motion.li
              key={invite.id}
              layout
              custom={index}
              variants={listItemVariants}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              <SwipeCard
                onConfirm={() => answer.mutateAsync({ id: invite.id, accept: true })}
                onDecline={() => answer.mutateAsync({ id: invite.id, accept: false })}
              >
                <div className="space-y-3 p-4 pb-3">
                  <div className="flex items-center justify-between gap-2 text-small">
                    <p>
                      <span className="font-semibold">{inviter.split(" ")[0]}</span> te chamou para
                      jogar
                    </p>
                    <span className="flex shrink-0 items-center gap-1 text-caption text-warning-ink">
                      <Hourglass aria-hidden className="size-3.5" /> até{" "}
                      <span className="num">{formatTime(invite.expiresAt)}</span>
                    </span>
                  </div>
                  <TicketCard booking={invite} status={false} className="shadow-none" />
                </div>
              </SwipeCard>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
