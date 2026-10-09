"use client";

import {
  createTournamentSchema,
  type CreateTournamentRequest,
  type TournamentDetail,
} from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { ChoiceChip, ChipGroup } from "@/components/ui/choice-chip";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { fromLocalInput, invalidateTournament, toLocalInput } from "@/lib/tournaments";
import { useErrorMessage } from "@/lib/use-error-message";
import { useIssueMessage } from "@/lib/use-issue-message";

interface FormState {
  name: string;
  description: string;
  coverImageUrl: string;
  sponsorLogos: string;
  startDate: string;
  endDate: string;
  location: string;
  courtIds: string[];
  registrationOpensAt: string;
  registrationClosesAt: string;
  allowGuests: boolean;
  fee: string;
  requiresApproval: boolean;
  restMinutes: string;
  circuitId: string | null;
}

function initialState(tournament: TournamentDetail | null): FormState {
  return {
    name: tournament?.name ?? "",
    description: tournament?.description ?? "",
    coverImageUrl: tournament?.coverImageUrl ?? "",
    sponsorLogos: (tournament?.sponsorLogos ?? []).join("\n"),
    startDate: tournament?.startDate ?? "",
    endDate: tournament?.endDate ?? "",
    location: tournament?.location ?? "",
    courtIds: tournament?.courtIds ?? [],
    registrationOpensAt: toLocalInput(tournament?.registrationOpensAt ?? null),
    registrationClosesAt: toLocalInput(tournament?.registrationClosesAt ?? null),
    allowGuests: tournament?.allowGuests ?? false,
    fee: tournament?.feeAmountCents
      ? (tournament.feeAmountCents / 100).toFixed(2).replace(".", ",")
      : "",
    requiresApproval: tournament?.requiresApproval ?? false,
    restMinutes: String(tournament?.restMinutes ?? 60),
    circuitId: tournament?.circuit?.id ?? null,
  };
}

/** "80,00" / "80.5" → cents; null when empty. */
function feeToCents(value: string): number | null {
  const clean = value.trim().replace(/\./g, "").replace(",", ".");
  if (!clean) return null;
  const number = Number(clean);
  return Number.isFinite(number) ? Math.round(number * 100) : Number.NaN;
}

/** Create a tournament (admin) or edit its settings (organizers). */
export function TournamentFormSheet({
  open,
  tournament,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  /** Null to create. */
  tournament: TournamentDetail | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (tournament: TournamentDetail) => void;
}) {
  const t = useTranslations("tournaments.form");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const issueMessage = useIssueMessage();
  const [form, setForm] = useState<FormState>(() => initialState(tournament));
  const [touched, setTouched] = useState(false);
  const courts = useQuery({
    queryKey: queryKeys.courts,
    queryFn: api.courts,
    staleTime: 60 * 60_000,
  });
  const circuits = useQuery({
    queryKey: queryKeys.circuits,
    queryFn: api.circuits.list,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!open) return;
    setForm(initialState(tournament));
    setTouched(false);
    // Reset when the sheet opens, not on every refetch while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const request: CreateTournamentRequest = {
    name: form.name,
    description: form.description,
    coverImageUrl: form.coverImageUrl.trim() || null,
    sponsorLogos: form.sponsorLogos
      .split(/\s+/)
      .map((url) => url.trim())
      .filter(Boolean),
    startDate: form.startDate,
    endDate: form.endDate,
    location: form.location,
    courtIds: form.courtIds,
    registrationOpensAt: fromLocalInput(form.registrationOpensAt),
    registrationClosesAt: fromLocalInput(form.registrationClosesAt),
    allowGuests: form.allowGuests,
    feeAmountCents: feeToCents(form.fee),
    requiresApproval: form.requiresApproval,
    restMinutes: Number(form.restMinutes),
    circuitId: form.circuitId,
  };
  const check = createTournamentSchema.safeParse(request);
  const issue = (field: string) => {
    if (!touched || check.success) return undefined;
    const found = check.error.issues.find((entry) => String(entry.path[0]) === field);
    return found ? issueMessage(found) : undefined;
  };

  const mutation = useMutation({
    mutationFn: () =>
      tournament ? api.tournaments.update(tournament.id, request) : api.tournaments.create(request),
    onSuccess: (saved) => {
      toast.success(tournament ? t("saved") : t("created"));
      client.setQueryData(queryKeys.tournaments.detail(saved.id), saved);
      void invalidateTournament(client, saved.id);
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  function submit() {
    setTouched(true);
    if (check.success) mutation.mutate();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={tournament ? t("editTitle") : t("createTitle")}
      footer={
        <Button size="lg" block loading={mutation.isPending} onClick={submit}>
          {tournament ? t("save") : t("create")}
        </Button>
      }
    >
      <div className="space-y-5">
        <Field label={t("name")} htmlFor="t-name" error={issue("name")}>
          <Input
            id="t-name"
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("startDate")} htmlFor="t-start" error={issue("startDate")}>
            <Input
              id="t-start"
              type="date"
              className="num"
              value={form.startDate}
              onChange={(event) => set("startDate", event.target.value)}
            />
          </Field>
          <Field label={t("endDate")} htmlFor="t-end" error={issue("endDate")}>
            <Input
              id="t-end"
              type="date"
              className="num"
              value={form.endDate}
              min={form.startDate || undefined}
              onChange={(event) => set("endDate", event.target.value)}
            />
          </Field>
        </div>
        <Field label={t("location")} htmlFor="t-location" error={issue("location")}>
          <Input
            id="t-location"
            value={form.location}
            onChange={(event) => set("location", event.target.value)}
          />
        </Field>

        <section className="space-y-2">
          <SectionLabel>{t("courts")}</SectionLabel>
          <ChipGroup label={t("courts")}>
            {(courts.data?.courts ?? []).map((court) => (
              <ChoiceChip
                key={court.id}
                selected={form.courtIds.includes(court.id)}
                showCheck
                onClick={() =>
                  set(
                    "courtIds",
                    form.courtIds.includes(court.id)
                      ? form.courtIds.filter((id) => id !== court.id)
                      : [...form.courtIds, court.id],
                  )
                }
              >
                {court.name}
              </ChoiceChip>
            ))}
          </ChipGroup>
          <p className="text-caption text-muted-foreground">{t("courtsHint")}</p>
        </section>

        <section className="space-y-3">
          <SectionLabel>{t("registration")}</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("opensAt")} htmlFor="t-opens" error={issue("registrationOpensAt")}>
              <Input
                id="t-opens"
                type="datetime-local"
                className="num"
                value={form.registrationOpensAt}
                onChange={(event) => set("registrationOpensAt", event.target.value)}
              />
            </Field>
            <Field label={t("closesAt")} htmlFor="t-closes" error={issue("registrationClosesAt")}>
              <Input
                id="t-closes"
                type="datetime-local"
                className="num"
                value={form.registrationClosesAt}
                onChange={(event) => set("registrationClosesAt", event.target.value)}
              />
            </Field>
          </div>
          <ChipGroup label={t("options")}>
            <ChoiceChip
              selected={form.requiresApproval}
              showCheck
              onClick={() => set("requiresApproval", !form.requiresApproval)}
            >
              {t("requiresApproval")}
            </ChoiceChip>
            <ChoiceChip
              selected={form.allowGuests}
              showCheck
              onClick={() => set("allowGuests", !form.allowGuests)}
            >
              {t("allowGuests")}
            </ChoiceChip>
          </ChipGroup>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={t("fee")}
              htmlFor="t-fee"
              error={issue("feeAmountCents")}
              hint={t("feeHint")}
            >
              <Input
                id="t-fee"
                inputMode="decimal"
                className="num"
                placeholder="0,00"
                value={form.fee}
                onChange={(event) => set("fee", event.target.value)}
              />
            </Field>
            <Field
              label={t("rest")}
              htmlFor="t-rest"
              error={issue("restMinutes")}
              hint={t("restHint")}
            >
              <Input
                id="t-rest"
                type="number"
                inputMode="numeric"
                min={0}
                max={480}
                className="num"
                value={form.restMinutes}
                onChange={(event) => set("restMinutes", event.target.value)}
              />
            </Field>
          </div>
        </section>

        {(circuits.data ?? []).length > 0 ? (
          <section className="space-y-2">
            <SectionLabel>{t("circuit")}</SectionLabel>
            <ChipGroup label={t("circuit")}>
              <ChoiceChip selected={form.circuitId === null} onClick={() => set("circuitId", null)}>
                {t("noCircuit")}
              </ChoiceChip>
              {circuits.data!.map((circuit) => (
                <ChoiceChip
                  key={circuit.id}
                  selected={form.circuitId === circuit.id}
                  onClick={() => set("circuitId", circuit.id)}
                >
                  {circuit.name}
                </ChoiceChip>
              ))}
            </ChipGroup>
          </section>
        ) : null}

        <Field
          label={t("description")}
          htmlFor="t-description"
          error={issue("description")}
          hint={t("descriptionHint")}
        >
          <Textarea
            id="t-description"
            className="min-h-40"
            value={form.description}
            onChange={(event) => set("description", event.target.value)}
          />
        </Field>
        <Field label={t("cover")} htmlFor="t-cover" error={issue("coverImageUrl")}>
          <Input
            id="t-cover"
            type="url"
            placeholder="https://"
            value={form.coverImageUrl}
            onChange={(event) => set("coverImageUrl", event.target.value)}
          />
        </Field>
        <Field
          label={t("sponsors")}
          htmlFor="t-sponsors"
          error={issue("sponsorLogos")}
          hint={t("sponsorsHint")}
        >
          <Textarea
            id="t-sponsors"
            value={form.sponsorLogos}
            onChange={(event) => set("sponsorLogos", event.target.value)}
          />
        </Field>
      </div>
    </Sheet>
  );
}
