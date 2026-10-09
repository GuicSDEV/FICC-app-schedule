"use client";

import {
  type BookingType,
  createPartnerRequestSchema,
  PARTNER_NOTE_MAX,
  type ScheduleDay,
} from "@ficc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { Field, FieldError, Textarea } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { bookableCells } from "@/lib/free-courts";
import { enter, haptic, listItemVariants, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";
import { useIssueMessage } from "@/lib/use-issue-message";
import { useLastDefined } from "@/lib/use-last-defined";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

/** What the sheet opens with: the day, and the time and game type when they are already known. */
export interface PartnerRequestDraft {
  day: ScheduleDay;
  timeSlotId?: string;
  type?: BookingType;
}

/**
 * "Procuro parceiro": a member with nobody to play with tells the others the time they want to
 * play (any free court). Only times with a free court can be picked.
 */
export function PartnerRequestSheet({
  draft: requested,
  onOpenChange,
}: {
  draft: PartnerRequestDraft | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const format = useFormat();
  const now = useNow();
  const { user } = useSession();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const issueMessage = useIssueMessage();
  const draft = useLastDefined(requested);
  const [timeSlotId, setTimeSlotId] = useState<string | null>(null);
  const [type, setType] = useState<BookingType>("SINGLES");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const typeOptions = [
    { value: "SINGLES", label: t("common.singles") },
    { value: "DOUBLES", label: t("common.doubles") },
  ] as const;

  useEffect(() => {
    if (!requested) return;
    setTimeSlotId(requested.timeSlotId ?? null);
    setType(requested.type ?? "SINGLES");
    setNote("");
    setError(null);
  }, [requested]);

  // Times that still have a court someone could book.
  const times = useMemo(() => {
    if (!draft) return [];
    const open = new Set(bookableCells(draft.day, user?.id, now).map((cell) => cell.timeSlotId));
    return draft.day.slots.filter((slot) => open.has(slot.id));
  }, [draft, user?.id, now]);

  const mutation = useMutation({
    mutationFn: () =>
      api.partnerRequests.create({
        date: draft!.day.date,
        timeSlotId: timeSlotId!,
        type,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      haptic([12, 40, 12]);
      toast.success(t("partners.posted"));
      void client.invalidateQueries({ queryKey: queryKeys.partnerRequests(draft!.day.date) });
      onOpenChange(false);
    },
    onError: (failure) => {
      const message = errorMessage(failure);
      setError(message);
      toast.error(message);
    },
  });

  function submit() {
    if (!draft) return;
    if (!timeSlotId) {
      setError(t("partners.pickTime"));
      return;
    }
    const parsed = createPartnerRequestSchema.safeParse({
      date: draft.day.date,
      timeSlotId,
      type,
      note: note.trim() || undefined,
    });
    if (!parsed.success) {
      setError(issueMessage(parsed.error.issues[0]));
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <Sheet
      open={requested !== null}
      onOpenChange={onOpenChange}
      title={t("partners.askTitle")}
      description={t("partners.askDescription")}
      footer={
        <Button block size="lg" loading={mutation.isPending} onClick={submit} disabled={!draft}>
          {t("partners.askSubmit")}
        </Button>
      }
    >
      {draft ? (
        <div className="space-y-6">
          <p className="text-body font-medium">{format.longDayTitle(draft.day.date)}</p>

          <section className="space-y-2" aria-label={t("partners.time")}>
            <p className="text-small font-medium">{t("partners.time")}</p>
            {times.length === 0 ? (
              <p className="text-small text-muted-foreground">{t("partners.noTimes")}</p>
            ) : (
              <ul
                className="grid grid-cols-3 gap-2"
                role="radiogroup"
                aria-label={t("partners.time")}
              >
                {times.map((slot, index) => {
                  const chosen = slot.id === timeSlotId;
                  return (
                    <motion.li
                      key={slot.id}
                      custom={index}
                      variants={listItemVariants}
                      initial={enter("hidden")}
                      animate="show"
                    >
                      <motion.button
                        type="button"
                        role="radio"
                        aria-checked={chosen}
                        whileTap={tap}
                        onClick={() => {
                          setTimeSlotId(slot.id);
                          setError(null);
                        }}
                        className={cn(
                          "flex h-12 w-full items-center justify-center rounded-md border num text-body font-semibold transition-tokens",
                          chosen
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-surface-2 text-foreground",
                        )}
                      >
                        {slot.startTime}
                      </motion.button>
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </section>

          <SegmentedControl
            label={t("booking.typeLabel")}
            options={typeOptions}
            value={type}
            onChange={setType}
          />

          <Field
            label={t("partners.note")}
            htmlFor="partner-note"
            hint={t("partners.noteHint", { left: PARTNER_NOTE_MAX - note.length })}
          >
            <Textarea
              id="partner-note"
              value={note}
              maxLength={PARTNER_NOTE_MAX}
              rows={2}
              placeholder={t("partners.notePlaceholder")}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <FieldError>{error}</FieldError>
        </div>
      ) : null}
    </Sheet>
  );
}
