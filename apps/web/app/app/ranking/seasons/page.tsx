"use client";

import { useQuery } from "@tanstack/react-query";
import { History, Trophy } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { BackButton } from "@/components/shell/back-button";
import { PageHeader } from "@/components/shell/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { enter, listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useFormat } from "@/lib/use-format";

/** Closed ranking seasons, newest first, each with its podium. */
export default function SeasonsPage() {
  const t = useTranslations("seasons");
  const format = useFormat();
  const seasons = useQuery({ queryKey: queryKeys.seasons, queryFn: api.ranking.seasons });
  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        leading={<BackButton fallback="/app/ranking" />}
      />
      <div className="mx-auto mt-5 max-w-2xl space-y-3">
        {seasons.isError ? (
          <ErrorState message={t("loadFailed")} onRetry={() => void seasons.refetch()} />
        ) : !seasons.data ? (
          [0, 1, 2].map((key) => <Skeleton key={key} className="h-28 rounded-lg" />)
        ) : seasons.data.length === 0 ? (
          <EmptyState icon={History} title={t("empty")} description={t("emptyDescription")} />
        ) : (
          <ul className="space-y-3">
            {seasons.data.map((item, index) => (
              <motion.li
                key={item.season.id}
                custom={index}
                variants={listItemVariants}
                initial={enter("hidden")}
                animate="show"
              >
                <Link
                  href={`/app/ranking/seasons/${item.season.id}`}
                  className="block space-y-3 rounded-lg border border-border bg-card p-4 transition-tokens hover:bg-surface-2"
                >
                  <div>
                    <p className="font-display text-title font-semibold">{item.season.name}</p>
                    <p className="text-caption text-muted-foreground">
                      {t("period", {
                        from: format.day(item.season.startsAt.slice(0, 10)),
                        to: format.day((item.season.closedAt ?? item.season.startsAt).slice(0, 10)),
                      })}
                    </p>
                  </div>
                  {item.podium.length === 0 ? (
                    <p className="text-small text-muted-foreground">{t("noGames")}</p>
                  ) : (
                    <ol className="space-y-1.5">
                      {item.podium.map((entry) => (
                        <li key={entry.player.id} className="flex items-center gap-2 text-small">
                          <Trophy
                            className={
                              entry.rank === 1
                                ? "size-4 text-ball-ink"
                                : "size-4 text-muted-foreground"
                            }
                            aria-hidden
                          />
                          <span className="w-6 num font-semibold">{entry.rank}º</span>
                          <Avatar name={entry.player.name} src={entry.player.photoUrl} size="xs" />
                          <span className="min-w-0 flex-1 truncate">{entry.player.name}</span>
                          <span className="num text-muted-foreground">{entry.elo}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
