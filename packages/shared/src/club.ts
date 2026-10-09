import { z } from "zod";

import { courtModeSchema, type Sport, sportSchema, weekdaySchema } from "./enums";
import type { Locale } from "./i18n";

/**
 * Rules each club configures (stored in ClubSettings). Every business rule that used to be a
 * constant lives here; services read the current club's values, never a hardcoded number.
 */
const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "validation.invalidTime" });

/** "Bookings for day D open at `time`, `daysBefore` days before D" (club time). */
export const bookingOpeningSchema = z.object({
  daysBefore: z.number().int().min(0).max(30),
  time: timeOfDay,
});
export type BookingOpening = z.infer<typeof bookingOpeningSchema>;

export const freePlaySettingsSchema = z.object({
  /** Digital queue when every court is busy. */
  queueEnabled: z.boolean(),
  /** Minutes the first in line has to claim a court that just freed up. */
  claimMinutes: z.number().int().min(1).max(30),
  /** A check-in ends by itself after this many minutes (auto check-out). */
  sessionMinutes: z.number().int().min(15).max(240),
});
export type FreePlaySettings = z.infer<typeof freePlaySettingsSchema>;

export const noShowPenaltySchema = z.object({
  enabled: z.boolean(),
  /** No-shows (and late cancellations) within `windowDays` that trigger the penalty. */
  count: z.number().int().min(1).max(20),
  windowDays: z.number().int().min(1).max(365),
  /** Days without booking. */
  suspensionDays: z.number().int().min(1).max(365),
});
export type NoShowPenalty = z.infer<typeof noShowPenaltySchema>;

export const clubSettingsSchema = z.object({
  /** Sport whose rating is the player's headline Elo (PlayerSummary.elo, default leaderboard). */
  primarySport: sportSchema,
  /** Members can book today and the next N − 1 days. */
  bookingWindowDays: z.number().int().min(1).max(60),
  /** Future PENDING/CONFIRMED bookings a member may hold at once. */
  maxActiveBookings: z.number().int().min(1).max(10),
  /** Time the other players have to confirm a booking (capped at the slot start). */
  bookingConfirmationMinutes: z
    .number()
    .int()
    .min(10)
    .max(24 * 60),
  /** Unanswered match results are approved automatically after this many hours. */
  matchAutoApproveHours: z
    .number()
    .int()
    .min(1)
    .max(14 * 24),
  /** How many days after playing a result can still be reported. */
  matchReportMaxDaysAgo: z.number().int().min(1).max(365),
  eloKFactor: z.number().int().min(1).max(100),
  /** Leaderboard trend: rating change over this many days. */
  rankingTrendDays: z.number().int().min(1).max(365),
  eloInitialRating: z.number().int().min(100).max(4000),
  /** Weekly lesson series are kept generated this many days ahead. */
  lessonWindowDays: z.number().int().min(7).max(365),
  /** Watchers get "slot opened" only for slots within this many days. */
  slotOpenedNotifyDays: z.number().int().min(1).max(60),
  /** Duration of new time slots (the grid itself is the club's TimeSlot rows). */
  defaultSlotDurationMinutes: z.number().int().min(15).max(240),
  guestPassMaxDaysAhead: z.number().int().min(0).max(365),
  /** Guest names and documents are anonymized this many days after the visit (LGPD). */
  guestDataRetentionDays: z.number().int().min(1).max(3650),
  /**
   * Start times ("HH:mm" of the club's TimeSlot rows) used on each weekday. A weekday that is not
   * listed uses every active slot; an empty list closes the club that weekday.
   */
  scheduleGrids: z.partialRecord(weekdaySchema, z.array(timeOfDay).max(48)),
  /** Court mode per weekday (BOOKING when not listed). Date exceptions override it. */
  dayModes: z.partialRecord(weekdaySchema, courtModeSchema),
  /** When bookings for a day open; null = as soon as the day is inside the booking window. */
  bookingOpening: bookingOpeningSchema.nullable(),
  /**
   * Tapping a free court keeps it for that member while they pick their partners; others who tap
   * it wait in line and get it if the first one gives up. Seconds the court is kept.
   */
  slotHoldSeconds: z.number().int().min(30).max(600),
  /** Open "looking for a partner" requests one member may have at the same time. */
  partnerRequestMaxOpen: z.number().int().min(1).max(10),
  /** Bookings one member may hold on the same day. */
  maxBookingsPerDay: z.number().int().min(1).max(10),
  freePlay: freePlaySettingsSchema,
  /** Self sign-ups wait for staff approval before the member can log in. */
  signupRequiresApproval: z.boolean(),
  /** Holder + dependents memberships ("1234-01", "1234-02"), each with its own login and rating. */
  dependentsEnabled: z.boolean(),
  /** Cancelling less than this many minutes before the slot counts as a late cancellation. */
  lateCancellationMinutes: z
    .number()
    .int()
    .min(0)
    .max(48 * 60),
  /** Automatic booking suspension after repeated no-shows (off by default). */
  noShowPenalty: noShowPenaltySchema,
});
export type ClubSettings = z.infer<typeof clubSettingsSchema>;

/** Values a new club starts with (FICC's rules from docs/SPEC.md). */
export const DEFAULT_CLUB_SETTINGS: ClubSettings = {
  primarySport: "TENNIS",
  bookingWindowDays: 14,
  maxActiveBookings: 2,
  bookingConfirmationMinutes: 120,
  matchAutoApproveHours: 48,
  matchReportMaxDaysAgo: 30,
  eloKFactor: 32,
  rankingTrendDays: 30,
  eloInitialRating: 1200,
  lessonWindowDays: 56,
  slotOpenedNotifyDays: 14,
  defaultSlotDurationMinutes: 75,
  guestPassMaxDaysAhead: 60,
  guestDataRetentionDays: 90,
  scheduleGrids: {},
  dayModes: {},
  bookingOpening: null,
  maxBookingsPerDay: 1,
  slotHoldSeconds: 120,
  partnerRequestMaxOpen: 3,
  freePlay: { queueEnabled: true, claimMinutes: 5, sessionMinutes: 75 },
  signupRequiresApproval: true,
  dependentsEnabled: false,
  lateCancellationMinutes: 120,
  noShowPenalty: { enabled: false, count: 3, windowDays: 30, suspensionDays: 7 },
};

/** Staff edit any subset of the rules; the stored values are merged over the current ones. */
export const updateClubSettingsSchema = clubSettingsSchema.partial();
export type UpdateClubSettingsInput = z.infer<typeof updateClubSettingsSchema>;

/** Settings the apps may read (all of them today; secrets never go in ClubSettings). */
export type PublicClubSettings = ClubSettings;

/** GET /club: the club this deployment (or subdomain) serves. */
export interface ClubInfo {
  id: string;
  slug: string;
  name: string;
  /** IANA zone used for every club-local date and time. */
  timezone: string;
  locale: Locale;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  sports: Sport[];
  settings: PublicClubSettings;
}

/** A club's category (e.g. FICC's "Classe A"). */
export interface CategoryItem {
  key: string;
  name: string;
  sortOrder: number;
}
