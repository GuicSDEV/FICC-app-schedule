"use client";

import { clubToday, type FreezeDetail } from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useClub } from "@/components/providers/club-provider";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { haptic } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";

function CheckRow({
  checked,
  onChange,
  title,
  detail,
  icon,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2.5 transition-tokens hover:bg-surface-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 shrink-0 accent-[var(--primary)]"
      />
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-small font-medium">{title}</span>
        <span className="block truncate text-caption text-muted-foreground">{detail}</span>
      </span>
    </label>
  );
}

/** A freeze's affected bookings and lessons, with bulk cancel and "lift now". */
export function FreezeDetailSheet({
  id,
  onOpenChange,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("admin.freezes");
  const labels = useTranslations("labels");
  const format = useFormat();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const club = useClub();
  const [bookings, setBookings] = useState<string[]>([]);
  const [lessons, setLessons] = useState<string[]>([]);
  const detail = useQuery({
    queryKey: [...queryKeys.admin.freezes, id],
    queryFn: () => api.admin.freeze(id!),
    enabled: id !== null,
  });

  // Preselect what the freeze really hits now: everything in a bounded window, but only
  // today's items for an open-ended freeze (it lists the next weeks, which may reopen first).
  useEffect(() => {
    const data = detail.data;
    if (!data) return;
    const today = club ? clubToday(new Date(), club.timezone) : null;
    const now = (date: string) => data.endsAt !== null || date === today;
    setBookings(data.affected.bookings.filter((entry) => now(entry.date)).map((entry) => entry.id));
    setLessons(data.affected.lessons.filter((entry) => now(entry.date)).map((entry) => entry.id));
  }, [detail.data, club]);

  const refresh = (freeze?: FreezeDetail) => {
    if (freeze) client.setQueryData([...queryKeys.admin.freezes, freeze.id], freeze);
    void client.invalidateQueries({ queryKey: queryKeys.admin.freezes });
    void client.invalidateQueries({ queryKey: queryKeys.freezesActive });
    void client.invalidateQueries({ queryKey: queryKeys.schedule() });
  };
  const cancel = useMutation({
    mutationFn: () => api.admin.cancelAffected(id!, { bookingIds: bookings, lessonIds: lessons }),
    onSuccess: (freeze) => {
      haptic();
      toast.success(t("cancelledAffected", { count: bookings.length + lessons.length }));
      refresh(freeze);
    },
    onError: (failure) => toast.error(errorMessage(failure, t("cancelFailed"))),
  });
  const lift = useMutation({
    mutationFn: () => api.admin.liftFreeze(id!),
    onSuccess: (freeze) => {
      haptic();
      toast.success(t("lifted"));
      refresh(freeze);
      onOpenChange(false);
    },
    onError: (failure) => toast.error(errorMessage(failure, t("liftFailed"))),
  });

  const data = detail.data;
  const selected = bookings.length + lessons.length;
  const total = data ? data.affected.bookings.length + data.affected.lessons.length : 0;
  const toggle = (list: string[], set: (next: string[]) => void, value: string, on: boolean) =>
    set(on ? [...list, value] : list.filter((entry) => entry !== value));

  return (
    <Sheet
      open={id !== null}
      onOpenChange={onOpenChange}
      title={
        data
          ? `${labels(`freezeReason.${data.reason}`)} · ${data.courtNames.join(", ")}`
          : t("detailTitle")
      }
      description={
        data
          ? data.endsAt
            ? t("window", {
                from: format.dateTime(data.startsAt),
                to: format.dateTime(data.endsAt),
              })
            : t("windowOpen", { from: format.dateTime(data.startsAt) })
          : undefined
      }
      footer={
        data && !data.liftedAt ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" loading={lift.isPending} onClick={() => lift.mutate()}>
              {t("lift")}
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              disabled={selected === 0}
              onClick={() => cancel.mutate()}
            >
              {t("cancelSelected", { count: selected })}
            </Button>
          </div>
        ) : undefined
      }
    >
      {detail.isError ? (
        <ErrorState onRetry={() => void detail.refetch()} />
      ) : !data ? (
        <div className="space-y-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : total === 0 ? (
        <p className="rounded-lg bg-surface-2 px-4 py-6 text-center text-small text-muted-foreground">
          {t("nothingAffected")}
        </p>
      ) : (
        <div className="space-y-5">
          {data.note ? (
            <p className="rounded-md bg-surface-2 px-4 py-3 text-small">{data.note}</p>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <p className="text-small text-muted-foreground">
              {t("selectedOf", { selected, total })}
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const all = selected < total;
                setBookings(all ? data.affected.bookings.map((entry) => entry.id) : []);
                setLessons(all ? data.affected.lessons.map((entry) => entry.id) : []);
              }}
            >
              {selected < total ? t("selectAll") : t("selectNone")}
            </Button>
          </div>
          {data.affected.bookings.length > 0 ? (
            <section className="space-y-2">
              <SectionLabel>
                {t("affectedBookings", { count: data.affected.bookings.length })}
              </SectionLabel>
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {data.affected.bookings.map((booking) => (
                  <CheckRow
                    key={booking.id}
                    checked={bookings.includes(booking.id)}
                    onChange={(on) => toggle(bookings, setBookings, booking.id, on)}
                    icon={<Users className="size-4" />}
                    title={booking.playerNames.join(", ")}
                    detail={`${booking.courtName} · ${format.day(booking.date)} ${booking.startTime}`}
                  />
                ))}
              </div>
            </section>
          ) : null}
          {data.affected.lessons.length > 0 ? (
            <section className="space-y-2">
              <SectionLabel>
                {t("affectedLessons", { count: data.affected.lessons.length })}
              </SectionLabel>
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {data.affected.lessons.map((lesson) => (
                  <CheckRow
                    key={lesson.id}
                    checked={lessons.includes(lesson.id)}
                    onChange={(on) => toggle(lessons, setLessons, lesson.id, on)}
                    icon={<CalendarClock className="size-4" />}
                    title={lesson.coach.displayName}
                    detail={`${lesson.courtName} · ${format.day(lesson.date)} ${lesson.startTime}`}
                  />
                ))}
              </div>
            </section>
          ) : null}
          <p className="text-caption text-muted-foreground">{t("cancelHint")}</p>
        </div>
      )}
    </Sheet>
  );
}
