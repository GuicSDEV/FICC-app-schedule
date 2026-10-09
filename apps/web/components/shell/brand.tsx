"use client";

import { useTranslations } from "next-intl";

import { useClub } from "@/components/providers/club-provider";
import { TennisBall } from "@/components/ui/tennis-ball";
import { cn } from "@/lib/utils";

/** Club wordmark: the club's name and its main sport. */
export function Brand({ subtitle, className }: { subtitle?: string; className?: string }) {
  const club = useClub();
  const t = useTranslations();
  const sport = club ? t(`labels.sport.${club.settings.primarySport}`) : t("app.brandFallback");
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <TennisBall className="size-8" />
      <span className="leading-none">
        <span className="block font-display text-title font-bold tracking-tight">
          {/* Reserve the name's width while the club loads, so nothing shifts. */}
          <span className={cn(!club && "invisible")}>{club?.name ?? "—"}</span> {sport}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block text-caption text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
    </span>
  );
}
