"use client";

import type { TournamentDetail, TournamentMatchView } from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Send, Shuffle, Trophy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { haptic } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { invalidateTournament } from "@/lib/tournaments";
import { useErrorMessage } from "@/lib/use-error-message";

import { BracketView } from "../bracket-view";
import { GroupsView } from "../groups-view";
import { CategoryChips } from "../tournament-panels";

/** Generate, adjust (swap two entries) and publish each category's draw. */
export function DrawManager({
  tournament,
  onOpenMatch,
}: {
  tournament: TournamentDetail;
  onOpenMatch: (match: TournamentMatchView) => void;
}) {
  const t = useTranslations("tournaments.drawManager");
  const seeding = useTranslations("tournaments.categoryForm");
  const drawFormats = useTranslations("tournaments.drawFormat");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const [categoryId, setCategoryId] = useState<string | null>(tournament.categories[0]?.id ?? null);
  const [swapping, setSwapping] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const category =
    tournament.categories.find((item) => item.id === categoryId) ?? tournament.categories[0];
  const draw = useQuery({
    queryKey: queryKeys.tournaments.draw(tournament.id, category?.id ?? ""),
    queryFn: () => api.tournaments.draw(tournament.id, category!.id),
    enabled: Boolean(category?.drawGenerated),
  });

  const settle = (message: string) => (view: Awaited<ReturnType<typeof api.tournaments.draw>>) => {
    toast.success(message);
    client.setQueryData(queryKeys.tournaments.draw(tournament.id, view.category.id), view);
    void invalidateTournament(client, tournament.id);
  };
  const generate = useMutation({
    mutationFn: () => api.tournaments.generateDraw(tournament.id, category!.id),
    onSuccess: (view) => {
      haptic([10, 30, 10]);
      setConfirmRegenerate(false);
      settle(t("generated"))(view);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const swap = useMutation({
    mutationFn: ({ a, b }: { a: string; b: string }) =>
      api.tournaments.swapDraw(tournament.id, category!.id, a, b),
    onSuccess: settle(t("swapped")),
    onError: (failure) => toast.error(errorMessage(failure)),
    onSettled: () => setPicked(null),
  });
  const publish = useMutation({
    mutationFn: () => api.tournaments.publishDraw(tournament.id, category!.id),
    onSuccess: (view) => {
      haptic([12, 40, 12]);
      setSwapping(false);
      settle(t("published"))(view);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  function pick(entryId: string) {
    if (!picked) {
      setPicked(entryId);
      return;
    }
    if (picked === entryId) {
      setPicked(null);
      return;
    }
    swap.mutate({ a: picked, b: entryId });
  }

  if (!category) return <EmptyState icon={Trophy} title={t("noCategories")} />;
  const published = category.drawPublished;

  return (
    <div className="space-y-4">
      <CategoryChips
        categories={tournament.categories}
        value={category.id}
        onChange={(id) => {
          setCategoryId(id);
          setSwapping(false);
          setPicked(null);
        }}
      />
      <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
        <span>{drawFormats(category.drawFormat)}</span>·
        <span>
          {category.seeding === "ELO" ? seeding("seedingElo") : seeding("seedingCircuit")}
        </span>
        ·<span>{t("entries", { count: category.confirmedEntries })}</span>
        {published ? (
          <Badge tone="success">{t("isPublished")}</Badge>
        ) : category.drawGenerated ? (
          <Badge tone="warning">{t("isDraft")}</Badge>
        ) : null}
      </div>

      {!published ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={category.drawGenerated ? "secondary" : "primary"}
            loading={generate.isPending}
            disabled={category.confirmedEntries < 2}
            onClick={() =>
              category.drawGenerated ? setConfirmRegenerate(true) : generate.mutate()
            }
          >
            <Shuffle />
            {category.drawGenerated ? t("regenerate") : t("generate")}
          </Button>
          {category.drawGenerated ? (
            <>
              <Button
                size="sm"
                variant={swapping ? "primary" : "secondary"}
                aria-pressed={swapping}
                onClick={() => {
                  setSwapping((value) => !value);
                  setPicked(null);
                }}
              >
                <ArrowLeftRight />
                {t("swap")}
              </Button>
              <Button size="sm" loading={publish.isPending} onClick={() => publish.mutate()}>
                <Send />
                {t("publish")}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      {swapping ? (
        <p
          className="rounded-md bg-ball-soft px-4 py-3 text-small text-ball-ink"
          aria-live="polite"
        >
          {picked ? t("swapPickSecond") : t("swapPickFirst")}
        </p>
      ) : null}

      {!category.drawGenerated ? (
        <EmptyState
          icon={Shuffle}
          title={t("emptyTitle")}
          description={category.confirmedEntries < 2 ? t("needEntries") : t("emptyDescription")}
        />
      ) : draw.isError ? (
        <ErrorState onRetry={() => void draw.refetch()} />
      ) : !draw.data ? (
        <Skeleton className="h-80 rounded-lg" />
      ) : (
        <div className="space-y-6">
          {draw.data.groups.length > 0 ? (
            <section className="space-y-3">
              <SectionLabel>{t("groups")}</SectionLabel>
              <GroupsView
                groups={draw.data.groups}
                advancePerGroup={category.advancePerGroup}
                onOpenMatch={published ? onOpenMatch : undefined}
                selectable={swapping}
                selectedEntry={picked}
                onSelectEntry={pick}
              />
            </section>
          ) : null}
          {draw.data.rounds.length > 0 ? (
            <section className="space-y-3">
              <SectionLabel>{t("knockout")}</SectionLabel>
              <BracketView
                draw={draw.data}
                onOpenMatch={published && !swapping ? onOpenMatch : undefined}
                selectable={swapping && draw.data.groups.length === 0}
                selectedEntry={picked}
                onSelectEntry={pick}
              />
            </section>
          ) : null}
        </div>
      )}

      <Sheet
        open={confirmRegenerate}
        onOpenChange={setConfirmRegenerate}
        title={t("regenerateTitle")}
        description={t("regenerateDescription")}
        footer={
          <Button size="lg" block loading={generate.isPending} onClick={() => generate.mutate()}>
            {t("regenerate")}
          </Button>
        }
      >
        {null}
      </Sheet>
    </div>
  );
}
