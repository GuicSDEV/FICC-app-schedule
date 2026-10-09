"use client";

import type { TournamentDetail, TournamentMatchView } from "@ficc/shared";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { enter, listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";

import { MatchRow } from "../match-row";

/** Matches that need the organizer: overdue results, results to confirm and rained-out ones. */
export function PendingResults({
  tournament,
  onOpenMatch,
}: {
  tournament: TournamentDetail;
  onOpenMatch: (match: TournamentMatchView) => void;
}) {
  const t = useTranslations("tournaments.pending");
  const pending = useQuery({
    queryKey: queryKeys.tournaments.pending(tournament.id),
    queryFn: () => api.tournaments.pending(tournament.id),
    refetchInterval: 60_000,
  });

  if (pending.isError) return <ErrorState onRetry={() => void pending.refetch()} />;
  if (!pending.data) return <Skeleton className="h-64 rounded-lg" />;
  const { overdue, awaitingConfirmation, frozen } = pending.data;
  if (overdue.length + awaitingConfirmation.length + frozen.length === 0) {
    return (
      <EmptyState icon={CheckCircle2} title={t("emptyTitle")} description={t("emptyDescription")} />
    );
  }

  const block = (
    key: "overdue" | "awaiting" | "frozen",
    matches: TournamentMatchView[],
    action: string,
  ) =>
    matches.length > 0 ? (
      <section className="space-y-3">
        <SectionLabel>{t(key, { count: matches.length })}</SectionLabel>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {matches.map((match, index) => (
            <motion.li
              key={match.id}
              custom={index}
              variants={listItemVariants}
              initial={enter("hidden")}
              animate="show"
            >
              <MatchRow
                match={match}
                onOpen={onOpenMatch}
                actions={
                  <Button
                    size="sm"
                    variant={key === "frozen" ? "secondary" : "primary"}
                    onClick={() => onOpenMatch(match)}
                  >
                    {action}
                  </Button>
                }
              />
            </motion.li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <div className="space-y-6">
      {block("overdue", overdue, t("enterResult"))}
      {block("awaiting", awaitingConfirmation, t("review"))}
      {block("frozen", frozen, t("decide"))}
      {frozen.length > 0 ? (
        <p className="text-caption text-muted-foreground">{t("frozenHint")}</p>
      ) : null}
    </div>
  );
}
