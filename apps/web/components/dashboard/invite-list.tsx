"use client";

import type { BookingDetail } from "@ficc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Hourglass } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { TicketCard } from "@/components/booking/ticket-card";
import { SwipeCard } from "@/components/ui/swipe-card";
import { api } from "@/lib/api";
import { listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";

/** Pending invitations: swipe right to confirm, left to decline (buttons do the same). */
export function InviteList({ invites }: { invites: BookingDetail[] }) {
  const t = useTranslations("dashboard.invite");
  const format = useFormat();
  const errorMessage = useErrorMessage();
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
      toast.success(accept ? t("confirmed") : t("declined"), {
        description: accept
          ? booking.status === "CONFIRMED"
            ? t("confirmedAll")
            : t("confirmedWaiting")
          : t("declinedDescription"),
      });
    },
    onError: (failure) => {
      toast.error(errorMessage(failure, t("failed")));
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
            t("someone");
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
                      {t.rich("from", {
                        name: inviter.split(" ")[0] ?? inviter,
                        b: (chunks) => <span className="font-semibold">{chunks}</span>,
                      })}
                    </p>
                    <span className="flex shrink-0 items-center gap-1 text-caption text-warning-ink">
                      <Hourglass aria-hidden className="size-3.5" />
                      <span>
                        {t.rich("until", {
                          time: format.time(invite.expiresAt),
                          num: (chunks) => <span className="num">{chunks}</span>,
                        })}
                      </span>
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
