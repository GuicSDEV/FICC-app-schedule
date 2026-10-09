"use client";

import type { MyTournamentItem } from "@ficc/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Medal, Trophy } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { useSession } from "@/components/providers/session-provider";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/card";
import { api } from "@/lib/api";
import { enter, listItemVariants, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { ENTRY_TONE, viewerSide } from "@/lib/tournaments";
import { useFormat } from "@/lib/use-format";

import { useStageLabel } from "./match-row";

const MotionLink = motion.create(Link);

function Item({ item, index }: { item: MyTournamentItem; index: number }) {
  const t = useTranslations("tournaments.dashboard");
  const statuses = useTranslations("tournaments.entryStatus");
  const format = useFormat();
  const stage = useStageLabel();
  const { user } = useSession();
  const next = item.nextMatch;
  const side = next ? viewerSide(next, user?.id) : null;
  const opponent = next ? (side === "B" ? next.a : next.b) : null;

  return (
    <motion.li custom={index} variants={listItemVariants} initial={enter("hidden")} animate="show">
      <MotionLink
        href={`/app/tournaments/${item.tournament.id}${next ? "?tab=schedule" : ""}`}
        whileTap={tap}
        className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-card hover:border-border-strong"
      >
        <span
          className={
            item.champion
              ? "flex size-11 shrink-0 items-center justify-center rounded-full bg-gold text-on-color"
              : "flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-gold"
          }
        >
          {item.champion ? <Trophy className="size-5" /> : <Medal className="size-5" />}
        </span>
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="block truncate text-small font-semibold">{item.tournament.name}</span>
          <span className="block truncate text-caption text-muted-foreground">
            {item.category.name}
            {next
              ? ` · ${stage(next)}${opponent ? ` ${t("vs", { name: opponent.name })}` : ""}`
              : ""}
          </span>
          {next?.schedule ? (
            <span className="block truncate text-caption font-medium text-ball-ink">
              {format.dayTitle(next.schedule.date)} · {next.schedule.startTime} ·{" "}
              {next.schedule.courtName}
            </span>
          ) : next ? (
            <span className="block text-caption text-muted-foreground">{t("toBeScheduled")}</span>
          ) : null}
        </span>
        {item.champion ? (
          <Badge tone="ball">{t("champion")}</Badge>
        ) : item.eliminated ? (
          <Badge>{t("eliminated")}</Badge>
        ) : next?.viewer.canConfirm ? (
          <Badge tone="warning">{t("confirm")}</Badge>
        ) : item.entry.status !== "CONFIRMED" ? (
          <Badge tone={ENTRY_TONE[item.entry.status]}>{statuses(item.entry.status)}</Badge>
        ) : null}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </MotionLink>
    </motion.li>
  );
}

/** Dashboard card: the tournaments the member is in, with the next match of each. */
export function MyTournamentsCard() {
  const t = useTranslations("tournaments.dashboard");
  const mine = useQuery({ queryKey: queryKeys.tournaments.mine, queryFn: api.tournaments.mine });
  const items = mine.data ?? [];
  if (items.length === 0) return null;
  return (
    <section className="space-y-3" aria-label={t("title")}>
      <div className="flex items-center justify-between">
        <SectionLabel>{t("title")}</SectionLabel>
        <Link
          href="/app/tournaments"
          className="inline-flex min-h-11 items-center text-caption font-medium text-accent-ink hover:underline"
        >
          {t("all")}
        </Link>
      </div>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <Item key={`${item.tournament.id}-${item.entry.id}`} item={item} index={index} />
        ))}
      </ul>
    </section>
  );
}
