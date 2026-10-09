"use client";

import type { EntrySummary, TournamentCategoryInfo, TournamentMatchView } from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Settings2, Share2, X } from "lucide-react";
import { motion } from "motion/react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/components/providers/session-provider";
import { BackButton } from "@/components/shell/back-button";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { MatchRow } from "@/components/tournaments/match-row";
import { EditEntrySheet, RegisterSheet } from "@/components/tournaments/register-sheet";
import { ScoreSheet } from "@/components/tournaments/score-sheet";
import {
  DrawPanel,
  EntriesPanel,
  InfoPanel,
  ResultsPanel,
  SchedulePanel,
  TabBar,
  TournamentHero,
} from "@/components/tournaments/tournament-panels";
import { api } from "@/lib/api";
import { enter, listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { ACTIVE_ENTRY, ENTRY_TONE, invalidateTournament } from "@/lib/tournaments";
import { useErrorMessage } from "@/lib/use-error-message";

const TABS = ["info", "entries", "draw", "schedule", "results"] as const;
type Tab = (typeof TABS)[number];

function MyEntryCard({
  entry,
  category,
  onEdit,
  onWithdraw,
  tournamentId,
  closed,
}: {
  entry: EntrySummary;
  category: TournamentCategoryInfo | undefined;
  onEdit: () => void;
  onWithdraw: () => void;
  tournamentId: string;
  /** Finished or cancelled: nothing left to change. */
  closed: boolean;
}) {
  const t = useTranslations("tournaments.mine");
  const statuses = useTranslations("tournaments.entryStatus");
  const payments = useTranslations("tournaments.payment");
  const { user } = useSession();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const me = entry.players.find((player) => player.userId === user?.id);
  const invited = entry.status === "PENDING_PARTNER" && me && !me.accepted;
  const partner = entry.players.find((player) => player.userId !== user?.id);

  const accept = useMutation({
    mutationFn: () => api.tournamentEntries.accept(entry.id),
    onSuccess: () => {
      toast.success(t("accepted"));
      void invalidateTournament(client, tournamentId);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const decline = useMutation({
    mutationFn: () => api.tournamentEntries.decline(entry.id),
    onSuccess: () => {
      toast(t("declined"));
      void invalidateTournament(client, tournamentId);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-title font-semibold">{category?.name}</p>
          <p className="truncate text-small text-muted-foreground">
            {partner ? t("withPartner", { name: partner.name }) : entry.name}
            {entry.seed ? ` · ${t("seed", { seed: entry.seed })}` : ""}
          </p>
        </div>
        <Badge tone={ENTRY_TONE[entry.status]}>{statuses(entry.status)}</Badge>
      </div>
      {entry.paymentStatus !== "EXEMPT" ? (
        <p className="text-caption text-muted-foreground">{payments(entry.paymentStatus)}</p>
      ) : null}
      {invited ? (
        <div className="flex gap-2">
          <Button size="sm" loading={accept.isPending} onClick={() => accept.mutate()}>
            <Check />
            {t("accept")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={decline.isPending}
            onClick={() => decline.mutate()}
          >
            <X />
            {t("decline")}
          </Button>
        </div>
      ) : ACTIVE_ENTRY.has(entry.status) && !closed ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onEdit}>
            <Pencil />
            {t("edit")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onWithdraw}>
            {t("withdraw")}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function TournamentScreen() {
  const t = useTranslations("tournaments");
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const client = useQueryClient();
  const { user } = useSession();
  const errorMessage = useErrorMessage();
  const initialTab = TABS.find((tab) => tab === search.get("tab")) ?? "info";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [categoryId, setCategoryId] = useState<string | null>(search.get("category"));
  const [registerFor, setRegisterFor] = useState<TournamentCategoryInfo | null>(null);
  const [editing, setEditing] = useState<EntrySummary | null>(null);
  const [withdrawing, setWithdrawing] = useState<EntrySummary | null>(null);
  const [openMatch, setOpenMatch] = useState<TournamentMatchView | null>(null);
  const [mineOnly, setMineOnly] = useState(false);

  const detail = useQuery({
    queryKey: queryKeys.tournaments.detail(id),
    queryFn: () => api.tournaments.get(id),
  });
  const tournament = detail.data;
  const category =
    tournament?.categories.find((entry) => entry.id === categoryId) ??
    tournament?.categories[0] ??
    null;
  const needsDraw = (tab === "draw" || tab === "results") && category?.drawPublished;
  const draw = useQuery({
    queryKey: queryKeys.tournaments.draw(id, category?.id ?? ""),
    queryFn: () => api.tournaments.draw(id, category!.id),
    enabled: Boolean(needsDraw),
  });
  const orderOfPlay = useQuery({
    queryKey: queryKeys.tournaments.orderOfPlay(id),
    queryFn: () => api.tournaments.orderOfPlay(id),
    enabled: tab === "schedule",
  });
  const mine = useQuery({ queryKey: queryKeys.tournaments.mine, queryFn: api.tournaments.mine });
  const myItems = (mine.data ?? []).filter((item) => item.tournament.id === id);

  const withdraw = useMutation({
    mutationFn: (entry: EntrySummary) => api.tournamentEntries.withdraw(entry.id),
    onSuccess: () => {
      toast(t("mine.withdrawn"));
      setWithdrawing(null);
      void invalidateTournament(client, id);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  function changeTab(next: Tab) {
    setTab(next);
    const params = new URLSearchParams(search.toString());
    params.set("tab", next);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  async function share() {
    if (!tournament) return;
    const url = `${window.location.origin}/t/${tournament.publicId}`;
    try {
      if (navigator.share) await navigator.share({ title: tournament.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success(t("linkCopied"));
      }
    } catch {
      // The person closed the share sheet.
    }
  }

  const scoreFormat =
    tournament?.categories.find((entry) => entry.id === openMatch?.categoryId)?.scoreFormat ??
    "BEST_OF_3_MATCH_TIEBREAK";

  return (
    <>
      <PageHeader
        title={tournament?.name ?? t("title")}
        leading={<BackButton fallback="/app/tournaments" />}
        actions={
          tournament ? (
            <>
              {tournament.status !== "DRAFT" ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("share")}
                  onClick={() => void share()}
                >
                  <Share2 />
                </Button>
              ) : null}
              {tournament.canManage ? (
                <ButtonLink href={`/app/tournaments/${id}/manage`} variant="secondary" size="sm">
                  <Settings2 />
                  {t("manage")}
                </ButtonLink>
              ) : null}
            </>
          ) : null
        }
      />
      <div className="mx-auto mt-5 max-w-5xl space-y-6 pb-6">
        {detail.isError ? (
          <ErrorState message={t("loadFailed")} onRetry={() => void detail.refetch()} />
        ) : !tournament ? (
          <div className="space-y-4">
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-11 rounded-md" />
            <Skeleton className="h-64 rounded-lg" />
          </div>
        ) : (
          <>
            <TournamentHero tournament={tournament} />

            {tournament.myEntries.length > 0 || myItems.some((item) => item.nextMatch) ? (
              <section className="space-y-3">
                <SectionLabel>{t("mine.title")}</SectionLabel>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {myItems
                    .filter((item) => item.nextMatch)
                    .map((item, index) => (
                      <motion.div
                        key={item.nextMatch!.id}
                        custom={index}
                        variants={listItemVariants}
                        initial={enter("hidden")}
                        animate="show"
                      >
                        <MatchRow
                          match={item.nextMatch!}
                          viewerId={user?.id}
                          onOpen={setOpenMatch}
                          actions={
                            item.nextMatch!.viewer.canReport ||
                            item.nextMatch!.viewer.canConfirm ? (
                              <Button size="sm" onClick={() => setOpenMatch(item.nextMatch)}>
                                {item.nextMatch!.viewer.canConfirm
                                  ? t("mine.confirmScore")
                                  : t("mine.reportScore")}
                              </Button>
                            ) : null
                          }
                        />
                      </motion.div>
                    ))}
                  {tournament.myEntries.map((entry) => (
                    <MyEntryCard
                      key={entry.id}
                      entry={entry}
                      tournamentId={id}
                      closed={tournament.status === "FINISHED" || tournament.status === "CANCELLED"}
                      category={tournament.categories.find((item) => item.id === entry.categoryId)}
                      onEdit={() => setEditing(entry)}
                      onWithdraw={() => setWithdrawing(entry)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <div className="sticky top-16 z-20 -mx-4 border-b border-border glass px-4 md:-mx-8 md:px-8">
              <TabBar
                label={t("tabsLabel")}
                tabs={TABS.map((value) => ({ value, label: t(`tabs.${value}`) }))}
                value={tab}
                onChange={changeTab}
              />
            </div>

            {tab === "info" ? (
              <InfoPanel
                tournament={tournament}
                categoryAction={(item) => {
                  const entry = tournament.myEntries.find(
                    (mineEntry) =>
                      mineEntry.categoryId === item.id && ACTIVE_ENTRY.has(mineEntry.status),
                  );
                  if (entry) return null;
                  if (!tournament.registrationOpen) return null;
                  return (
                    <Button size="sm" block onClick={() => setRegisterFor(item)}>
                      {item.confirmedEntries >= item.maxEntries
                        ? t("register.joinWaitlist")
                        : t("register.cta")}
                    </Button>
                  );
                }}
              />
            ) : tab === "entries" ? (
              <EntriesPanel
                tournament={tournament}
                categoryId={category?.id ?? null}
                onCategory={setCategoryId}
              />
            ) : tab === "draw" ? (
              <DrawPanel
                categories={tournament.categories}
                categoryId={category?.id ?? null}
                onCategory={setCategoryId}
                draw={draw.data}
                loading={draw.isLoading}
                onOpenMatch={setOpenMatch}
              />
            ) : tab === "schedule" ? (
              <div className="space-y-4">
                {tournament.myEntries.length > 0 ? (
                  <Button
                    size="sm"
                    variant={mineOnly ? "primary" : "secondary"}
                    aria-pressed={mineOnly}
                    onClick={() => setMineOnly((value) => !value)}
                  >
                    {t("schedule.mineOnly")}
                  </Button>
                ) : null}
                <SchedulePanel
                  days={orderOfPlay.data}
                  loading={orderOfPlay.isLoading}
                  viewerId={user?.id}
                  mineOnly={mineOnly}
                  onOpenMatch={setOpenMatch}
                />
              </div>
            ) : (
              <ResultsPanel
                categories={tournament.categories}
                categoryId={category?.id ?? null}
                onCategory={setCategoryId}
                draw={draw.data}
                loading={draw.isLoading}
                viewerId={user?.id}
                onOpenMatch={setOpenMatch}
              />
            )}

            <RegisterSheet
              tournament={tournament}
              category={registerFor}
              onOpenChange={(open) => !open && setRegisterFor(null)}
            />
            <EditEntrySheet
              tournament={tournament}
              entry={editing}
              onOpenChange={(open) => !open && setEditing(null)}
            />
            <ScoreSheet
              match={openMatch}
              format={scoreFormat}
              canManage={tournament.canManage}
              onOpenChange={(open) => !open && setOpenMatch(null)}
            />
            <Sheet
              open={withdrawing !== null}
              onOpenChange={(open) => !open && setWithdrawing(null)}
              title={t("mine.withdrawTitle")}
              description={t("mine.withdrawDescription")}
              footer={
                <div className="flex flex-col gap-2">
                  <Button
                    variant="danger"
                    size="lg"
                    block
                    loading={withdraw.isPending}
                    onClick={() => withdrawing && withdraw.mutate(withdrawing)}
                  >
                    {t("mine.withdrawConfirm")}
                  </Button>
                  <Button variant="ghost" block onClick={() => setWithdrawing(null)}>
                    {t("mine.keep")}
                  </Button>
                </div>
              }
            >
              {null}
            </Sheet>
          </>
        )}
      </div>
    </>
  );
}

export default function TournamentPage() {
  return (
    <Suspense>
      <TournamentScreen />
    </Suspense>
  );
}
