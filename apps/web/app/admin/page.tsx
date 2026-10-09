"use client";

import type { FreezeDetail } from "@ficc/shared";
import { useQuery } from "@tanstack/react-query";
import { Ban, ChevronRight, CloudRain, Plus, Wrench } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { AdminHeader } from "@/components/admin/admin-header";
import { FreezeDetailSheet } from "@/components/admin/freeze-detail-sheet";
import { FreezeFormSheet } from "@/components/admin/freeze-form-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { enter, listItemVariants, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useFormat } from "@/lib/use-format";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

type FreezeState = "active" | "scheduled" | "ended";

function stateOf(freeze: FreezeDetail, now: Date): FreezeState {
  if (freeze.liftedAt || (freeze.endsAt && Date.parse(freeze.endsAt) <= now.getTime()))
    return "ended";
  return Date.parse(freeze.startsAt) > now.getTime() ? "scheduled" : "active";
}

function FreezeCard({
  freeze,
  state,
  index,
  onOpen,
}: {
  freeze: FreezeDetail;
  state: FreezeState;
  index: number;
  onOpen: () => void;
}) {
  const t = useTranslations("admin.freezes");
  const labels = useTranslations("labels");
  const format = useFormat();
  const affected = freeze.affected.bookings.length + freeze.affected.lessons.length;
  const Icon = freeze.reason === "RAIN" ? CloudRain : Wrench;
  return (
    <motion.li custom={index} variants={listItemVariants} initial={enter("hidden")} animate="show">
      <motion.button
        type="button"
        whileTap={tap}
        onClick={onOpen}
        className={cn(
          "flex w-full items-center gap-4 rounded-lg border p-4 text-left shadow-card transition-tokens",
          state === "ended"
            ? "border-border bg-card/60 hover:bg-surface-2"
            : "border-warning/40 bg-card striped hover:bg-surface-2",
        )}
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-ink">
          <Icon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{labels(`freezeReason.${freeze.reason}`)}</span>
            <Badge
              tone={state === "active" ? "warning" : state === "scheduled" ? "neutral" : "neutral"}
              className="h-6 px-2"
            >
              {t(`state.${state}`)}
            </Badge>
          </span>
          <span className="block truncate text-small">{freeze.courtNames.join(", ")}</span>
          <span className="block truncate text-caption text-muted-foreground">
            {freeze.endsAt
              ? t("window", {
                  from: format.dateTime(freeze.startsAt),
                  to: format.dateTime(freeze.endsAt),
                })
              : t("windowOpen", { from: format.dateTime(freeze.startsAt) })}
            {state !== "ended" && affected > 0
              ? ` · ${t("affectedCount", { count: affected })}`
              : ""}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </motion.button>
    </motion.li>
  );
}

/** Rain and maintenance: freeze courts, see what is affected, bulk cancel, lift. */
export default function AdminFreezesPage() {
  const t = useTranslations("admin.freezes");
  const now = useNow();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const courts = useQuery({
    queryKey: queryKeys.courts,
    queryFn: api.courts,
    staleTime: 60 * 60_000,
  });
  const freezes = useQuery({ queryKey: queryKeys.admin.freezes, queryFn: api.admin.freezes });
  const list = (freezes.data ?? []).map((freeze) => ({ freeze, state: stateOf(freeze, now) }));
  const current = list.filter((entry) => entry.state !== "ended");
  const past = list.filter((entry) => entry.state === "ended");

  return (
    <>
      <AdminHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> {t("new")}
          </Button>
        }
      />
      <div className="mt-6 space-y-7">
        {freezes.isError ? (
          <ErrorState onRetry={() => void freezes.refetch()} />
        ) : freezes.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
          </div>
        ) : (
          <>
            <section className="space-y-3" aria-label={t("current")}>
              <SectionLabel>{t("current")}</SectionLabel>
              {current.length === 0 ? (
                <EmptyState
                  icon={Ban}
                  title={t("emptyTitle")}
                  description={t("emptyDescription")}
                />
              ) : (
                <ul className="grid gap-3 lg:grid-cols-2">
                  {current.map(({ freeze, state }, index) => (
                    <FreezeCard
                      key={freeze.id}
                      freeze={freeze}
                      state={state}
                      index={index}
                      onOpen={() => setOpenId(freeze.id)}
                    />
                  ))}
                </ul>
              )}
            </section>
            {past.length > 0 ? (
              <section className="space-y-3" aria-label={t("past")}>
                <SectionLabel>{t("past")}</SectionLabel>
                <ul className="grid gap-3 lg:grid-cols-2">
                  {past.map(({ freeze, state }, index) => (
                    <FreezeCard
                      key={freeze.id}
                      freeze={freeze}
                      state={state}
                      index={index}
                      onOpen={() => setOpenId(freeze.id)}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
      <FreezeFormSheet
        open={creating}
        onOpenChange={setCreating}
        courts={courts.data?.courts ?? []}
        onCreated={(id) => {
          setCreating(false);
          setOpenId(id);
        }}
      />
      <FreezeDetailSheet id={openId} onOpenChange={(open) => !open && setOpenId(null)} />
    </>
  );
}
