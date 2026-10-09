import type { QueryClient } from "@tanstack/react-query";

import { api } from "./api";
import { queryKeys } from "./query-keys";

/** Coaches manage their own lessons; admins manage everyone's (same shapes, other routes). */
export type LessonMode = "coach" | "admin";

export function lessonApi(mode: LessonMode) {
  return mode === "coach"
    ? {
        create: api.coach.createLesson,
        update: api.coach.updateLesson,
        cancel: api.coach.cancelLesson,
        restore: api.coach.restoreLesson,
      }
    : {
        create: api.admin.createLesson,
        update: api.admin.updateLesson,
        cancel: api.admin.cancelLesson,
        restore: api.admin.restoreLesson,
      };
}

/** Every view that shows lessons: calendars, agendas, lists and the admin log. */
export function invalidateLessons(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: queryKeys.schedule() });
  void client.invalidateQueries({ queryKey: queryKeys.coachAgenda() });
  void client.invalidateQueries({ queryKey: queryKeys.coachLessons() });
  void client.invalidateQueries({ queryKey: queryKeys.admin.root });
}
