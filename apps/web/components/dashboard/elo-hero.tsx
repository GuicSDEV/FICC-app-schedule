"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingDown, TrendingUp, Trophy } from "lucide-react";
import Link from "next/link";

import { Sparkline } from "@/components/charts/sparkline";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/card";
import { CourtLines } from "@/components/ui/court-lines";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDelta } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/** How many recent rating points the sparkline shows. */
const SPARK_POINTS = 20;

/** Giant Elo with a ticker, 30-day trend, record and a sparkline of the recent history. */
export function EloHero({ userId }: { userId: string }) {
  const profile = useQuery({
    queryKey: queryKeys.player(userId),
    queryFn: () => api.ranking.profile(userId),
  });
  const history = useQuery({
    queryKey: queryKeys.eloHistory(userId),
    queryFn: () => api.ranking.eloHistory(userId),
  });
  const data = profile.data;
  const trend = data?.trend ?? 0;

  return (
    <section
      aria-label="Seu Elo"
      className="grain relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-card"
    >
      <CourtLines className="opacity-[0.05]" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-primary/15 blur-3xl"
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <SectionLabel>Seu Elo</SectionLabel>
          {data ? (
            <Link href="/app/ranking" className="rounded-full">
              <Badge tone="neutral">
                <Trophy aria-hidden /> <span className="num">#{data.rank}</span> no ranking
              </Badge>
            </Link>
          ) : (
            <Skeleton className="h-7 w-32 rounded-full" />
          )}
        </div>

        <div className="mt-2 flex items-end gap-3">
          {data ? (
            <NumberTicker
              value={data.player.elo}
              from={data.player.elo - trend}
              className="font-display text-hero font-bold tracking-tight"
            />
          ) : (
            <Skeleton className="h-14 w-36" />
          )}
          {data ? (
            <span
              className={cn(
                "mb-1.5 inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-caption font-semibold",
                trend > 0
                  ? "bg-ball text-on-color"
                  : trend < 0
                    ? "bg-danger-soft text-danger-ink"
                    : "bg-surface-2 text-muted-foreground",
              )}
            >
              {trend > 0 ? (
                <TrendingUp aria-hidden className="size-3.5" />
              ) : trend < 0 ? (
                <TrendingDown aria-hidden className="size-3.5" />
              ) : null}
              <span className="num">{formatDelta(trend)}</span>
              <span className="font-medium opacity-80">30 dias</span>
            </span>
          ) : null}
        </div>

        <div className="mt-1 flex h-5 items-center gap-3 text-small text-muted-foreground">
          {data ? (
            <>
              <span>
                <span className="num font-semibold text-foreground">{data.wins}</span> vitórias
              </span>
              <span>
                <span className="num font-semibold text-foreground">{data.losses}</span> derrotas
              </span>
              <span>
                <span className="num font-semibold text-foreground">{data.winRate}%</span>{" "}
                aproveitamento
              </span>
            </>
          ) : (
            <Skeleton className="h-4 w-56" />
          )}
        </div>

        <div className="mt-4 h-16">
          {history.data ? (
            <Sparkline values={history.data.slice(-SPARK_POINTS).map((point) => point.elo)} />
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </div>
      </div>
    </section>
  );
}
