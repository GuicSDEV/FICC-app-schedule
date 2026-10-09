"use client";

import {
  DRAW_FORMATS,
  SCORE_FORMATS,
  tournamentCategorySchema,
  type TournamentCategoryInfo,
  type TournamentCategoryRequest,
  type TournamentDetail,
} from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { ChoiceChip, ChipGroup } from "@/components/ui/choice-chip";
import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { invalidateTournament } from "@/lib/tournaments";
import { useErrorMessage } from "@/lib/use-error-message";
import { useIssueMessage } from "@/lib/use-issue-message";

type Form = Required<TournamentCategoryRequest>;

function initial(category: TournamentCategoryInfo | null): Form {
  return {
    name: category?.name ?? "",
    entryType: category?.entryType ?? "SINGLES",
    drawFormat: category?.drawFormat ?? "SINGLE_ELIMINATION",
    groupSize: category?.groupSize ?? 4,
    advancePerGroup: category?.advancePerGroup ?? 2,
    maxEntries: category?.maxEntries ?? 16,
    scoreFormat: category?.scoreFormat ?? "BEST_OF_3_MATCH_TIEBREAK",
    countsForElo: category?.countsForElo ?? false,
    seeding: category?.seeding ?? "ELO",
    circuitCategoryId: category?.circuitCategoryId ?? null,
  };
}

/** Add or edit a category (format, draw, size, score format, seeding). */
export function CategoryFormSheet({
  tournament,
  category,
  open,
  onOpenChange,
}: {
  tournament: TournamentDetail;
  /** Null to add. */
  category: TournamentCategoryInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("tournaments.categoryForm");
  const drawFormats = useTranslations("tournaments.drawFormat");
  const scoreFormats = useTranslations("tournaments.scoreFormat");
  const common = useTranslations("common");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const issueMessage = useIssueMessage();
  const [form, setForm] = useState<Form>(() => initial(category));
  const [touched, setTouched] = useState(false);
  const circuitId = tournament.circuit?.id;
  const circuit = useQuery({
    queryKey: queryKeys.circuit(circuitId ?? ""),
    queryFn: () => api.circuits.get(circuitId!),
    enabled: Boolean(circuitId) && open,
  });

  useEffect(() => {
    if (!open) return;
    setForm(initial(category));
    setTouched(false);
    // Reset when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const check = tournamentCategorySchema.safeParse(form);
  const issue = (field: keyof Form) => {
    if (!touched || check.success) return undefined;
    const found = check.error.issues.find((entry) => entry.path[0] === field);
    return found ? issueMessage(found) : undefined;
  };
  const locked = category?.drawGenerated ?? false;

  const save = useMutation({
    mutationFn: () =>
      category
        ? api.tournaments.updateCategory(tournament.id, category.id, form)
        : api.tournaments.addCategory(tournament.id, form),
    onSuccess: (detail) => {
      toast.success(category ? t("saved") : t("added"));
      client.setQueryData(queryKeys.tournaments.detail(tournament.id), detail);
      void invalidateTournament(client, tournament.id);
      onOpenChange(false);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const remove = useMutation({
    mutationFn: () => api.tournaments.deleteCategory(tournament.id, category!.id),
    onSuccess: (detail) => {
      toast(t("removed"));
      client.setQueryData(queryKeys.tournaments.detail(tournament.id), detail);
      onOpenChange(false);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={category ? t("editTitle") : t("addTitle")}
      description={locked ? t("lockedHint") : undefined}
      footer={
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            block
            loading={save.isPending}
            onClick={() => {
              setTouched(true);
              if (check.success) save.mutate();
            }}
          >
            {category ? t("save") : t("add")}
          </Button>
          {category && !locked ? (
            <Button
              variant="dangerSoft"
              block
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {t("remove")}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-5">
        <Field label={t("name")} htmlFor="c-name" error={issue("name")}>
          <Input
            id="c-name"
            value={form.name}
            placeholder={t("namePlaceholder")}
            onChange={(event) => set("name", event.target.value)}
          />
        </Field>
        <section className="space-y-2">
          <SectionLabel>{t("entryType")}</SectionLabel>
          <SegmentedControl
            label={t("entryType")}
            options={[
              { value: "SINGLES", label: common("singles") },
              { value: "DOUBLES", label: common("doubles") },
            ]}
            value={form.entryType}
            onChange={(value) => !locked && set("entryType", value)}
          />
        </section>
        <section className="space-y-2">
          <SectionLabel>{t("drawFormat")}</SectionLabel>
          <ChipGroup label={t("drawFormat")}>
            {DRAW_FORMATS.map((value) => (
              <ChoiceChip
                key={value}
                selected={form.drawFormat === value}
                disabled={locked}
                onClick={() => set("drawFormat", value)}
              >
                {drawFormats(value)}
              </ChoiceChip>
            ))}
          </ChipGroup>
        </section>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("maxEntries")} htmlFor="c-max" error={issue("maxEntries")}>
            <Input
              id="c-max"
              type="number"
              inputMode="numeric"
              className="num"
              min={2}
              max={128}
              value={form.maxEntries}
              onChange={(event) => set("maxEntries", Number(event.target.value))}
            />
          </Field>
          {form.drawFormat === "GROUPS_THEN_KNOCKOUT" ? (
            <>
              <Field label={t("groupSize")} htmlFor="c-group" error={issue("groupSize")}>
                <Input
                  id="c-group"
                  type="number"
                  inputMode="numeric"
                  className="num"
                  min={3}
                  max={8}
                  disabled={locked}
                  value={form.groupSize}
                  onChange={(event) => set("groupSize", Number(event.target.value))}
                />
              </Field>
              <Field label={t("advance")} htmlFor="c-advance" error={issue("advancePerGroup")}>
                <Input
                  id="c-advance"
                  type="number"
                  inputMode="numeric"
                  className="num"
                  min={1}
                  max={4}
                  disabled={locked}
                  value={form.advancePerGroup}
                  onChange={(event) => set("advancePerGroup", Number(event.target.value))}
                />
              </Field>
            </>
          ) : null}
        </div>
        <section className="space-y-2">
          <SectionLabel>{t("scoreFormat")}</SectionLabel>
          <ChipGroup label={t("scoreFormat")}>
            {SCORE_FORMATS.map((value) => (
              <ChoiceChip
                key={value}
                selected={form.scoreFormat === value}
                onClick={() => set("scoreFormat", value)}
              >
                {scoreFormats(value)}
              </ChoiceChip>
            ))}
          </ChipGroup>
        </section>
        <section className="space-y-2">
          <SectionLabel>{t("seeding")}</SectionLabel>
          <ChipGroup label={t("seeding")}>
            <ChoiceChip selected={form.seeding === "ELO"} onClick={() => set("seeding", "ELO")}>
              {t("seedingElo")}
            </ChoiceChip>
            {circuitId ? (
              <ChoiceChip
                selected={form.seeding === "CIRCUIT"}
                onClick={() => set("seeding", "CIRCUIT")}
              >
                {t("seedingCircuit")}
              </ChoiceChip>
            ) : null}
          </ChipGroup>
          <ChoiceChip
            selected={form.countsForElo}
            showCheck
            onClick={() => set("countsForElo", !form.countsForElo)}
          >
            {t("countsForElo")}
          </ChoiceChip>
        </section>
        {circuitId ? (
          <section className="space-y-2">
            <SectionLabel>{t("circuitCategory")}</SectionLabel>
            <ChipGroup label={t("circuitCategory")}>
              <ChoiceChip
                selected={form.circuitCategoryId === null}
                onClick={() => set("circuitCategoryId", null)}
              >
                {t("noCircuitCategory")}
              </ChoiceChip>
              {(circuit.data?.categories ?? []).map((entry) => (
                <ChoiceChip
                  key={entry.id}
                  selected={form.circuitCategoryId === entry.id}
                  onClick={() => set("circuitCategoryId", entry.id)}
                >
                  {entry.name}
                </ChoiceChip>
              ))}
            </ChipGroup>
            <p className="text-caption text-muted-foreground">{t("circuitCategoryHint")}</p>
          </section>
        ) : null}
      </div>
    </Sheet>
  );
}
