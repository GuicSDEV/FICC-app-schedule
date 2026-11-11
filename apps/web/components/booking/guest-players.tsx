"use client";

import { type GuestPassItem, guestsAllowedAt } from "@ficc/shared";
import { useQuery } from "@tanstack/react-query";
import { Check, UserPlus } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { GuestPassSheet } from "@/components/guests/guest-pass-sheet";
import { useClub } from "@/components/providers/club-provider";
import { Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import { tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/**
 * Guests as players in a booking: the member's guest passes for that day (not playing in another
 * booking yet) to tap, and "Novo convidado" to register one on top of the booking sheet. Hidden
 * behind a note at times the club keeps free of guests.
 */
export function GuestPlayers({
  date,
  startTime,
  selected,
  onChange,
  room,
}: {
  date: string;
  startTime: string;
  selected: GuestPassItem[];
  onChange: (next: GuestPassItem[]) => void;
  /** Player spots still open (guests and members share them). */
  room: number;
}) {
  const t = useTranslations("booking.guests");
  const club = useClub();
  const [creating, setCreating] = useState(false);
  const passes = useQuery({ queryKey: queryKeys.guestPasses, queryFn: api.guests.mine });
  const allowed = club === null || guestsAllowedAt(club.settings, date, startTime);
  if (!allowed) {
    return <p className="text-small text-muted-foreground">{t("blocked")}</p>;
  }
  const chosen = new Set(selected.map((pass) => pass.id));
  const available = (passes.data ?? []).filter(
    (pass) =>
      pass.status === "ACTIVE" &&
      pass.visitDate === date &&
      (pass.booking === null || chosen.has(pass.id)),
  );
  // A pass created here may not be in the list yet.
  const shown = [
    ...available,
    ...selected.filter((pass) => !available.some((a) => a.id === pass.id)),
  ];

  return (
    <div className="space-y-2">
      <Label>{t("label")}</Label>
      <div className="flex flex-wrap gap-2">
        {shown.map((pass) => {
          const isSelected = chosen.has(pass.id);
          const disabled = !isSelected && room <= 0;
          return (
            <motion.button
              key={pass.id}
              type="button"
              whileTap={disabled ? undefined : tap}
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={() =>
                onChange(
                  isSelected
                    ? selected.filter((entry) => entry.id !== pass.id)
                    : [...selected, pass],
                )
              }
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-small font-medium transition-tokens disabled:opacity-50",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface-2",
              )}
            >
              {isSelected ? <Check className="size-4" aria-hidden /> : null}
              {pass.guestName ?? t("unnamed")}
            </motion.button>
          );
        })}
        <motion.button
          type="button"
          whileTap={room > 0 ? tap : undefined}
          disabled={room <= 0}
          onClick={() => setCreating(true)}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-dashed border-border-strong px-4 text-small font-medium text-accent-ink transition-tokens disabled:opacity-50"
        >
          <UserPlus className="size-4" aria-hidden />
          {t("new")}
        </motion.button>
      </div>
      <p className="text-small text-muted-foreground">{t("hint")}</p>
      <GuestPassSheet
        open={creating}
        onOpenChange={setCreating}
        forDate={date}
        onCreated={(pass) => {
          if (room > 0) onChange([...selected, pass]);
        }}
      />
    </div>
  );
}
