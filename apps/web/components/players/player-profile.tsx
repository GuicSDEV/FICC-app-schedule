"use client";

import { formatMembershipId } from "@ficc/shared";
import { useQuery } from "@tanstack/react-query";
import { Swords, Trophy } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { EloChart } from "@/components/charts/elo-chart-lazy";
import { MatchCard } from "@/components/matches/match-card";
import { useClub } from "@/components/providers/club-provider";
import { useSession } from "@/components/providers/session-provider";
import { TitlesList } from "@/components/tournaments/titles-list";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { CourtLines } from "@/components/ui/court-lines";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { formatDelta } from "@/lib/use-format";
import { cn } from "@/lib/utils";

function Stat({ value, label, suffix = "" }: { value: number; label: string; suffix?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <NumberTicker
        value={value}
        from={0}
        format={(n) => `${n}${suffix}`}
        className="text-title font-semibold"
      />
      <p className="text-caption text-muted-foreground">{label}</p>
    </div>
  );
}

/** A player's ladder card: rating, rank, record, Elo history and recent matches. */
export function PlayerProfileView({ userId, extra }: { userId: string; extra?: ReactNode }) {
  const t = useTranslations("profile");
  const club = useClub();
  const router = useRouter();
  const { user } = useSession();
  const own = user?.id === userId;
  const profile = useQuery({
    queryKey: queryKeys.player(userId),
    queryFn: () => api.ranking.profile(userId),
  });
  const history = useQuery({
    queryKey: queryKeys.eloHistory(userId),
    queryFn: () => api.ranking.eloHistory(userId),
  });
  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: api.categories,
    staleTime: 60 * 60_000,
  });

  if (profile.isError) {
    return <ErrorState message={t("loadFailed")} onRetry={() => void profile.refetch()} />;
  }
  const data = profile.data;
  const categoryName = (key: string) =>
    categories.data?.find((category) => category.key === key)?.name ?? key;

  return (
    <div className="space-y-6">
      <section className="grain relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-card">
        <CourtLines className="opacity-[0.05]" />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-primary/15 blur-3xl"
        />
        {data ? (
          <div className="relative flex items-center gap-4">
            <motion.span layoutId={own ? "avatar-me" : undefined} className="rounded-full">
              <Avatar name={data.player.name} src={data.player.photoUrl} size="xl" />
            </motion.span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <h2 className="font-display text-headline leading-tight font-semibold">
                {data.player.name}
              </h2>
              {data.player.membershipId ? (
                <p className="num text-small text-muted-foreground">
                  {t("membership", { id: formatMembershipId(data.player.membershipId) })}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {data.player.categories.map((key) => (
                  <Badge key={key} className="h-6 px-2.5">
                    {categoryName(key)}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="relative flex items-center gap-4">
            <Skeleton className="size-[88px] rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        )}

        <div className="relative mt-5 flex items-end justify-between gap-3">
          {data ? (
            <div>
              <SectionLabel>{t("elo")}</SectionLabel>
              <div className="flex items-end gap-2">
                <NumberTicker
                  value={data.player.elo}
                  from={data.player.elo - data.trend}
                  className="font-display text-hero leading-none font-bold tracking-tight"
                />
                <span
                  className={cn(
                    "mb-1.5 inline-flex h-7 items-center rounded-full px-2.5 num text-caption font-semibold",
                    data.trend > 0
                      ? "bg-ball text-on-color"
                      : data.trend < 0
                        ? "bg-danger-soft text-danger-ink"
                        : "bg-surface-2 text-muted-foreground",
                  )}
                  title={club ? t("trend", { days: club.settings.rankingTrendDays }) : undefined}
                >
                  {formatDelta(data.trend)}
                </span>
              </div>
            </div>
          ) : (
            <Skeleton className="h-16 w-40" />
          )}
          {data ? (
            <Badge tone="neutral" className="mb-1">
              <Trophy aria-hidden /> <span className="num">#{data.rank}</span>
            </Badge>
          ) : null}
        </div>
      </section>

      {data ? (
        <div className="grid grid-cols-3 gap-2">
          <Stat value={data.wins} label={t("wins")} />
          <Stat value={data.losses} label={t("losses")} />
          <Stat value={data.winRate} label={t("winRate")} suffix="%" />
        </div>
      ) : (
        <Skeleton className="h-[4.5rem] rounded-lg" />
      )}

      {!own && user?.role === "MEMBER" && data ? (
        <ButtonLink href={`/app/ranking/h2h?a=${user.id}&b=${userId}`} variant="secondary" block>
          <Swords /> {t("compare", { name: data.player.name.split(" ")[0] ?? data.player.name })}
        </ButtonLink>
      ) : null}

      <section className="space-y-3" aria-label={t("history")}>
        <SectionLabel>{t("history")}</SectionLabel>
        <Card className="p-3">
          {history.data && data ? (
            history.data.length > 1 ? (
              <EloChart
                label={t("chartLabel", { name: data.player.name })}
                series={[
                  {
                    key: "elo",
                    label: data.player.name,
                    color: "var(--ball-ink)",
                    points: history.data,
                  },
                ]}
              />
            ) : (
              <p className="px-2 py-8 text-center text-small text-muted-foreground">
                {t("noHistory")}
              </p>
            )
          ) : (
            <Skeleton className="h-56" />
          )}
        </Card>
      </section>

      <TitlesList userId={userId} />

      <section className="space-y-3" aria-label={t("recent")}>
        <SectionLabel>{t("recent")}</SectionLabel>
        {!data ? (
          <Skeleton className="h-[7.5rem] rounded-lg" />
        ) : data.recentMatches.length === 0 ? (
          <EmptyState icon={Swords} title={t("noMatches")} />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {data.recentMatches.map((match, index) => (
              <motion.li
                key={match.id}
                custom={index}
                variants={listItemVariants}
                initial="hidden"
                animate="show"
              >
                <MatchCard match={match} onOpen={() => router.push(`/app/matches/${match.id}`)} />
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      {extra}
    </div>
  );
}
