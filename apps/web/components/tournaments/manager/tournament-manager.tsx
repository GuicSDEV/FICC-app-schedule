"use client";

import type { TournamentMatchView } from "@ficc/shared";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

import { ScoreSheet } from "../score-sheet";
import { TabBar } from "../tournament-panels";
import { AnnouncementsManager } from "./announcements-manager";
import { DrawManager } from "./draw-manager";
import { EntriesManager } from "./entries-manager";
import { PendingResults } from "./pending-results";
import { ScheduleBoardView } from "./schedule-board";
import { SettingsPanel } from "./settings-panel";

const TABS = ["settings", "entries", "draw", "schedule", "results", "announcements"] as const;
type Tab = (typeof TABS)[number];

/**
 * Everything an organizer runs a tournament with, for admins (/admin) and member organizers
 * (/app/…/manage) alike: the API checks who may manage each tournament.
 */
export function TournamentManager({
  tournamentId,
  duplicateHref,
  stickyTop = "top-16",
}: {
  tournamentId: string;
  duplicateHref: (id: string) => string;
  /** Offset of the sticky tab bar under the area's header. */
  stickyTop?: string;
}) {
  const t = useTranslations("tournaments.manager");
  const [tab, setTab] = useState<Tab>("settings");
  const [openMatch, setOpenMatch] = useState<TournamentMatchView | null>(null);
  const detail = useQuery({
    queryKey: queryKeys.tournaments.detail(tournamentId),
    queryFn: () => api.tournaments.get(tournamentId),
  });
  const pending = useQuery({
    queryKey: queryKeys.tournaments.pending(tournamentId),
    queryFn: () => api.tournaments.pending(tournamentId),
    enabled: Boolean(detail.data?.canManage),
    refetchInterval: 60_000,
  });
  const entries = useQuery({
    queryKey: queryKeys.tournaments.entries(tournamentId),
    queryFn: () => api.tournaments.entries(tournamentId),
    enabled: Boolean(detail.data?.canManage),
  });

  if (detail.isError)
    return <ErrorState message={t("loadFailed")} onRetry={() => void detail.refetch()} />;
  const tournament = detail.data;
  if (!tournament) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-11 rounded-md" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  if (!tournament.canManage) return <ErrorState message={t("forbidden")} />;

  const pendingCount = pending.data
    ? pending.data.overdue.length +
      pending.data.awaitingConfirmation.length +
      pending.data.frozen.length
    : 0;
  const approvals = (entries.data ?? []).filter(
    (entry) => entry.status === "PENDING_APPROVAL",
  ).length;
  const format =
    tournament.categories.find((category) => category.id === openMatch?.categoryId)?.scoreFormat ??
    "BEST_OF_3_MATCH_TIEBREAK";

  return (
    <div className="space-y-5">
      <div
        className={`sticky ${stickyTop} z-20 -mx-4 border-b border-border glass px-4 md:-mx-8 md:px-8`}
      >
        <TabBar
          label={t("tabsLabel")}
          tabs={TABS.map((value) => ({
            value,
            label: t(`tabs.${value}`),
            count: value === "results" ? pendingCount : value === "entries" ? approvals : undefined,
          }))}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === "settings" ? (
        <SettingsPanel tournament={tournament} duplicateHref={duplicateHref} />
      ) : tab === "entries" ? (
        <EntriesManager tournament={tournament} />
      ) : tab === "draw" ? (
        <DrawManager tournament={tournament} onOpenMatch={setOpenMatch} />
      ) : tab === "schedule" ? (
        <ScheduleBoardView tournament={tournament} />
      ) : tab === "results" ? (
        <PendingResults tournament={tournament} onOpenMatch={setOpenMatch} />
      ) : (
        <AnnouncementsManager tournament={tournament} />
      )}
      <ScoreSheet
        match={openMatch}
        format={format}
        canManage
        onOpenChange={(open) => !open && setOpenMatch(null)}
      />
    </div>
  );
}
