import type { IsoDate } from "../dates";
import type { LessonAuditAction, LessonStatus, Weekday } from "../enums";
import type { CoachSummary, CourtSummary, IsoDateTime, SlotSummary } from "./common";

export interface LessonDetail {
  id: string;
  seriesId: string | null;
  date: IsoDate;
  status: LessonStatus;
  court: CourtSummary;
  slot: SlotSummary;
  coach: CoachSummary;
  startsAt: IsoDateTime;
  studentNames: string | null;
  note: string | null;
  series: { weekdays: Weekday[]; startDate: IsoDate; endDate: IsoDate | null } | null;
}

export interface CreateLessonResult {
  lesson: LessonDetail;
  /** Set when the lesson repeats weekly. */
  series: { id: string; generated: number; skippedDates: IsoDate[] } | null;
}

export interface CancelLessonResult {
  cancelled: number;
  lessons: LessonDetail[];
}

/** Why a slot could not take a lesson (labels in the catalogue under labels.slotBlockReason). */
export type SlotBlockReason = "SLOT_PAST" | "COURT_FROZEN" | "LESSON" | "BOOKING" | "COACH_BUSY";

export interface CopyWeekResult {
  created: LessonDetail[];
  /** Dates (next week) that were already taken. */
  skipped: { date: IsoDate; courtName: string; startTime: string; reason: SlotBlockReason }[];
}

export interface LessonAuditItem {
  id: string;
  action: LessonAuditAction;
  actor: { id: string; name: string };
  lessonId: string | null;
  seriesId: string | null;
  details: unknown;
  createdAt: IsoDateTime;
}

export interface CoachAdminItem extends CoachSummary {
  userId: string;
  name: string;
  email: string | null;
  isActive: boolean;
  courtIds: string[];
  activeSeries: number;
  upcomingLessons: number;
}

/** What members see when they tap a lesson: who teaches and when they are on court. */
export interface CoachProfile {
  coach: CoachSummary;
  courts: CourtSummary[];
  /** Scheduled lessons in the next 7 days (today included). */
  lessonsThisWeek: number;
  /** Next scheduled lessons, soonest first (at most 6). */
  upcoming: { date: IsoDate; court: CourtSummary; slot: SlotSummary }[];
}
