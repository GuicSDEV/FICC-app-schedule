"use client";

import type { TournamentListQuery } from "@ficc/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListOrdered, Trophy } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { NotificationBell } from "@/components/shell/notification-bell";
import { PageHeader } from "@/components/shell/page-header";
import { UserAvatarLink } from "@/components/shell/user-avatar-link";
import { SectionLabel } from "@/components/ui/card";
import { ChoiceChip } from "@/components/ui/choice-chip";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TournamentCard } from "@/components/tournaments/tournament-card";
import { api } from "@/lib/api";
import { enter, listItemVariants, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";

type Filter = NonNullable<TournamentListQuery["status"]>;
const FILTERS: Filter[] = ["OPEN", "UPCOMING", "IN_PROGRESS", "FINISHED"];

export default function TournamentsPage() {
  const t = useTranslations("tournaments");
  const client = useQueryClient();
  const [filter, setFilter] = useState<Filter>("OPEN");
  const [category, setCategory] = useState<string | null>(null);
  const list = useQuery({
    queryKey: queryKeys.tournaments.list(filter),
    queryFn: () => api.tournaments.list({ status: filter }),
  });
  const circuits = useQuery({
    queryKey: queryKeys.circuits,
    queryFn: api.circuits.list,
    staleTime: 5 * 60_000,
  });

  const names = [
    ...new Set((list.data ?? []).flatMap((item) => item.categories.map((entry) => entry.name))),
  ].sort();
  const shown = (list.data ?? []).filter(
    (item) => !category || item.categories.some((entry) => entry.name === category),
  );

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <NotificationBell />
            <UserAvatarLink href="/app/profile" />
          </>
        }
      />
      <PullToRefresh
        onRefresh={() => client.invalidateQueries({ queryKey: queryKeys.tournaments.root })}
      >
        <div className="mx-auto mt-5 max-w-5xl space-y-5 pb-6">
          <SegmentedControl
            label={t("filterLabel")}
            options={FILTERS.map((value) => ({ value, label: t(`filters.${value}`) }))}
            value={filter}
            onChange={(next) => {
              setFilter(next);
              setCategory(null);
            }}
          />
          {names.length > 1 ? (
            <div
              role="group"
              aria-label={t("categories")}
              className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4"
            >
              <ChoiceChip selected={category === null} onClick={() => setCategory(null)}>
                {t("allCategories")}
              </ChoiceChip>
              {names.map((name) => (
                <ChoiceChip
                  key={name}
                  selected={category === name}
                  onClick={() => setCategory(name)}
                >
                  {name}
                </ChoiceChip>
              ))}
            </div>
          ) : null}

          {list.isError ? (
            <ErrorState message={t("loadFailed")} onRetry={() => void list.refetch()} />
          ) : list.isLoading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Skeleton className="h-44 rounded-lg" />
              <Skeleton className="h-44 rounded-lg" />
            </div>
          ) : shown.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title={t(`empty.${filter}`)}
              description={t("emptyDescription")}
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {shown.map((tournament, index) => (
                <motion.li
                  key={tournament.id}
                  custom={index}
                  variants={listItemVariants}
                  initial={enter("hidden")}
                  animate="show"
                >
                  <TournamentCard
                    tournament={tournament}
                    href={`/app/tournaments/${tournament.id}`}
                  />
                </motion.li>
              ))}
            </ul>
          )}

          {(circuits.data ?? []).length > 0 ? (
            <section className="space-y-3 pt-2">
              <SectionLabel>{t("circuits")}</SectionLabel>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {circuits.data!.map((circuit) => (
                  <li key={circuit.id}>
                    <motion.div whileTap={tap} tabIndex={-1}>
                      <Link
                        href={`/app/circuits/${circuit.id}`}
                        className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-card hover:border-border-strong"
                      >
                        <span className="flex size-10 items-center justify-center rounded-full bg-lesson-soft text-lesson-ink">
                          <ListOrdered className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{circuit.name}</span>
                          <span className="block text-caption text-muted-foreground">
                            {t("circuitStages", {
                              season: circuit.season,
                              count: circuit.stages.length,
                            })}
                          </span>
                        </span>
                      </Link>
                    </motion.div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </PullToRefresh>
    </>
  );
}
