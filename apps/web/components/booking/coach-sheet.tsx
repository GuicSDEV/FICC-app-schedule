"use client";

import type { CoachSummary, CourtSummary, SlotSummary } from "@ficc/shared";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Lock } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";

import { useClub } from "@/components/providers/club-provider";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/card";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/use-format";
import { listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useLastDefined } from "@/lib/use-last-defined";

import { FavoriteToggle } from "./favorite-toggle";

export interface LessonTarget {
  date: string;
  court: CourtSummary;
  slot: SlotSummary;
  coach: CoachSummary;
  favorite: boolean;
}

/** Tapping a lesson shows who teaches it (never a booking flow). */
export function CoachSheet({
  target: requested,
  onOpenChange,
}: {
  target: LessonTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const target = useLastDefined(requested);
  const t = useTranslations();
  const format = useFormat();
  const club = useClub();
  const coachId = target?.coach.id;
  const profile = useQuery({
    queryKey: queryKeys.coach(coachId ?? ""),
    queryFn: () => api.coaches.profile(coachId!),
    enabled: Boolean(coachId),
  });

  return (
    <Sheet open={requested !== null} onOpenChange={onOpenChange} title={t("coachSheet.title")}>
      {target ? (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar
              name={target.coach.displayName}
              src={target.coach.photoUrl}
              size="lg"
              ring={target.coach.color}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-headline font-semibold">
                {target.coach.displayName}
              </p>
              <p className="text-small text-muted-foreground">
                {t("coachSheet.role", { club: club?.name ?? "" })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-lesson/30 bg-lesson-soft p-3 text-lesson-ink">
            <Lock aria-hidden className="size-5 shrink-0" />
            <p className="min-w-0 flex-1 text-small">
              {t("coachSheet.when", {
                day: format.dayTitle(target.date),
                start: target.slot.startTime,
                end: target.slot.endTime,
                court: target.court.name,
              })}{" "}
              {t("coachSheet.slotTaken")}
            </p>
            <FavoriteToggle
              courtId={target.court.id}
              timeSlotId={target.slot.id}
              favorite={target.favorite}
              compact
            />
          </div>

          {profile.isError ? (
            <ErrorState
              message={t("coachSheet.loadFailed")}
              onRetry={() => void profile.refetch()}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-surface-2 p-4">
                  <SectionLabel>{t("coachSheet.lessonsThisWeek")}</SectionLabel>
                  {profile.data ? (
                    <NumberTicker
                      value={profile.data.lessonsThisWeek}
                      from={0}
                      className="mt-1 font-display text-display font-semibold"
                    />
                  ) : (
                    <Skeleton className="mt-2 h-10 w-12" />
                  )}
                </div>
                <div className="rounded-lg border border-border bg-surface-2 p-4">
                  <SectionLabel>{t("coachSheet.courts")}</SectionLabel>
                  <div className="mt-2 flex min-h-10 flex-wrap content-start gap-1.5">
                    {profile.data
                      ? profile.data.courts.map((court) => (
                          <Badge
                            key={court.id}
                            tone={court.surface === "HARTRU" ? "hartru" : "saibro"}
                            title={t(`labels.surface.${court.surface}`)}
                          >
                            {court.name}
                          </Badge>
                        ))
                      : [0, 1].map((index) => (
                          <Skeleton key={index} className="h-7 w-11 rounded-full" />
                        ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <SectionLabel>{t("coachSheet.upcoming")}</SectionLabel>
                <ul className="space-y-2">
                  {profile.data
                    ? profile.data.upcoming.map((lesson, index) => (
                        <motion.li
                          key={`${lesson.date}-${lesson.court.id}-${lesson.slot.id}`}
                          custom={index}
                          variants={listItemVariants}
                          initial="hidden"
                          animate="show"
                          className="flex h-12 items-center gap-3 rounded-md bg-surface-2 px-3 text-small"
                        >
                          <CalendarClock aria-hidden className="size-4 text-lesson-ink" />
                          <span className="flex-1">{format.dayTitle(lesson.date)}</span>
                          <span className="num">{lesson.slot.startTime}</span>
                          <span className="num text-muted-foreground">{lesson.court.name}</span>
                        </motion.li>
                      ))
                    : [0, 1, 2].map((index) => <Skeleton key={index} className="h-12" />)}
                  {profile.data && profile.data.upcoming.length === 0 ? (
                    <li className="text-small text-muted-foreground">
                      {t("coachSheet.noUpcoming")}
                    </li>
                  ) : null}
                </ul>
              </div>
            </>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}
