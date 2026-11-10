"use client";

import { useQuery } from "@tanstack/react-query";
import { use } from "react";
import { useTranslations } from "next-intl";

import { useSession } from "@/components/providers/session-provider";
import { SeasonRow } from "@/components/ranking/season-row";
import { BackButton } from "@/components/shell/back-button";
import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useFormat } from "@/lib/use-format";

/** The final table of one closed season. */
export default function SeasonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("seasons");
  const format = useFormat();
  const { user } = useSession();
  const season = useQuery({
    queryKey: queryKeys.season(id),
    queryFn: () => api.ranking.season(id),
  });
  const data = season.data;
  return (
    <>
      <PageHeader
        title={data?.season.name ?? t("title")}
        subtitle={
          data
            ? t("period", {
                from: format.day(data.season.startsAt.slice(0, 10)),
                to: format.day((data.season.closedAt ?? data.season.startsAt).slice(0, 10)),
              })
            : " "
        }
        leading={<BackButton fallback="/app/ranking/seasons" />}
      />
      <div className="mx-auto mt-5 max-w-2xl">
        {season.isError ? (
          <ErrorState message={t("loadFailed")} onRetry={() => void season.refetch()} />
        ) : !data ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : data.standings.length === 0 ? (
          <p className="text-small text-muted-foreground">{t("noGames")}</p>
        ) : (
          <ol className="space-y-2">
            {data.standings.map((entry, index) => (
              <SeasonRow
                key={entry.player.id}
                entry={entry}
                index={index}
                mine={entry.player.id === user?.id}
              />
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
