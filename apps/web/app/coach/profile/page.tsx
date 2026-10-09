"use client";

import { addDays, clubToday } from "@ficc/shared";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, LogOut, Repeat } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";

import { useClub } from "@/components/providers/club-provider";
import { useLogout, useSession } from "@/components/providers/session-provider";
import { NotificationBell } from "@/components/shell/notification-bell";
import { PageHeader } from "@/components/shell/page-header";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { CourtLines } from "@/components/ui/court-lines";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useFormat } from "@/lib/use-format";

/** Days ahead counted in the "next lessons" summary. */
const WEEK = 7;

export default function CoachProfilePage() {
  const t = useTranslations("coach");
  const shell = useTranslations("shell");
  const labels = useTranslations("labels");
  const format = useFormat();
  const club = useClub();
  const { user } = useSession();
  const logout = useLogout();
  const coach = user?.coach ?? null;
  const today = club ? clubToday(new Date(), club.timezone) : null;
  const courts = useQuery({
    queryKey: queryKeys.courts,
    queryFn: api.courts,
    staleTime: 60 * 60_000,
  });
  const lessons = useQuery({
    queryKey: queryKeys.coachLessons(today ?? "", today ? addDays(today, WEEK - 1) : ""),
    queryFn: () => api.coach.lessons(today!, addDays(today!, WEEK - 1)),
    enabled: Boolean(today),
  });
  const allowed = (courts.data?.courts ?? []).filter((court) => coach?.courtIds.includes(court.id));
  const upcoming = (lessons.data ?? []).filter((lesson) => lesson.status === "SCHEDULED");
  const series = new Set(upcoming.map((lesson) => lesson.seriesId).filter(Boolean)).size;
  const next = upcoming[0];

  return (
    <>
      <PageHeader title={t("profileTitle")} actions={<NotificationBell />} />
      <div className="mx-auto mt-5 max-w-2xl space-y-6">
        <section className="grain relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-card">
          <CourtLines className="opacity-[0.05]" />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-primary/15 blur-3xl"
          />
          {coach && user ? (
            <div className="relative flex items-center gap-4">
              <motion.span layoutId="avatar-me" className="rounded-full">
                <Avatar
                  name={coach.displayName}
                  src={coach.photoUrl}
                  size="xl"
                  ring={coach.color}
                />
              </motion.span>
              <div className="min-w-0 space-y-1">
                <h2 className="font-display text-headline leading-tight font-semibold">
                  {coach.displayName}
                </h2>
                <p className="truncate text-small text-muted-foreground">{user.name}</p>
                {user.email ? (
                  <p className="truncate text-small text-muted-foreground">{user.email}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <Skeleton className="h-24" />
          )}
        </section>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-card p-4">
            <CalendarClock className="size-5 text-lesson-ink" aria-hidden />
            <NumberTicker
              value={upcoming.length}
              from={0}
              className="mt-2 block text-headline font-semibold"
            />
            <p className="text-caption text-muted-foreground">
              {t("lessonsWeek", { count: upcoming.length })}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <Repeat className="size-5 text-lesson-ink" aria-hidden />
            <NumberTicker
              value={series}
              from={0}
              className="mt-2 block text-headline font-semibold"
            />
            <p className="text-caption text-muted-foreground">
              {t("seriesWeek", { count: series })}
            </p>
          </div>
        </div>

        {next ? (
          <p className="rounded-lg bg-lesson-soft px-4 py-3 text-small">
            {t("nextLesson", {
              day: format.dayTitle(next.date),
              time: next.slot.startTime,
              court: next.court.name,
            })}
          </p>
        ) : null}

        <section className="space-y-3" aria-label={t("allowedCourts")}>
          <SectionLabel>{t("allowedCourts")}</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {allowed.map((court) => (
              <Badge
                key={court.id}
                tone={court.surface === "HARTRU" ? "hartru" : "saibro"}
                className="h-9 px-4"
              >
                {court.name} · {labels(`surface.${court.surface}`)}
              </Badge>
            ))}
          </div>
          <p className="text-caption text-muted-foreground">{t("allowedCourtsHint")}</p>
        </section>

        <section className="space-y-3" aria-label={t("settings")}>
          <SectionLabel>{t("settings")}</SectionLabel>
          <div className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-card px-4">
            <span className="flex-1 font-medium">{t("theme")}</span>
            <ThemeToggle />
          </div>
          <Button variant="dangerSoft" block onClick={() => void logout()}>
            <LogOut /> {shell("signOut")}
          </Button>
        </section>
      </div>
    </>
  );
}
