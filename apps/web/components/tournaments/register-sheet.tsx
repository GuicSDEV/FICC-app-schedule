"use client";

import {
  type EntrySummary,
  NO_RESTRICTIONS,
  type PlayerSummary,
  registerEntrySchema,
  type RegisterEntryRequest,
  type TimeRestrictions,
  type TournamentCategoryInfo,
  type TournamentDetail,
} from "@ficc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MemberPicker } from "@/components/members/member-picker";
import { useSession } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { haptic } from "@/lib/motion";
import { datesBetween, formatMoney, invalidateTournament } from "@/lib/tournaments";
import { useErrorMessage } from "@/lib/use-error-message";
import { useIssueMessage } from "@/lib/use-issue-message";
import { useLastDefined } from "@/lib/use-last-defined";

import { RestrictionsFields } from "./restrictions-fields";

/** Registration in one category: partner (doubles), availability and a note. */
export function RegisterSheet({
  tournament,
  category: requested,
  onOpenChange,
}: {
  tournament: TournamentDetail;
  category: TournamentCategoryInfo | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("tournaments.register");
  const client = useQueryClient();
  const { user } = useSession();
  const errorMessage = useErrorMessage();
  const issueMessage = useIssueMessage();
  const category = useLastDefined(requested);
  const [partnerKind, setPartnerKind] = useState<"member" | "guest">("member");
  const [partner, setPartner] = useState<PlayerSummary[]>([]);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [restrictions, setRestrictions] = useState<TimeRestrictions>(NO_RESTRICTIONS);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  const categoryId = requested?.id;
  useEffect(() => {
    if (!categoryId) return;
    setPartnerKind("member");
    setPartner([]);
    setGuestName("");
    setGuestPhone("");
    setRestrictions(NO_RESTRICTIONS);
    setNote("");
    setTouched(false);
  }, [categoryId]);

  const doubles = category?.entryType === "DOUBLES";
  const request: RegisterEntryRequest = {
    ...(doubles && partnerKind === "member" && partner[0] ? { partnerId: partner[0].id } : {}),
    ...(doubles && partnerKind === "guest"
      ? { partnerGuest: { name: guestName, phone: guestPhone } }
      : {}),
    restrictions,
    ...(note.trim() ? { note: note.trim() } : {}),
  };
  const check = registerEntrySchema.safeParse(request);
  const fieldIssue = (field: string) => {
    if (check.success || !touched) return undefined;
    const issue = check.error.issues.find((entry) => entry.path.join(".").startsWith(field));
    return issue ? issueMessage(issue) : undefined;
  };
  const partnerMissing = doubles && partnerKind === "member" && partner.length === 0;
  const full = category ? category.confirmedEntries >= category.maxEntries : false;

  const mutation = useMutation({
    mutationFn: () => api.tournaments.register(tournament.id, category!.id, request),
    onSuccess: (entry: EntrySummary) => {
      haptic([12, 40, 12]);
      toast.success(
        entry.status === "WAITLISTED"
          ? t("waitlisted")
          : entry.status === "PENDING_PARTNER"
            ? t("partnerInvited")
            : entry.status === "PENDING_APPROVAL"
              ? t("pendingApproval")
              : t("confirmed"),
      );
      void invalidateTournament(client, tournament.id);
      onOpenChange(false);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  function submit() {
    setTouched(true);
    if (!check.success || partnerMissing) return;
    mutation.mutate();
  }

  return (
    <Sheet
      open={requested !== null}
      onOpenChange={onOpenChange}
      title={t("title", { category: category?.name ?? "" })}
      description={tournament.name}
      footer={
        <Button size="lg" block loading={mutation.isPending} onClick={submit}>
          {full ? t("joinWaitlist") : t("submit")}
        </Button>
      }
    >
      <div className="space-y-6">
        {full || tournament.requiresApproval || tournament.feeAmountCents ? (
          <div className="space-y-1 rounded-md bg-surface-2 px-4 py-3 text-small text-muted-foreground">
            {full ? (
              <p className="flex items-start gap-2">
                <Info className="mt-0.5 size-4 shrink-0" />
                {t("fullNote")}
              </p>
            ) : null}
            {tournament.requiresApproval ? <p>{t("approvalNote")}</p> : null}
            {tournament.feeAmountCents ? (
              <p>{t("feeNote", { fee: formatMoney(tournament.feeAmountCents) })}</p>
            ) : null}
          </div>
        ) : null}

        {doubles ? (
          <section className="space-y-3">
            <SectionLabel>{t("partner")}</SectionLabel>
            {tournament.allowGuests ? (
              <SegmentedControl
                label={t("partnerKind")}
                options={[
                  { value: "member", label: t("member") },
                  { value: "guest", label: t("guest") },
                ]}
                value={partnerKind}
                onChange={setPartnerKind}
              />
            ) : null}
            {partnerKind === "member" ? (
              <>
                <MemberPicker
                  label={t("partnerLabel")}
                  selected={partner}
                  onChange={setPartner}
                  max={1}
                  excludeIds={user ? [user.id] : []}
                  invalid={touched && partnerMissing}
                />
                <p className="text-caption text-muted-foreground">{t("partnerHint")}</p>
              </>
            ) : (
              <div className="space-y-3">
                <Field
                  label={t("guestName")}
                  htmlFor="guest-name"
                  error={fieldIssue("partnerGuest.name")}
                >
                  <Input
                    id="guest-name"
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label={t("guestPhone")}
                  htmlFor="guest-phone"
                  error={fieldIssue("partnerGuest.phone")}
                >
                  <Input
                    id="guest-phone"
                    type="tel"
                    inputMode="tel"
                    value={guestPhone}
                    onChange={(event) => setGuestPhone(event.target.value)}
                    placeholder="(11) 99999-9999"
                  />
                </Field>
              </div>
            )}
          </section>
        ) : null}

        <section className="space-y-3">
          <SectionLabel>{t("availability")}</SectionLabel>
          <RestrictionsFields
            value={restrictions}
            onChange={setRestrictions}
            dates={datesBetween(tournament.startDate, tournament.endDate)}
          />
        </section>

        <section className="space-y-2">
          <Field label={t("note")} htmlFor="entry-note" error={fieldIssue("note")}>
            <Textarea
              id="entry-note"
              value={note}
              maxLength={300}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("notePlaceholder")}
            />
          </Field>
        </section>
      </div>
    </Sheet>
  );
}

/** A player edits the availability and note of their entry. */
export function EditEntrySheet({
  tournament,
  entry: requested,
  onOpenChange,
}: {
  tournament: TournamentDetail;
  entry: EntrySummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("tournaments.register");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const entry = useLastDefined(requested);
  const [restrictions, setRestrictions] = useState<TimeRestrictions>(NO_RESTRICTIONS);
  const [note, setNote] = useState("");

  const entryId = requested?.id;
  useEffect(() => {
    if (!requested) return;
    setRestrictions(requested.restrictions ?? NO_RESTRICTIONS);
    setNote(requested.note ?? "");
    // Only when another entry opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  const mutation = useMutation({
    mutationFn: () =>
      api.tournamentEntries.update(entry!.id, { restrictions, note: note.trim() || null }),
    onSuccess: () => {
      toast.success(t("updated"));
      void invalidateTournament(client, tournament.id);
      onOpenChange(false);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  return (
    <Sheet
      open={requested !== null}
      onOpenChange={onOpenChange}
      title={t("editTitle")}
      description={entry?.name}
      footer={
        <Button size="lg" block loading={mutation.isPending} onClick={() => mutation.mutate()}>
          {t("save")}
        </Button>
      }
    >
      <div className="space-y-6">
        <RestrictionsFields
          value={restrictions}
          onChange={setRestrictions}
          dates={datesBetween(tournament.startDate, tournament.endDate)}
        />
        <Field label={t("note")} htmlFor="edit-note">
          <Textarea
            id="edit-note"
            value={note}
            maxLength={300}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </div>
    </Sheet>
  );
}
