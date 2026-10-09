"use client";

import { clubTimeOfDay } from "@ficc/shared";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

import { type BookingInfoTarget, BookingInfoSheet } from "@/components/booking/booking-info-sheet";
import { TicketCard } from "@/components/booking/ticket-card";
import { EloHero } from "@/components/dashboard/elo-hero";
import { InviteList } from "@/components/dashboard/invite-list";
import { ResultApprovals } from "@/components/dashboard/result-approvals";
import { useClub } from "@/components/providers/club-provider";
import { MyTournamentsCard } from "@/components/tournaments/my-tournaments-card";
import { useSession } from "@/components/providers/session-provider";
import { NotificationBell } from "@/components/shell/notification-bell";
import { PageHeader } from "@/components/shell/page-header";
import { UserAvatarLink } from "@/components/shell/user-avatar-link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { listItemVariants, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";

/** Part of the day at the club, for the greeting. */
function dayPart(timeZone: string): "night" | "morning" | "afternoon" {
  const hour = Number(clubTimeOfDay(new Date(), timeZone).slice(0, 2));
  if (hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "night";
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex items-center gap-2">
        <SectionLabel>{title}</SectionLabel>
        {count ? (
          <Badge tone="ball" className="h-5 px-2 num">
            {count}
          </Badge>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default function MemberDashboard() {
  const t = useTranslations("dashboard");
  const club = useClub();
  const { user } = useSession();
  const client = useQueryClient();
  const bookings = useQuery({ queryKey: queryKeys.bookingsMine, queryFn: api.bookings.mine });
  const matches = useQuery({ queryKey: queryKeys.matchesMine, queryFn: api.matches.mine });
  const favorites = useQuery({
    queryKey: queryKeys.favorites,
    queryFn: api.favorites.list,
    staleTime: 5 * 60_000,
  });
  const [infoTarget, setInfoTarget] = useState<BookingInfoTarget | null>(null);

  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.bookingsMine }),
      client.invalidateQueries({ queryKey: queryKeys.matchesMine }),
      client.invalidateQueries({ queryKey: ["players"] }),
      client.invalidateQueries({ queryKey: queryKeys.me }),
      client.invalidateQueries({ queryKey: queryKeys.tournaments.mine }),
    ]);
  }

  const invites = bookings.data?.invites ?? [];
  const approvals = matches.data?.awaitingMyResponse ?? [];
  const upcoming = (bookings.data?.upcoming ?? []).filter(
    (booking) => !invites.some((invite) => invite.id === booking.id),
  );
  const isFavorite = (courtId: string, timeSlotId: string) =>
    Boolean(
      favorites.data?.some(
        (favorite) => favorite.courtId === courtId && favorite.timeSlotId === timeSlotId,
      ),
    );

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={
          user && club
            ? t(`greeting.${dayPart(club.timezone)}`, {
                name: user.name.split(" ")[0] ?? user.name,
              })
            : " "
        }
        actions={
          <>
            <NotificationBell />
            <UserAvatarLink href="/app/profile" />
          </>
        }
      />
      <PullToRefresh onRefresh={refresh}>
        <div className="mt-5 grid gap-6 md:grid-cols-2 md:items-start">
          <div className="space-y-6">
            {user ? <EloHero userId={user.id} /> : <Skeleton className="h-[15.5rem] rounded-xl" />}
            {approvals.length > 0 ? (
              <Section title={t("approvals")} count={approvals.length}>
                <ResultApprovals matches={approvals} />
              </Section>
            ) : null}
            <MyTournamentsCard />
          </div>

          <div className="space-y-6">
            {invites.length > 0 ? (
              <Section title={t("invites")} count={invites.length}>
                <p className="-mt-1 text-caption text-muted-foreground">{t("swipeHint")}</p>
                <InviteList invites={invites} />
              </Section>
            ) : null}

            <Section title={t("upcoming")}>
              {bookings.isError ? (
                <ErrorState message={t("upcomingFailed")} onRetry={() => void bookings.refetch()} />
              ) : bookings.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-[8.5rem] rounded-lg" />
                  <Skeleton className="h-[8.5rem] rounded-lg" />
                </div>
              ) : upcoming.length === 0 ? (
                <EmptyState
                  icon={CalendarPlus}
                  title={t("emptyTitle")}
                  description={t("emptyDescription")}
                  action={<ButtonLink href="/app/courts">{t("book")}</ButtonLink>}
                />
              ) : (
                <ul className="space-y-3">
                  {upcoming.map((booking, index) => (
                    <motion.li
                      key={booking.id}
                      custom={index}
                      variants={listItemVariants}
                      initial="hidden"
                      animate="show"
                    >
                      <motion.button
                        type="button"
                        whileTap={tap}
                        className="block w-full rounded-lg text-left"
                        aria-label={t("openBooking", {
                          court: booking.court.name,
                          time: booking.slot.startTime,
                        })}
                        onClick={() =>
                          setInfoTarget({
                            date: booking.date,
                            court: booking.court,
                            slot: booking.slot,
                            booking: {
                              id: booking.id,
                              type: booking.type,
                              status: booking.status,
                              players: booking.players,
                            },
                            favorite: isFavorite(booking.court.id, booking.slot.id),
                            past: false,
                          })
                        }
                      >
                        <TicketCard booking={booking} />
                      </motion.button>
                    </motion.li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </div>
      </PullToRefresh>
      <BookingInfoSheet target={infoTarget} onOpenChange={(open) => !open && setInfoTarget(null)} />
    </>
  );
}
