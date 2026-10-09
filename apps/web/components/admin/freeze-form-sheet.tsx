"use client";

import {
  clubInstant,
  clubTimeOfDay,
  clubToday,
  type CourtSummary,
  createFreezeSchema,
  type FreezeReason,
  type FreezeTarget,
  type Surface,
} from "@ficc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CloudRain, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useClub } from "@/components/providers/club-provider";
import { Button } from "@/components/ui/button";
import { ChipGroup, ChoiceChip } from "@/components/ui/choice-chip";
import { Field, FieldError, Input, Label, Textarea } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { haptic } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useIssueMessage } from "@/lib/use-issue-message";

type Scope = FreezeTarget["scope"];

/** "YYYY-MM-DDTHH:mm" in the club's zone → ISO instant. */
function toInstant(local: string, timeZone: string): string {
  const [date = "", time = "00:00"] = local.split("T");
  return clubInstant(date, time.slice(0, 5), timeZone).toISOString();
}

/** New freeze: one court, a whole surface or every court; rain or maintenance; a time window. */
export function FreezeFormSheet({
  open,
  onOpenChange,
  courts,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courts: CourtSummary[];
  onCreated: (id: string) => void;
}) {
  const t = useTranslations("admin.freezes");
  const labels = useTranslations("labels");
  const club = useClub();
  const client = useQueryClient();
  const issueMessage = useIssueMessage();
  const errorMessage = useErrorMessage();
  const [scope, setScope] = useState<Scope>("COURT");
  const [courtId, setCourtId] = useState<string | null>(null);
  const [surface, setSurface] = useState<Surface>("HARTRU");
  const [reason, setReason] = useState<FreezeReason>("RAIN");
  const [startsNow, setStartsNow] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !club) return;
    const now = new Date();
    setScope("COURT");
    setCourtId(null);
    setSurface("HARTRU");
    setReason("RAIN");
    setStartsNow(true);
    setStartsAt(`${clubToday(now, club.timezone)}T${clubTimeOfDay(now, club.timezone)}`);
    setEndsAt("");
    setNote("");
    setError(null);
  }, [open, club]);

  const mutation = useMutation({
    mutationFn: api.admin.createFreeze,
    onSuccess: (freeze) => {
      haptic([12, 40, 12]);
      toast.success(t("created"));
      void client.invalidateQueries({ queryKey: queryKeys.admin.freezes });
      void client.invalidateQueries({ queryKey: queryKeys.freezesActive });
      void client.invalidateQueries({ queryKey: queryKeys.schedule() });
      onCreated(freeze.id);
    },
    onError: (failure) => {
      const message = errorMessage(failure, t("createFailed"));
      setError(message);
      toast.error(message);
    },
  });

  function submit() {
    if (!club) return;
    if (scope === "COURT" && !courtId) return setError(t("pickCourt"));
    const target: FreezeTarget =
      scope === "COURT"
        ? { scope, courtId: courtId! }
        : scope === "SURFACE"
          ? { scope, surface }
          : { scope };
    const input = {
      target,
      reason,
      startsAt: startsNow ? new Date().toISOString() : toInstant(startsAt, club.timezone),
      ...(endsAt ? { endsAt: toInstant(endsAt, club.timezone) } : {}),
      ...(note.trim() ? { note } : {}),
    };
    const parsed = createFreezeSchema.safeParse(input);
    if (!parsed.success) return setError(issueMessage(parsed.error.issues[0]));
    setError(null);
    mutation.mutate(parsed.data);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("newTitle")}
      description={t("newDescription")}
      footer={
        <Button block size="lg" loading={mutation.isPending} onClick={submit} variant="primary">
          {t("create")}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label>{t("reason")}</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["RAIN", "MAINTENANCE"] as const).map((value) => (
              <ChoiceChip
                key={value}
                selected={reason === value}
                onClick={() => setReason(value)}
                className="h-12"
              >
                {value === "RAIN" ? (
                  <CloudRain className="size-4" />
                ) : (
                  <Wrench className="size-4" />
                )}
                {labels(`freezeReason.${value}`)}
              </ChoiceChip>
            ))}
          </div>
        </div>

        <SegmentedControl
          label={t("scope")}
          options={[
            { value: "COURT", label: t("scopeCourt") },
            { value: "SURFACE", label: t("scopeSurface") },
            { value: "ALL", label: t("scopeAll") },
          ]}
          value={scope}
          onChange={(next) => {
            setScope(next);
            setError(null);
          }}
        />
        {scope === "COURT" ? (
          <ChipGroup label={t("scopeCourt")}>
            {courts.map((court) => (
              <ChoiceChip
                key={court.id}
                selected={court.id === courtId}
                onClick={() => setCourtId(court.id)}
              >
                {court.name} · {labels(`surface.${court.surface}`)}
              </ChoiceChip>
            ))}
          </ChipGroup>
        ) : scope === "SURFACE" ? (
          <ChipGroup label={t("scopeSurface")}>
            {(["HARTRU", "SAIBRO"] as const).map((value) => (
              <ChoiceChip
                key={value}
                selected={surface === value}
                onClick={() => setSurface(value)}
              >
                {t("allOfSurface", { surface: labels(`surface.${value}`) })}
              </ChoiceChip>
            ))}
          </ChipGroup>
        ) : null}

        <div className="space-y-2">
          <Label>{t("starts")}</Label>
          <SegmentedControl
            label={t("starts")}
            options={[
              { value: "now", label: t("now") },
              { value: "later", label: t("scheduled") },
            ]}
            value={startsNow ? "now" : "later"}
            onChange={(next) => setStartsNow(next === "now")}
          />
          {startsNow ? null : (
            <Input
              type="datetime-local"
              aria-label={t("starts")}
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              className="num"
            />
          )}
        </div>
        <Field label={t("ends")} htmlFor="freeze-end" hint={t("endsHint")}>
          <Input
            id="freeze-end"
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            className="num"
          />
        </Field>
        <Field label={t("note")} htmlFor="freeze-note">
          <Textarea
            id="freeze-note"
            value={note}
            maxLength={300}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        <FieldError>{error}</FieldError>
      </div>
    </Sheet>
  );
}
