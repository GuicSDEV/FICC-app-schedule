"use client";

import type { TournamentSummary } from "@ficc/shared";
import { CalendarDays, ChevronRight, MapPin, Users } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { tap } from "@/lib/motion";
import { ENTRY_TONE } from "@/lib/tournaments";
import { useFormat } from "@/lib/use-format";

import { StatusBadge, useDateRange } from "./tournament-panels";

const MotionLink = motion.create(Link);

/** A tournament in a list: status, dates, place, categories and the viewer's entry. */
export function TournamentCard({
  tournament,
  href,
}: {
  tournament: TournamentSummary;
  href: string;
}) {
  const t = useTranslations("tournaments.card");
  const statuses = useTranslations("tournaments.entryStatus");
  const format = useFormat();
  const range = useDateRange();
  return (
    <MotionLink
      href={href}
      whileTap={tap}
      className="group grain relative flex flex-col gap-3 overflow-hidden rounded-lg border border-border bg-card p-4 shadow-card transition-tokens hover:border-border-strong"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-10 size-40 rounded-full bg-gold/10 blur-3xl"
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={tournament.status} />
            {tournament.myEntryStatus ? (
              <Badge tone={ENTRY_TONE[tournament.myEntryStatus]}>
                {statuses(tournament.myEntryStatus)}
              </Badge>
            ) : null}
          </div>
          <p className="font-display text-title font-semibold">{tournament.name}</p>
        </div>
        <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground transition-tokens group-hover:translate-x-0.5" />
      </div>
      <div className="relative flex flex-wrap gap-x-4 gap-y-1 text-small text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-4" />
          {range(tournament.startDate, tournament.endDate)}
        </span>
        {tournament.location ? (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4" />
            {tournament.location}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-4" />
          {t("entrants", { count: tournament.entrants })}
        </span>
      </div>
      <div className="relative flex flex-wrap gap-1.5">
        {tournament.categories.map((category) => (
          <Badge key={category.id}>{category.name}</Badge>
        ))}
        {tournament.circuit ? <Badge tone="lesson">{tournament.circuit.name}</Badge> : null}
      </div>
      {tournament.registrationOpen && tournament.registrationClosesAt ? (
        <p className="relative text-caption font-medium text-ball-ink">
          {t("closes", { when: format.relative(tournament.registrationClosesAt) })}
        </p>
      ) : tournament.registrationOpen ? (
        <p className="relative text-caption font-medium text-ball-ink">{t("open")}</p>
      ) : null}
    </MotionLink>
  );
}
