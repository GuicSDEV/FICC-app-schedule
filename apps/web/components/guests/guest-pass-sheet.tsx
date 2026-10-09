"use client";

import {
  addDays,
  clubToday,
  createGuestPassSchema,
  formatDocument,
  type GuestDocumentType,
  type GuestPassItem,
  isValidDocument,
  normalizeDocument,
} from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useClub } from "@/components/providers/club-provider";
import { Button } from "@/components/ui/button";
import { Field, FieldError, Input, Label } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { fadeVariants, haptic, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useIssueMessage } from "@/lib/use-issue-message";
import { cn } from "@/lib/utils";

import { QrCard } from "./qr-card";

type Errors = Partial<Record<"guestName" | "documentNumber" | "visitDate" | "form", string>>;

/**
 * New day pass: guest name, CPF or RG, visit date and optionally one of the member's bookings
 * that day. On success the sheet shows the QR card ready to share.
 */
export function GuestPassSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("guests");
  const issueMessage = useIssueMessage();
  const errorMessage = useErrorMessage();
  const client = useQueryClient();
  const club = useClub();
  const today = club ? clubToday(new Date(), club.timezone) : "";
  const latest = club && today ? addDays(today, club.settings.guestPassMaxDaysAhead) : undefined;

  const [guestName, setGuestName] = useState("");
  const [documentType, setDocumentType] = useState<GuestDocumentType>("CPF");
  const [documentNumber, setDocumentNumber] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [created, setCreated] = useState<GuestPassItem | null>(null);

  useEffect(() => {
    if (open) {
      setGuestName("");
      setDocumentType("CPF");
      setDocumentNumber("");
      setVisitDate("");
      setBookingId(null);
      setErrors({});
      setCreated(null);
    }
  }, [open]);

  const date = visitDate || today;
  const bookings = useQuery({
    queryKey: queryKeys.bookingsMine,
    queryFn: api.bookings.mine,
    enabled: open,
  });
  const sameDay = (bookings.data?.upcoming ?? []).filter(
    (booking) => booking.date === date && booking.status !== "CANCELLED",
  );

  const mutation = useMutation({
    mutationFn: api.guests.create,
    onSuccess: (pass) => {
      haptic([12, 40, 12]);
      setCreated(pass);
      void client.invalidateQueries({ queryKey: queryKeys.guestPasses });
      void client.invalidateQueries({ queryKey: queryKeys.bookingsMine });
    },
    onError: (failure) => {
      const message = errorMessage(failure, t("createFailed"));
      setErrors({ form: message });
      toast.error(message);
    },
  });

  function submit() {
    const parsed = createGuestPassSchema.safeParse({
      guestName,
      documentType,
      documentNumber,
      visitDate: date,
      ...(bookingId ? { bookingId } : {}),
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        const key =
          field === "guestName" || field === "documentNumber" || field === "visitDate"
            ? field
            : "form";
        next[key] ??= issueMessage(issue);
      }
      // The schema checks the document only once the other fields pass; show it right away too.
      const normalized = normalizeDocument(documentType, documentNumber);
      if (!next.documentNumber && normalized && !isValidDocument(documentType, normalized)) {
        next.documentNumber = issueMessage({
          message: documentType === "CPF" ? "validation.invalidCpf" : "validation.invalidRg",
        });
      }
      setErrors(next);
      return;
    }
    setErrors({});
    mutation.mutate({
      guestName,
      documentType,
      documentNumber,
      visitDate: date,
      ...(bookingId ? { bookingId } : {}),
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={created ? t("createdTitle") : t("newTitle")}
      description={created ? t("createdDescription") : t("newDescription")}
      footer={
        created ? (
          <Button block size="lg" variant="secondary" onClick={() => onOpenChange(false)}>
            {t("done")}
          </Button>
        ) : (
          <Button block size="lg" loading={mutation.isPending} onClick={submit} disabled={!club}>
            {t("create")}
          </Button>
        )
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {created ? (
          <motion.div
            key="done"
            variants={fadeVariants}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            <QrCard pass={created} />
          </motion.div>
        ) : (
          <motion.div
            key="form"
            variants={fadeVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            className="space-y-5"
          >
            <Field label={t("guestName")} htmlFor="guest-name" error={errors.guestName}>
              <Input
                id="guest-name"
                value={guestName}
                autoComplete="off"
                autoCapitalize="words"
                maxLength={100}
                onChange={(event) => {
                  setGuestName(event.target.value);
                  setErrors((current) => ({ ...current, guestName: undefined }));
                }}
                aria-invalid={Boolean(errors.guestName) || undefined}
              />
            </Field>

            <div className="space-y-2">
              <Label htmlFor="guest-document">{t("document")}</Label>
              <SegmentedControl
                label={t("documentType")}
                options={[
                  { value: "CPF", label: "CPF" },
                  { value: "RG", label: "RG" },
                ]}
                value={documentType}
                onChange={(next) => {
                  setDocumentType(next);
                  setErrors((current) => ({ ...current, documentNumber: undefined }));
                }}
              />
              <Input
                id="guest-document"
                value={documentNumber}
                inputMode={documentType === "CPF" ? "numeric" : "text"}
                autoComplete="off"
                maxLength={20}
                placeholder={documentType === "CPF" ? "000.000.000-00" : t("rgPlaceholder")}
                onChange={(event) => {
                  setDocumentNumber(event.target.value);
                  setErrors((current) => ({ ...current, documentNumber: undefined }));
                }}
                onBlur={() =>
                  documentNumber &&
                  setDocumentNumber(
                    formatDocument(documentType, normalizeDocument(documentType, documentNumber)),
                  )
                }
                aria-invalid={Boolean(errors.documentNumber) || undefined}
                className="num"
              />
              {errors.documentNumber ? (
                <FieldError>{errors.documentNumber}</FieldError>
              ) : (
                <p className="text-small text-muted-foreground">{t("documentHint")}</p>
              )}
            </div>

            <Field label={t("visitDate")} htmlFor="guest-date" error={errors.visitDate}>
              <Input
                id="guest-date"
                type="date"
                value={date}
                min={today || undefined}
                max={latest}
                onChange={(event) => {
                  setVisitDate(event.target.value);
                  setBookingId(null);
                }}
                className="num"
              />
            </Field>

            {sameDay.length > 0 ? (
              <div className="space-y-2">
                <Label>{t("linkBooking")}</Label>
                <div className="flex flex-wrap gap-2">
                  {sameDay.map((booking) => {
                    const selected = bookingId === booking.id;
                    return (
                      <motion.button
                        key={booking.id}
                        type="button"
                        whileTap={tap}
                        aria-pressed={selected}
                        onClick={() => setBookingId(selected ? null : booking.id)}
                        className={cn(
                          "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-small font-medium transition-tokens",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-surface-2",
                        )}
                      >
                        {selected ? <Check className="size-4" /> : null}
                        {booking.court.name} · <span className="num">{booking.slot.startTime}</span>
                      </motion.button>
                    );
                  })}
                </div>
                <p className="text-small text-muted-foreground">{t("linkBookingHint")}</p>
              </div>
            ) : null}

            <FieldError>{errors.form}</FieldError>
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}
