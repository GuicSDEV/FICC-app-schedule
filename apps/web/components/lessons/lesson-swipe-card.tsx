"use client";

import { CalendarX, Repeat } from "lucide-react";
import { animate, motion, type PanInfo, useMotionValue, useTransform } from "motion/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { haptic, spring, SWIPE_THRESHOLD, SWIPE_VELOCITY, tap, transitions } from "@/lib/motion";

import type { LessonActionTarget } from "./lesson-actions-sheet";

/**
 * A coach's lesson. Tap opens the actions; swiping left past the threshold cancels that day
 * (the toast offers undo). The swipe is a shortcut: cancelling is always in the actions sheet.
 */
export function LessonSwipeCard({
  lesson,
  onOpen,
  onCancel,
}: {
  lesson: LessonActionTarget;
  onOpen: () => void;
  onCancel: () => Promise<boolean>;
}) {
  const t = useTranslations("lessons");
  const x = useMotionValue(0);
  const revealOpacity = useTransform(x, [-SWIPE_THRESHOLD, -16, 0], [1, 0.4, 0]);
  const [busy, setBusy] = useState(false);
  // A drag must not also count as a tap that opens the sheet.
  const dragged = useRef(false);

  async function onDragEnd(_: unknown, info: PanInfo) {
    setTimeout(() => (dragged.current = false), 0);
    const commit = info.offset.x < -SWIPE_THRESHOLD || info.velocity.x < -SWIPE_VELOCITY;
    if (!commit || busy) {
      void animate(x, 0, spring.snappy);
      return;
    }
    haptic();
    setBusy(true);
    await animate(x, -window.innerWidth, transitions.fast);
    const ok = await onCancel();
    if (!ok) void animate(x, 0, spring.gentle);
    setBusy(false);
  }

  return (
    <div className="relative overflow-hidden rounded-lg">
      <motion.div
        aria-hidden
        style={{ opacity: revealOpacity }}
        className="absolute inset-0 flex items-center justify-end gap-2 bg-danger px-5 font-medium text-on-color"
      >
        <CalendarX className="size-5" /> {t("cancelThisShort")}
      </motion.div>
      <motion.button
        type="button"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.9, right: 0.05 }}
        dragDirectionLock
        style={{ x }}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={(event, info) => void onDragEnd(event, info)}
        whileTap={tap}
        onClick={() => !dragged.current && onOpen()}
        aria-label={t("openLesson", { court: lesson.court.name, time: lesson.slot.startTime })}
        className="relative flex w-full items-center gap-3 rounded-lg border border-lesson/30 bg-card p-3 text-left shadow-card"
      >
        <span
          aria-hidden
          className="h-12 w-1.5 shrink-0 rounded-full"
          style={{ background: lesson.coach.color }}
        />
        <span className="w-14 shrink-0">
          <span className="block num font-semibold">{lesson.slot.startTime}</span>
          <span className="block num text-caption text-muted-foreground">
            {lesson.slot.endTime}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 font-medium">
            {lesson.court.name}
            {lesson.seriesId ? (
              <Repeat className="size-3.5 text-lesson-ink" aria-label={t("weeklySeries")} />
            ) : null}
          </span>
          <span className="block truncate text-small text-muted-foreground">
            {lesson.studentNames ?? t("noStudents")}
          </span>
        </span>
      </motion.button>
    </div>
  );
}
