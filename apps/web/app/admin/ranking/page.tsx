"use client";

import {
  type AdminCategoryItem,
  categoryInputSchema,
  clubToday,
  type SeasonSummary,
  startSeasonSchema,
  updateSeasonSchema,
} from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Pencil, Plus, Trash2, Trophy } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminHeader } from "@/components/admin/admin-header";
import { useClub } from "@/components/providers/club-provider";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { enter, haptic, listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";
import { useIssueMessage } from "@/lib/use-issue-message";

/** The season's last day (club date) from the instant it ends (midnight after that day). */
function lastDayOf(season: SeasonSummary, timeZone: string): string {
  return season.endsAt ? clubToday(new Date(Date.parse(season.endsAt) - 1), timeZone) : "";
}

function useRefresh() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.leaderboard() });
    void client.invalidateQueries({ queryKey: queryKeys.seasons });
    void client.invalidateQueries({ queryKey: queryKeys.admin.rankingCategories });
    void client.invalidateQueries({ queryKey: queryKeys.categories });
  };
}

/** Ends the open season (table saved, ratings reset) and starts the next one. */
function NewSeasonSheet({
  open,
  hasSeason,
  onOpenChange,
}: {
  open: boolean;
  hasSeason: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("admin.ranking");
  const errorMessage = useErrorMessage();
  const issueMessage = useIssueMessage();
  const refresh = useRefresh();
  const [name, setName] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setName("");
    setEndDate("");
    setError(null);
  }, [open]);
  const input = { name, endDate: endDate || null };
  const start = useMutation({
    mutationFn: () => api.admin.startSeason(input),
    onSuccess: () => {
      haptic([10, 30, 10]);
      toast.success(t("seasonStarted"));
      refresh();
      onOpenChange(false);
    },
    onError: (failure) => setError(errorMessage(failure)),
  });
  function submit() {
    const parsed = startSeasonSchema.safeParse(input);
    if (!parsed.success) {
      setError(issueMessage(parsed.error.issues[0]));
      return;
    }
    setError(null);
    start.mutate();
  }
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={hasSeason ? t("newSeasonTitle") : t("firstSeasonTitle")}
      footer={
        <Button
          block
          size="lg"
          variant={hasSeason ? "danger" : "primary"}
          loading={start.isPending}
          onClick={submit}
        >
          {hasSeason ? t("closeAndStart") : t("startFirst")}
        </Button>
      }
    >
      <div className="space-y-4">
        <p
          className={
            hasSeason
              ? "rounded-md bg-danger-soft px-3 py-2 text-small text-danger-ink"
              : "text-small text-muted-foreground"
          }
        >
          {hasSeason ? t("resetWarning") : t("firstSeasonHint")}
        </p>
        <Field label={t("seasonName")} htmlFor="season-name">
          <Input
            id="season-name"
            value={name}
            placeholder={t("seasonNamePlaceholder")}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label={t("endDate")} hint={t("endDateHint")} htmlFor="season-end">
          <Input
            id="season-end"
            type="date"
            className="num"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </Field>
        {error ? <p className="text-small text-danger-ink">{error}</p> : null}
      </div>
    </Sheet>
  );
}

function SeasonCard() {
  const t = useTranslations("admin.ranking");
  const format = useFormat();
  const club = useClub();
  const errorMessage = useErrorMessage();
  const issueMessage = useIssueMessage();
  const refresh = useRefresh();
  const board = useQuery({
    queryKey: queryKeys.leaderboard("ALL"),
    queryFn: () => api.ranking.leaderboard(),
  });
  const season = board.data?.season ?? null;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    if (!season || !club) return;
    setName(season.name);
    setEndDate(lastDayOf(season, club.timezone));
  }, [season, club]);
  const input = { name, endDate: endDate || null };
  const update = useMutation({
    mutationFn: () => api.admin.updateSeason(season!.id, input),
    onSuccess: () => {
      haptic();
      toast.success(t("seasonSaved"));
      setEditing(false);
      refresh();
    },
    onError: (failure) => setError(errorMessage(failure)),
  });
  function save() {
    const parsed = updateSeasonSchema.safeParse(input);
    if (!parsed.success) {
      setError(issueMessage(parsed.error.issues[0]));
      return;
    }
    setError(null);
    update.mutate();
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <CalendarRange className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <SectionLabel>{t("seasonTitle")}</SectionLabel>
          <p className="mt-1 text-small text-muted-foreground">{t("seasonHint")}</p>
        </div>
      </div>
      {board.isError ? (
        <ErrorState onRetry={() => void board.refetch()} />
      ) : !board.data ? (
        <Skeleton className="h-24 rounded-lg" />
      ) : season === null ? (
        <p className="text-small">{t("noSeason")}</p>
      ) : editing ? (
        <div className="space-y-3">
          <Field label={t("seasonName")} htmlFor="season-edit-name">
            <Input
              id="season-edit-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label={t("endDate")} hint={t("endDateHint")} htmlFor="season-edit-end">
            <Input
              id="season-edit-end"
              type="date"
              className="num"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </Field>
          {error ? <p className="text-small text-danger-ink">{error}</p> : null}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(false)}>
              {t("cancel")}
            </Button>
            <Button className="flex-1" loading={update.isPending} onClick={save}>
              {t("save")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-display text-title font-semibold">{season.name}</p>
            <p className="text-small text-muted-foreground">
              {t("since", { date: format.dateTime(season.startsAt) })}
            </p>
            <p className="text-small text-muted-foreground">
              {season.endsAt && club
                ? t("endsOn", { date: format.longDayTitle(lastDayOf(season, club.timezone)) })
                : t("noEnd")}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil /> {t("edit")}
          </Button>
        </div>
      )}
      {board.data ? (
        <Button block variant={season ? "dangerSoft" : "primary"} onClick={() => setStarting(true)}>
          {season ? t("closeAndStart") : t("startFirst")}
        </Button>
      ) : null}
      <NewSeasonSheet open={starting} hasSeason={season !== null} onOpenChange={setStarting} />
    </Card>
  );
}

function PastSeasons() {
  const t = useTranslations("admin.ranking");
  const format = useFormat();
  const seasons = useQuery({ queryKey: queryKeys.seasons, queryFn: api.ranking.seasons });
  if (!seasons.data || seasons.data.length === 0) return null;
  return (
    <Card className="space-y-3 p-5">
      <SectionLabel>{t("pastTitle")}</SectionLabel>
      <ul className="divide-y divide-border">
        {seasons.data.map((item, index) => (
          <motion.li
            key={item.season.id}
            custom={index}
            variants={listItemVariants}
            initial={enter("hidden")}
            animate="show"
            className="space-y-1 py-3"
          >
            <p className="font-medium">{item.season.name}</p>
            <p className="text-caption text-muted-foreground">
              {format.day(item.season.startsAt.slice(0, 10))} –{" "}
              {item.season.closedAt ? format.day(item.season.closedAt.slice(0, 10)) : ""}
            </p>
            <p className="flex flex-wrap items-center gap-x-3 text-small">
              {item.podium.length === 0 ? (
                <span className="text-muted-foreground">{t("noGames")}</span>
              ) : (
                item.podium.map((entry) => (
                  <span key={entry.player.id} className="inline-flex items-center gap-1">
                    <Trophy className="size-3.5 text-muted-foreground" aria-hidden />
                    <span className="num">{entry.rank}º</span> {entry.player.name}
                  </span>
                ))
              )}
            </p>
          </motion.li>
        ))}
      </ul>
    </Card>
  );
}

function CategoryRow({ category }: { category: AdminCategoryItem }) {
  const t = useTranslations("admin.ranking");
  const errorMessage = useErrorMessage();
  const refresh = useRefresh();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const rename = useMutation({
    mutationFn: () => api.admin.renameCategory(category.id, { name }),
    onSuccess: () => {
      haptic();
      setEditing(false);
      refresh();
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const remove = useMutation({
    mutationFn: () => api.admin.deleteCategory(category.id),
    onSuccess: () => {
      haptic();
      toast.success(t("categoryDeleted", { name: category.name }));
      refresh();
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  return (
    <li className="flex min-h-14 flex-wrap items-center gap-2 py-2">
      {editing ? (
        <>
          <Input
            aria-label={t("categoryName")}
            value={name}
            className="min-w-0 flex-1"
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            size="sm"
            loading={rename.isPending}
            disabled={!categoryInputSchema.safeParse({ name }).success}
            onClick={() => rename.mutate()}
          >
            {t("save")}
          </Button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{category.name}</span>
            <span className="block text-caption text-muted-foreground">
              {t("membersCount", { count: category.members })}
            </span>
          </span>
          {confirmDelete ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                {t("cancel")}
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={remove.isPending}
                onClick={() => remove.mutate()}
              >
                {t("confirmDelete")}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("renameCategory", { name: category.name })}
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("deleteCategory", { name: category.name })}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </>
      )}
    </li>
  );
}

function CategoriesCard() {
  const t = useTranslations("admin.ranking");
  const errorMessage = useErrorMessage();
  const refresh = useRefresh();
  const categories = useQuery({
    queryKey: queryKeys.admin.rankingCategories,
    queryFn: api.admin.categories,
  });
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => api.admin.createCategory({ name }),
    onSuccess: (created) => {
      haptic([10, 30, 10]);
      toast.success(t("categoryCreated", { name: created.name }));
      setName("");
      refresh();
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  return (
    <Card className="space-y-4 p-5">
      <div>
        <SectionLabel>{t("categoriesTitle")}</SectionLabel>
        <p className="mt-1 text-small text-muted-foreground">{t("categoriesHint")}</p>
      </div>
      {categories.isError ? (
        <ErrorState onRetry={() => void categories.refetch()} />
      ) : !categories.data ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : (
        <ul className="divide-y divide-border">
          {categories.data.map((category) => (
            <CategoryRow key={category.id} category={category} />
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          aria-label={t("categoryName")}
          placeholder={t("newCategoryPlaceholder")}
          value={name}
          className="min-w-0 flex-1"
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          loading={create.isPending}
          disabled={!categoryInputSchema.safeParse({ name }).success}
          onClick={() => create.mutate()}
        >
          <Plus /> {t("addCategory")}
        </Button>
      </div>
    </Card>
  );
}

export default function AdminRankingPage() {
  const t = useTranslations("admin.ranking");
  return (
    <div className="space-y-6 pb-16">
      <AdminHeader title={t("title")} subtitle={t("subtitle")} />
      <SeasonCard />
      <PastSeasons />
      <CategoriesCard />
    </div>
  );
}
