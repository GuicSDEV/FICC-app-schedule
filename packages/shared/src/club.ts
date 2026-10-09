import { z } from "zod";

import { type Sport, sportSchema } from "./enums";
import type { Locale } from "./i18n";

/**
 * Rules each club configures (stored in ClubSettings). Every business rule that used to be a
 * constant lives here; services read the current club's values, never a hardcoded number.
 */
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
};

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
