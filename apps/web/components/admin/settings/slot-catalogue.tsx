"use client";

import { type ClubSettings, createTimeSlotSchema } from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { enter, haptic, listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useIssueMessage } from "@/lib/use-issue-message";
import { cn } from "@/lib/utils";

/**
 * The club's start times (TimeSlot rows) that every weekday grid and date exception pick from:
 * add one, retire an unused one, bring a retired one back.
 */
export function SlotCatalogue({ settings }: { settings: ClubSettings }) {
  const t = useTranslations("adminSettings.slots");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const issueMessage = useIssueMessage();
  const slots = useQuery({ queryKey: queryKeys.admin.timeSlots, queryFn: api.admin.timeSlots });
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState(String(settings.defaultSlotDurationMinutes));
  const [touched, setTouched] = useState(false);

  const input = { startTime, durationMinutes: Number(duration) };
  const check = createTimeSlotSchema.safeParse(input);
  const issue = (field: string) => {
    if (!touched || check.success) return undefined;
    const found = check.error.issues.find((entry) => entry.path[0] === field);
    return found ? issueMessage(found) : undefined;
  };
  const refresh = () => {
    void client.invalidateQueries({ queryKey: queryKeys.admin.timeSlots });
    void client.invalidateQueries({ queryKey: queryKeys.courts });
    void client.invalidateQueries({ queryKey: queryKeys.schedule() });
  };
  const add = useMutation({
    mutationFn: () => api.admin.createTimeSlot(input),
    onSuccess: (slot) => {
      haptic([10, 30, 10]);
      toast.success(t("added", { time: slot.startTime }));
      setStartTime("");
      setTouched(false);
      refresh();
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.admin.setTimeSlotActive(id, isActive),
    onSuccess: (slot) => {
      haptic();
      toast.success(
        slot.isActive
          ? t("restored", { time: slot.startTime })
          : t("retired", { time: slot.startTime }),
      );
      refresh();
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const inGrid = (time: string) =>
    Object.values(settings.scheduleGrids).some((times) => times?.includes(time));

  return (
    <Card className="space-y-4 p-5">
      <div>
        <SectionLabel>{t("title")}</SectionLabel>
        <p className="mt-1 text-small text-muted-foreground">{t("hint")}</p>
      </div>
      {slots.isError ? (
        <ErrorState onRetry={() => void slots.refetch()} />
      ) : !slots.data ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {slots.data.map((slot, index) => {
            const used = inGrid(slot.startTime);
            return (
              <motion.li
                key={slot.id}
                custom={index}
                variants={listItemVariants}
                initial={enter("hidden")}
                animate="show"
                className={cn(
                  "flex min-h-14 items-center gap-3 px-4 py-2",
                  !slot.isActive && "text-muted-foreground",
                )}
              >
                <span className="flex-1 num font-medium">
                  {slot.startTime}–{slot.endTime}
                </span>
                {slot.isActive ? (
                  used ? (
                    <Badge className="h-6 px-2">{t("inGrid")}</Badge>
                  ) : null
                ) : (
                  <Badge tone="warning" className="h-6 px-2">
                    {t("inactive")}
                  </Badge>
                )}
                {slot.isActive && used ? null : (
                  <Button
                    size="sm"
                    variant={slot.isActive ? "ghost" : "secondary"}
                    loading={toggle.isPending && toggle.variables?.id === slot.id}
                    onClick={() => toggle.mutate({ id: slot.id, isActive: !slot.isActive })}
                  >
                    {slot.isActive ? t("retire") : t("restore")}
                  </Button>
                )}
              </motion.li>
            );
          })}
        </ul>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[10rem_10rem_auto] sm:items-end">
        <Field label={t("startTime")} htmlFor="slot-start" error={issue("startTime")}>
          <Input
            id="slot-start"
            type="time"
            className="num"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </Field>
        <Field label={t("duration")} htmlFor="slot-duration" error={issue("durationMinutes")}>
          <Input
            id="slot-duration"
            type="number"
            inputMode="numeric"
            min={15}
            max={240}
            className="num"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
          />
        </Field>
        <Button
          className="col-span-2 sm:col-span-1"
          loading={add.isPending}
          onClick={() => {
            setTouched(true);
            if (check.success) add.mutate();
          }}
        >
          <Plus /> {t("add")}
        </Button>
      </div>
    </Card>
  );
}
