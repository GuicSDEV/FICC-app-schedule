"use client";

import { clubTimeOfDay } from "@ficc/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

import { type BookingInfoTarget, BookingInfoSheet } from "@/components/booking/booking-info-sheet";
import { TicketCard } from "@/components/booking/ticket-card";
import { EloHero } from "@/components/dashboard/elo-hero";
import { InviteList } from "@/components/dashboard/invite-list";
import { ResultApprovals } from "@/components/dashboard/result-approvals";
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

function greeting(): string {
  const hour = Number(clubTimeOfDay().slice(0, 2));
  if (hour < 5) return "Boa noite";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
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
        title="Início"
        subtitle={user ? `${greeting()}, ${user.name.split(" ")[0]}` : " "}
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
              <Section title="Resultados para aprovar" count={approvals.length}>
                <ResultApprovals matches={approvals} />
              </Section>
            ) : null}
          </div>

          <div className="space-y-6">
            {invites.length > 0 ? (
              <Section title="Convites" count={invites.length}>
                <p className="-mt-1 text-caption text-muted-foreground">
                  Deslize para a direita para confirmar, para a esquerda para recusar.
                </p>
                <InviteList invites={invites} />
              </Section>
            ) : null}

            <Section title="Próximos jogos">
              {bookings.isError ? (
                <ErrorState
                  message="Não foi possível carregar suas reservas."
                  onRetry={() => void bookings.refetch()}
                />
              ) : bookings.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-[8.5rem] rounded-lg" />
                  <Skeleton className="h-[8.5rem] rounded-lg" />
                </div>
              ) : upcoming.length === 0 ? (
                <EmptyState
                  icon={CalendarPlus}
                  title="Nenhum jogo marcado"
                  description="Escolha um horário livre e chame seus parceiros."
                  action={<ButtonLink href="/app/courts">Reservar quadra</ButtonLink>}
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
                        aria-label={`Reserva ${booking.court.name}, ${booking.slot.startTime}. Ver detalhes`}
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
