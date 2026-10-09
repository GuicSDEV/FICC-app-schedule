"use client";

import type { TournamentMatchView } from "@ficc/shared";
import { AlertTriangle, CloudRain, Clock, Trophy } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { tap } from "@/lib/motion";
import { sideUserIds } from "@/lib/tournaments";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";

type Side = TournamentMatchView["a"];

/** Where a match stands in the draw: "Grupo A · Rodada 2" or "Semifinal". */
export function useStageLabel() {
  const t = useTranslations("tournaments");
  const labels = useTranslations("labels");
  return (match: TournamentMatchView) =>
    match.stage === "GROUP"
      ? t("groupRound", { group: match.groupName ?? "", round: match.round })
      : match.roundName
        ? labels(`round.${match.roundName}`)
        : t("roundNumber", { round: match.round });
}

function SideLine({
  side,
  match,
  sideKey,
  mine,
}: {
  side: Side;
  match: TournamentMatchView;
  sideKey: "A" | "B";
  mine: boolean;
}) {
  const t = useTranslations("tournaments.bracket");
  const won = side !== null && match.winnerEntryId === side.id;
  const lost = side !== null && match.winnerEntryId !== null && !won;
  const feeder = sideKey === "A" ? match.feederA : match.feederB;
  return (
    <div
      className={cn("flex min-h-10 items-center gap-2.5 rounded-md px-1", mine && "bg-ball-soft")}
    >
      {side ? (
        <span className="flex -space-x-2">
          {side.players.map((player) => (
            <Avatar
              key={player.userId ?? player.name}
              name={player.name}
              src={player.photoUrl}
              size="xs"
            />
          ))}
        </span>
      ) : (
        <span
          className="size-6 rounded-full border border-dashed border-border-strong"
          aria-hidden
        />
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-small",
          won ? "font-semibold" : lost ? "text-muted-foreground" : "",
          !side && "text-muted-foreground italic",
        )}
      >
        {side ? side.name : feeder ? t("winnerOf", { number: feeder.position + 1 }) : t("tbd")}
        {side?.seed ? (
          <span className="ml-1 num text-caption text-muted-foreground">[{side.seed}]</span>
        ) : null}
      </span>
      {won ? <Trophy className="size-3.5 shrink-0 text-gold" aria-label={t("winner")} /> : null}
      <span className="flex shrink-0 gap-2 num text-small">
        {match.sets.map((set, index) => {
          const mineGames = sideKey === "A" ? set.a : set.b;
          const theirs = sideKey === "A" ? set.b : set.a;
          return (
            <span
              key={index}
              className={cn(
                "w-5 text-center",
                mineGames > theirs ? "font-semibold" : "text-muted-foreground",
              )}
            >
              {mineGames}
            </span>
          );
        })}
      </span>
    </div>
  );
}

/**
 * A tournament match as a list row: stage and schedule on top, both sides with set scores, and
 * status badges (awaiting confirmation, overdue, rain). Tapping opens it (report / details).
 */
export function MatchRow({
  match,
  viewerId,
  onOpen,
  showCategory = true,
  actions,
  className,
}: {
  match: TournamentMatchView;
  viewerId?: string;
  onOpen?: (match: TournamentMatchView) => void;
  showCategory?: boolean;
  actions?: ReactNode;
  className?: string;
}) {
  const t = useTranslations("tournaments");
  const outcomes = useTranslations("tournaments.outcome");
  const format = useFormat();
  const stage = useStageLabel();
  const mineA = viewerId !== undefined && sideUserIds(match.a).includes(viewerId);
  const mineB = viewerId !== undefined && sideUserIds(match.b).includes(viewerId);
  const clickable = Boolean(onOpen);

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
        <span className="font-medium text-foreground">
          {showCategory ? `${match.categoryName} · ` : ""}
          {stage(match)}
        </span>
        {match.schedule ? (
          <span className="num">
            {format.day(match.schedule.date)} · {match.schedule.startTime} ·{" "}
            {match.schedule.courtName}
          </span>
        ) : match.winnerEntryId ? null : (
          <span>{t("notScheduled")}</span>
        )}
        <span className="ml-auto flex gap-1.5">
          {match.resultStatus === "REPORTED" ? (
            <Badge tone="warning" className="h-6">
              <Clock />
              {t("awaitingConfirmation")}
            </Badge>
          ) : null}
          {match.overdue ? (
            <Badge tone="danger" className="h-6">
              <AlertTriangle />
              {t("overdue")}
            </Badge>
          ) : null}
          {match.frozen ? (
            <Badge tone="lesson" className="h-6">
              <CloudRain />
              {t("frozen")}
            </Badge>
          ) : null}
          {match.schedule && !match.schedule.published && !match.winnerEntryId ? (
            <Badge className="h-6">{t("draftSchedule")}</Badge>
          ) : null}
          {match.outcome && match.outcome !== "PLAYED" ? (
            <Badge className="h-6">{outcomes(match.outcome)}</Badge>
          ) : null}
        </span>
      </div>
      <div className="mt-1.5 space-y-0.5">
        <SideLine side={match.a} match={match} sideKey="A" mine={mineA} />
        <SideLine side={match.b} match={match} sideKey="B" mine={mineB} />
      </div>
    </>
  );

  return (
    <div className={cn("rounded-lg border border-border bg-card shadow-card", className)}>
      {clickable ? (
        <motion.button
          type="button"
          whileTap={tap}
          onClick={() => onOpen?.(match)}
          className="block w-full rounded-lg p-3 text-left hover:bg-surface-2/50"
        >
          {body}
        </motion.button>
      ) : (
        <div className="p-3">{body}</div>
      )}
      {actions ? (
        <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2">{actions}</div>
      ) : null}
    </div>
  );
}
