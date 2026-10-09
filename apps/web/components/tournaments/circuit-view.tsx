"use client";

import { PLACEMENTS } from "@ficc/shared";
import { useQuery } from "@tanstack/react-query";
import { ListOrdered } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useSession } from "@/components/providers/session-provider";
import { Avatar } from "@/components/ui/avatar";
import { Card, SectionLabel } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { enter, listItemVariants, spring } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";

import { CategoryChips, StatusBadge } from "./tournament-panels";

/** Circuit ranking by category, its stages and the points table. */
export function CircuitView({
  circuitId,
  stageHref,
}: {
  circuitId: string;
  stageHref: (id: string) => string;
}) {
  const t = useTranslations("tournaments.circuit");
  const placements = useTranslations("tournaments.placement");
  const format = useFormat();
  const { user } = useSession();
  const circuit = useQuery({
    queryKey: queryKeys.circuit(circuitId),
    queryFn: () => api.circuits.get(circuitId),
  });
  const [categoryId, setCategoryId] = useState<string | null>(null);

  if (circuit.isError)
    return <ErrorState message={t("loadFailed")} onRetry={() => void circuit.refetch()} />;
  if (!circuit.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }
  const data = circuit.data;
  const ranking =
    data.rankings.find((entry) => entry.categoryId === categoryId) ?? data.rankings[0];
  const stages = [...data.stages].sort((x, y) => x.startDate.localeCompare(y.startDate));

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionLabel>{t("ranking")}</SectionLabel>
        <CategoryChips
          categories={data.rankings.map((entry) => ({
            id: entry.categoryId,
            name: entry.categoryName,
          }))}
          value={ranking?.categoryId ?? null}
          onChange={setCategoryId}
        />
        {!ranking || ranking.standings.length === 0 ? (
          <EmptyState
            icon={ListOrdered}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[22rem] text-small">
              <thead>
                <tr className="text-caption text-muted-foreground">
                  <th className="w-12 px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">{t("player")}</th>
                  {stages.map((stage, index) => (
                    <th
                      key={stage.tournamentId}
                      className="w-14 px-2 py-2 text-center font-medium"
                      title={stage.name}
                    >
                      {t("stageShort", { number: index + 1 })}
                    </th>
                  ))}
                  <th className="w-16 px-3 py-2 text-right font-medium">{t("total")}</th>
                </tr>
              </thead>
              <tbody>
                {ranking.standings.map((row, index) => (
                  <motion.tr
                    key={row.playerKey}
                    layout="position"
                    transition={spring.gentle}
                    custom={index}
                    variants={listItemVariants}
                    initial={enter("hidden")}
                    animate="show"
                    className={cn(
                      "border-t border-border",
                      row.userId && row.userId === user?.id && "bg-ball-soft",
                    )}
                  >
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex size-7 items-center justify-center rounded-full num text-caption font-semibold",
                          row.position === 1
                            ? "bg-gold text-on-color"
                            : row.position <= 3
                              ? "bg-primary/20 text-foreground"
                              : "bg-surface-2 text-muted-foreground",
                        )}
                      >
                        {row.position}
                      </span>
                    </td>
                    <td className="max-w-0 px-3 py-2">
                      <span className="flex items-center gap-2">
                        <Avatar name={row.name} src={row.photoUrl} size="xs" />
                        <span className="truncate">{row.name}</span>
                      </span>
                    </td>
                    {stages.map((stage) => (
                      <td
                        key={stage.tournamentId}
                        className="px-2 py-2 text-center num text-muted-foreground"
                      >
                        {row.stages[stage.tournamentId] ?? "–"}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right num font-semibold">{row.total}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <SectionLabel>{t("stages")}</SectionLabel>
        {stages.length === 0 ? (
          <p className="text-small text-muted-foreground">{t("noStages")}</p>
        ) : (
          <ol className="space-y-2">
            {stages.map((stage, index) => (
              <li key={stage.tournamentId}>
                <Link
                  href={stageHref(stage.tournamentId)}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:border-border-strong"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-surface-2 num text-caption font-semibold">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-medium">{stage.name}</span>
                    <span className="block text-caption text-muted-foreground">
                      {format.dayTitle(stage.startDate)}
                    </span>
                  </span>
                  <StatusBadge status={stage.status} />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-3">
        <SectionLabel>{t("points")}</SectionLabel>
        <Card className="divide-y divide-border p-0">
          {PLACEMENTS.map((placement) => (
            <div
              key={placement}
              className="flex items-center justify-between px-4 py-2.5 text-small"
            >
              <span>{placements(placement)}</span>
              <span className="num font-semibold">{data.pointsTable[placement]}</span>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
