"use client";

import type { MatchDetail, TeamSide } from "@ficc/shared";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";

import { useSession } from "@/components/providers/session-provider";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { sidePlayers, setsFrom, viewerEntry, viewerSides } from "@/lib/matches";
import { spring, tap } from "@/lib/motion";
import { formatDelta, useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";

/** Card corner radius in px (16px, as the design system); inline so the morph animates it. */
export const CARD_RADIUS = 16;

export const STATUS_TONE = {
  PENDING: "warning",
  CONFIRMED: "success",
  DISPUTED: "danger",
  VOIDED: "neutral",
} as const;

/** One side of the scoreboard: avatars, names and the games of each set. */
export function ScoreRow({
  match,
  side,
  sets,
  size = "card",
}: {
  match: MatchDetail;
  side: TeamSide;
  sets: { mine: number; theirs: number; tiebreak: boolean }[];
  size?: "card" | "detail";
}) {
  const players = sidePlayers(match, side);
  const won = match.winnerSide === side && match.status !== "VOIDED";
  return (
    <div className="flex items-center gap-3">
      <div className="flex shrink-0 -space-x-2">
        {players.map((player) => (
          <span key={player.user.id} className="rounded-full ring-2 ring-card">
            <Avatar
              name={player.user.name}
              src={player.user.photoUrl}
              size={size === "detail" ? "md" : "sm"}
            />
          </span>
        ))}
      </div>
      <p
        className={cn(
          "min-w-0 flex-1 truncate",
          size === "detail" ? "text-body" : "text-small",
          won ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {players.map((player) => player.user.name.split(" ")[0]).join(" / ")}
        {won ? (
          <span
            aria-hidden
            className="ml-1.5 inline-block size-2 rounded-full bg-ball align-middle"
          />
        ) : null}
      </p>
      <div className="flex shrink-0 gap-1">
        {sets.map((set, index) => (
          <span
            key={index}
            className={cn(
              "flex items-center justify-center rounded-sm num font-semibold",
              size === "detail" ? "h-10 w-10 text-title" : "h-7 w-7 text-small",
              set.mine > set.theirs
                ? "bg-surface-3 text-foreground"
                : "bg-transparent text-muted-foreground",
              set.tiebreak && "w-auto px-1.5",
            )}
          >
            {set.mine}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Per-side game counts for both scoreboard rows, viewer's side first. */
export function scoreboard(match: MatchDetail) {
  const [first, second] = viewerSides(match);
  const fromFirst = setsFrom(match.sets, first);
  return {
    first,
    second,
    firstSets: fromFirst.map((set) => ({ mine: set.a, theirs: set.b, tiebreak: set.tiebreak })),
    secondSets: fromFirst.map((set) => ({ mine: set.b, theirs: set.a, tiebreak: set.tiebreak })),
  };
}

/**
 * Match summary card. Its surface shares a `layoutId` with the detail panel, which morphs out of
 * it (shared layout).
 */
export function MatchCard({
  match,
  onOpen,
  raised,
}: {
  match: MatchDetail;
  onOpen: () => void;
  /** Keeps the card above its neighbours while the detail panel morphs back into it. */
  raised?: boolean;
}) {
  const t = useTranslations("matches");
  const common = useTranslations("common");
  const format = useFormat();
  const { user } = useSession();
  const mine = viewerEntry(match, user?.id);
  const board = scoreboard(match);

  return (
    <motion.button
      type="button"
      whileTap={tap}
      onClick={onOpen}
      aria-label={t("open", { score: match.score, day: format.day(match.playedOn) })}
      className={cn("relative block w-full rounded-lg p-4 text-left", raised && "z-20")}
    >
      {/* Only the surface morphs into the detail panel, so the text never stretches. */}
      <motion.span
        aria-hidden
        layoutId={`match-${match.id}`}
        layoutCrossfade={false}
        transition={spring.gentle}
        style={{ borderRadius: CARD_RADIUS }}
        className="absolute inset-0 border border-border bg-card shadow-card"
      />
      <span className="relative block">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-caption text-muted-foreground">
            {format.dayTitle(match.playedOn)} ·{" "}
            {match.format === "SINGLES" ? common("singles") : common("doubles")}
            {match.court ? ` · ${match.court.name}` : ""}
          </span>
          {mine?.delta != null ? (
            <span
              className={cn(
                "inline-flex h-6 items-center rounded-full px-2 num text-caption font-semibold",
                mine.delta > 0
                  ? "bg-ball text-on-color"
                  : mine.delta < 0
                    ? "bg-danger-soft text-danger-ink"
                    : "bg-surface-2 text-muted-foreground",
              )}
            >
              {formatDelta(mine.delta)}
            </span>
          ) : (
            <Badge tone={STATUS_TONE[match.status]} className="h-6 px-2">
              {t(`status.${match.status}`)}
            </Badge>
          )}
        </div>
        <div className="mt-3 space-y-2">
          <ScoreRow match={match} side={board.first} sets={board.firstSets} />
          <ScoreRow match={match} side={board.second} sets={board.secondSets} />
        </div>
      </span>
    </motion.button>
  );
}
