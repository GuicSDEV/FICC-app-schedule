"use client";

import type { LeaderboardEntry, LeaderboardResponse } from "@ficc/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Search, Swords, Trophy, X } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { useClub } from "@/components/providers/club-provider";
import { useSession } from "@/components/providers/session-provider";
import { NotificationBell } from "@/components/shell/notification-bell";
import { PageHeader } from "@/components/shell/page-header";
import { CategoryTabs } from "@/components/ranking/category-tabs";
import { Podium } from "@/components/ranking/podium";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { duration, enter, popVariants, spring, staggerDelay, transitions } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { matchesName } from "@/lib/search";
import { formatDelta, useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";

const ALL = "ALL";
/** How long a moved row stays highlighted with its ↑/↓ (ms). */
const FLASH_MS = 2400;

type Moves = Record<string, "up" | "down">;

/** Rows whose rank changed between two versions of the same board. */
function diffRanks(previous: Map<string, number>, next: LeaderboardResponse): Moves {
  const moves: Moves = {};
  for (const entry of next.entries) {
    const before = previous.get(entry.player.id);
    if (before !== undefined && before !== entry.rank) {
      moves[entry.player.id] = entry.rank < before ? "up" : "down";
    }
  }
  return moves;
}

function TrendChip({ trend }: { trend: number }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-11 items-center justify-center rounded-full px-2 num text-caption font-semibold",
        trend > 0
          ? "bg-ball-soft text-ball-ink"
          : trend < 0
            ? "bg-danger-soft text-danger-ink"
            : "bg-surface-2 text-muted-foreground",
      )}
    >
      {formatDelta(trend)}
    </span>
  );
}

function LeaderboardRow({
  entry,
  index,
  mine,
  move,
}: {
  entry: LeaderboardEntry;
  index: number;
  mine: boolean;
  move?: "up" | "down";
}) {
  const t = useTranslations("ranking");
  return (
    <motion.li
      layout
      transition={spring.gentle}
      initial={{ opacity: 0, y: 12 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: { ...transitions.base, delay: staggerDelay(index) },
      }}
      className="relative"
    >
      <Link
        href={`/app/players/${entry.player.id}`}
        className={cn(
          "relative flex min-h-16 items-center gap-3 overflow-hidden rounded-lg border px-3 py-2.5 transition-tokens",
          mine ? "border-primary/50 bg-ball-soft" : "border-border bg-card hover:bg-surface-2",
        )}
      >
        <AnimatePresence>
          {move ? (
            <motion.span
              aria-hidden
              key="flash"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.6] }}
              exit={{ opacity: 0 }}
              transition={{ duration: duration.slow * 2 }}
              className={cn(
                "pointer-events-none absolute inset-0",
                move === "up" ? "bg-ball/20" : "bg-danger/15",
              )}
            />
          ) : null}
        </AnimatePresence>
        <span className="relative w-7 shrink-0 text-center num text-small font-semibold text-muted-foreground">
          {entry.rank}
        </span>
        <Avatar name={entry.player.name} src={entry.player.photoUrl} className="relative" />
        <span className="relative min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-medium">{entry.player.name}</span>
            {mine ? <span className="shrink-0 text-caption text-ball-ink">{t("you")}</span> : null}
            <AnimatePresence>
              {move ? (
                <motion.span
                  key={move}
                  variants={popVariants}
                  initial={enter("hidden")}
                  animate="show"
                  exit="exit"
                  className={cn(
                    "inline-flex size-5 shrink-0 items-center justify-center rounded-full",
                    move === "up" ? "bg-ball text-on-color" : "bg-danger text-on-color",
                  )}
                >
                  {move === "up" ? (
                    <ArrowUp className="size-3" aria-label={t("movedUp")} />
                  ) : (
                    <ArrowDown className="size-3" aria-label={t("movedDown")} />
                  )}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </span>
          <span className="block num text-caption text-muted-foreground">
            {t("record", { wins: entry.wins, losses: entry.losses, rate: entry.winRate })}
          </span>
        </span>
        <span className="relative flex shrink-0 flex-col items-end gap-1">
          <span className="num font-semibold">{entry.elo}</span>
          <TrendChip trend={entry.trend} />
        </span>
      </Link>
    </motion.li>
  );
}

export function RankingView() {
  const t = useTranslations("ranking");
  const format = useFormat();
  const client = useQueryClient();
  const club = useClub();
  const { user } = useSession();
  const [category, setCategory] = useState(ALL);
  const [term, setTerm] = useState("");
  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: api.categories,
    staleTime: 60 * 60_000,
  });
  const board = useQuery({
    queryKey: queryKeys.leaderboard(category),
    queryFn: () => api.ranking.leaderboard(category === ALL ? undefined : category),
  });
  const data = board.data;

  // Live reorder: compare each new version of a board with the previous one.
  const previous = useRef(new Map<string, Map<string, number>>());
  const [moves, setMoves] = useState<Moves>({});
  useEffect(() => {
    if (!data) return;
    const key = data.category ?? ALL;
    const before = previous.current.get(key);
    previous.current.set(key, new Map(data.entries.map((entry) => [entry.player.id, entry.rank])));
    if (!before) return;
    const changed = diffRanks(before, data);
    if (Object.keys(changed).length === 0) return;
    setMoves(changed);
    const timer = setTimeout(() => setMoves({}), FLASH_MS);
    return () => clearTimeout(timer);
  }, [data]);

  const tabs = [
    { value: ALL, label: t("all") },
    ...(categories.data ?? []).map((item) => ({ value: item.key, label: item.name })),
  ];
  const entries = data?.entries ?? [];
  const searching = term.trim().length > 0;
  const found = searching ? entries.filter((entry) => matchesName(entry.player.name, term)) : [];
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={club ? t("subtitle", { days: club.settings.rankingTrendDays }) : " "}
        actions={<NotificationBell />}
      >
        <CategoryTabs
          label={t("categories")}
          options={tabs}
          value={category}
          onChange={setCategory}
        />
      </PageHeader>
      <PullToRefresh
        onRefresh={() => client.invalidateQueries({ queryKey: queryKeys.leaderboard() })}
      >
        <div className="mt-4 space-y-5">
          <ButtonLink href="/app/ranking/h2h" variant="secondary" block>
            <Swords /> {t("h2h")}
          </ButtonLink>

          <div role="search" className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("search")}
              autoComplete="off"
              enterKeyHint="search"
              className="pr-12 pl-11 [&::-webkit-search-cancel-button]:hidden"
            />
            {searching ? (
              <button
                type="button"
                onClick={() => setTerm("")}
                aria-label={t("clearSearch")}
                className="absolute top-1/2 right-1 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>

          {searching && data ? (
            <section aria-label={t("searchResults")} className="space-y-2">
              <p className="text-small text-muted-foreground" aria-live="polite">
                {t("searchCount", { count: found.length })}
              </p>
              {found.length > 0 ? (
                <ol className="space-y-2">
                  {found.map((entry, index) => (
                    <LeaderboardRow
                      key={entry.player.id}
                      entry={entry}
                      index={index}
                      mine={entry.player.id === user?.id}
                    />
                  ))}
                </ol>
              ) : null}
            </section>
          ) : board.isError ? (
            <ErrorState message={t("loadFailed")} onRetry={() => void board.refetch()} />
          ) : !data ? (
            <div className="space-y-3">
              <Skeleton className="h-52 rounded-xl" />
              {[0, 1, 2, 3].map((key) => (
                <Skeleton key={key} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <EmptyState icon={Trophy} title={t("emptyTitle")} description={t("emptyDescription")} />
          ) : (
            <LayoutGroup id={`board-${category}`}>
              <div className="rounded-xl border border-border bg-card px-3 shadow-card">
                <Podium entries={podium} viewerId={user?.id} flash={moves} />
              </div>
              {rest.length > 0 ? (
                <ol className="space-y-2" aria-label={t("title")}>
                  {rest.map((entry, index) => (
                    <LeaderboardRow
                      key={entry.player.id}
                      entry={entry}
                      index={index}
                      mine={entry.player.id === user?.id}
                      move={moves[entry.player.id]}
                    />
                  ))}
                </ol>
              ) : null}
              <p className="pt-1 text-center text-caption text-muted-foreground">
                {t("updated", { when: format.relative(data.updatedAt) })}
              </p>
            </LayoutGroup>
          )}
        </div>
      </PullToRefresh>
    </>
  );
}
