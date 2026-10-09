"use client";

import {
  type PlayerSummary,
  TOURNAMENT_TRANSITIONS,
  type TournamentCategoryInfo,
  type TournamentDetail,
  type TournamentStatus,
} from "@ficc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Pencil, Plus, Printer } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { MemberPicker } from "@/components/members/member-picker";
import { useSession } from "@/components/providers/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { haptic, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { datesBetween, formatMoney, invalidateTournament } from "@/lib/tournaments";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";

import { StatusBadge, useDateRange } from "../tournament-panels";
import { CategoryFormSheet } from "./category-form-sheet";
import { TournamentFormSheet } from "./tournament-form-sheet";

/** Status flow, data, categories, organizers, duplicate, public link and printouts. */
export function SettingsPanel({
  tournament,
  duplicateHref,
}: {
  tournament: TournamentDetail;
  /** Where a duplicated tournament opens. */
  duplicateHref: (id: string) => string;
}) {
  const t = useTranslations("tournaments.settings");
  const statusLabels = useTranslations("labels.tournamentStatus");
  const drawFormats = useTranslations("tournaments.drawFormat");
  const common = useTranslations("common");
  const format = useFormat();
  const range = useDateRange();
  const router = useRouter();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const { user } = useSession();
  const admin = user?.role === "ADMIN";
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState<TournamentCategoryInfo | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<TournamentStatus | null>(null);
  const [organizers, setOrganizers] = useState<PlayerSummary[] | null>(null);

  const setDetail = (detail: TournamentDetail) =>
    client.setQueryData(queryKeys.tournaments.detail(detail.id), detail);
  const status = useMutation({
    mutationFn: (next: TournamentStatus) => api.tournaments.setStatus(tournament.id, next),
    onSuccess: (detail) => {
      haptic([10, 30, 10]);
      toast.success(t("statusChanged", { status: statusLabels(detail.status) }));
      setDetail(detail);
      setNextStatus(null);
      void invalidateTournament(client, tournament.id);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const duplicate = useMutation({
    mutationFn: () => api.tournaments.duplicate(tournament.id),
    onSuccess: (detail) => {
      toast.success(t("duplicated"));
      setDetail(detail);
      void client.invalidateQueries({ queryKey: ["tournaments", "list"] });
      router.push(duplicateHref(detail.id));
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const saveOrganizers = useMutation({
    mutationFn: (people: PlayerSummary[]) =>
      api.tournaments.setOrganizers(
        tournament.id,
        people.map((person) => person.id),
      ),
    onSuccess: (detail) => {
      toast.success(t("organizersSaved"));
      setDetail(detail);
      setOrganizers(null);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  const publicUrl =
    typeof window === "undefined"
      ? `/t/${tournament.publicId}`
      : `${window.location.origin}/t/${tournament.publicId}`;
  const isPublic = tournament.status !== "DRAFT";
  const transitions = TOURNAMENT_TRANSITIONS[tournament.status];

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success(t("linkCopied"));
    } catch {
      toast(publicUrl);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <StatusBadge status={tournament.status} />
            <p className="font-display text-title font-semibold">{tournament.name}</p>
            <p className="text-small text-muted-foreground">
              {range(tournament.startDate, tournament.endDate)}
              {tournament.location ? ` · ${tournament.location}` : ""}
            </p>
            <p className="text-caption text-muted-foreground">
              {tournament.feeAmountCents ? formatMoney(tournament.feeAmountCents) : t("free")}
              {" · "}
              {tournament.requiresApproval ? t("withApproval") : t("noApproval")}
              {" · "}
              {t("rest", { minutes: tournament.restMinutes })}
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            <Pencil />
            {t("edit")}
          </Button>
        </div>
        {transitions.length > 0 ? (
          <div className="space-y-2 border-t border-border pt-3">
            <SectionLabel>{t("status")}</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {transitions.map((next) => (
                <Button
                  key={next}
                  size="sm"
                  variant={
                    next === "CANCELLED"
                      ? "dangerSoft"
                      : next === "DRAFT" ||
                          (next === "REGISTRATION_OPEN" &&
                            tournament.status === "REGISTRATION_CLOSED")
                        ? "ghost"
                        : "primary"
                  }
                  onClick={() => setNextStatus(next)}
                >
                  {t(`to.${next}`)}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionLabel>{t("categories")}</SectionLabel>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setCategory(null);
              setCategoryOpen(true);
            }}
          >
            <Plus />
            {t("addCategory")}
          </Button>
        </div>
        {tournament.categories.length === 0 ? (
          <p className="text-small text-muted-foreground">{t("noCategories")}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {tournament.categories.map((item) => (
              <li key={item.id}>
                <motion.button
                  type="button"
                  whileTap={tap}
                  onClick={() => {
                    setCategory(item);
                    setCategoryOpen(true);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left hover:border-border-strong"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-semibold">{item.name}</span>
                    <span className="block truncate text-caption text-muted-foreground">
                      {item.entryType === "SINGLES" ? common("singles") : common("doubles")} ·{" "}
                      {drawFormats(item.drawFormat)} ·{" "}
                      {t("spots", { taken: item.confirmedEntries, max: item.maxEntries })}
                    </span>
                  </span>
                  {item.drawPublished ? (
                    <Badge tone="success">{t("drawPublished")}</Badge>
                  ) : item.drawGenerated ? (
                    <Badge tone="warning">{t("drawDraft")}</Badge>
                  ) : null}
                </motion.button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <SectionLabel>{t("organizers")}</SectionLabel>
        {admin ? (
          organizers ? (
            <div className="space-y-3">
              <MemberPicker
                label={t("organizersLabel")}
                selected={organizers}
                onChange={setOrganizers}
                max={10}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  loading={saveOrganizers.isPending}
                  onClick={() => saveOrganizers.mutate(organizers)}
                >
                  {t("saveOrganizers")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setOrganizers(null)}>
                  {common("cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-small">
                {tournament.organizers.length > 0
                  ? tournament.organizers.map((person) => person.name).join(", ")
                  : t("noOrganizers")}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setOrganizers(
                    tournament.organizers.map((person) => ({
                      id: person.id,
                      name: person.name,
                      membershipId: null,
                      photoUrl: null,
                      elo: 0,
                      categories: [],
                    })),
                  )
                }
              >
                <Pencil />
                {t("changeOrganizers")}
              </Button>
            </div>
          )
        ) : (
          <p className="text-small">
            {tournament.organizers.map((person) => person.name).join(", ")}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <SectionLabel>{t("sharing")}</SectionLabel>
        {isPublic ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => void copyLink()}>
                <Copy />
                {t("copyLink")}
              </Button>
              <a
                href={`/t/${tournament.publicId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-surface-2 px-4 text-small font-medium hover:bg-surface-3"
              >
                <ExternalLink className="size-4" />
                {t("openPublic")}
              </a>
            </div>
            <div className="space-y-2">
              <p className="text-caption text-muted-foreground">{t("printHint")}</p>
              <div className="flex flex-wrap gap-2">
                {tournament.categories
                  .filter((item) => item.drawPublished)
                  .map((item) => (
                    <a
                      key={item.id}
                      href={`/t/${tournament.publicId}/print?view=draw&category=${item.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-3 text-caption font-medium hover:bg-surface-2"
                    >
                      <Printer className="size-4" />
                      {t("printDraw", { name: item.name })}
                    </a>
                  ))}
                {datesBetween(tournament.startDate, tournament.endDate).map((date) => (
                  <a
                    key={date}
                    href={`/t/${tournament.publicId}/print?view=day&date=${date}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-3 text-caption font-medium hover:bg-surface-2"
                  >
                    <Printer className="size-4" />
                    {t("printDay", { day: format.day(date) })}
                  </a>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-small text-muted-foreground">{t("draftNotPublic")}</p>
        )}
      </section>

      {admin ? (
        <section className="space-y-2">
          <SectionLabel>{t("template")}</SectionLabel>
          <Button
            size="sm"
            variant="secondary"
            loading={duplicate.isPending}
            onClick={() => duplicate.mutate()}
          >
            <Copy />
            {t("duplicate")}
          </Button>
          <p className="text-caption text-muted-foreground">{t("duplicateHint")}</p>
        </section>
      ) : null}

      <TournamentFormSheet open={editing} tournament={tournament} onOpenChange={setEditing} />
      <CategoryFormSheet
        tournament={tournament}
        category={category}
        open={categoryOpen}
        onOpenChange={setCategoryOpen}
      />
      <Sheet
        open={nextStatus !== null}
        onOpenChange={(open) => !open && setNextStatus(null)}
        title={nextStatus ? t(`to.${nextStatus}`) : ""}
        description={nextStatus ? t(`confirm.${nextStatus}`) : undefined}
        footer={
          <Button
            size="lg"
            block
            variant={nextStatus === "CANCELLED" ? "danger" : "primary"}
            loading={status.isPending}
            onClick={() => nextStatus && status.mutate(nextStatus)}
          >
            {common("confirm")}
          </Button>
        }
      >
        {null}
      </Sheet>
    </div>
  );
}
