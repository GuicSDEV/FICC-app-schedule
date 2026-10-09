import { z } from "zod";

// String unions mirroring the Prisma enums in packages/db, so the web app can use them without
// depending on Prisma. Values must stay identical to schema.prisma.

export const ROLES = ["MEMBER", "COACH", "ADMIN", "GATE"] as const;
export type Role = (typeof ROLES)[number];
export const roleSchema = z.enum(ROLES);

/** Sports a court can host. Only tennis today; new sports add a value and a SportRules entry. */
export const SPORTS = ["TENNIS"] as const;
export type Sport = (typeof SPORTS)[number];
export const sportSchema = z.enum(SPORTS);

/**
 * Categories are per-club rows (e.g. FICC's "CLASS_A"); APIs exchange their stable key.
 * Keys are upper-case identifiers so they are safe in URLs and query strings.
 */
export type CategoryKey = string;
export const categoryKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{0,31}$/, { message: "validation.invalidOption" });

export const SURFACES = ["HARTRU", "SAIBRO"] as const;
export type Surface = (typeof SURFACES)[number];
export const surfaceSchema = z.enum(SURFACES);

export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const weekdaySchema = z.enum(WEEKDAYS);

export const BOOKING_TYPES = ["SINGLES", "DOUBLES"] as const;
export type BookingType = (typeof BOOKING_TYPES)[number];
export const bookingTypeSchema = z.enum(BOOKING_TYPES);

export const BOOKING_STATUSES = ["PENDING", "CONFIRMED", "CANCELLED"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_PLAYER_STATUSES = ["PENDING", "CONFIRMED", "DECLINED"] as const;
export type BookingPlayerStatus = (typeof BOOKING_PLAYER_STATUSES)[number];

export const BOOKING_CANCEL_REASONS = [
  "DECLINED",
  "EXPIRED",
  "CANCELLED_BY_PLAYER",
  "COURT_FROZEN",
  "CANCELLED_BY_ADMIN",
] as const;
export type BookingCancelReason = (typeof BOOKING_CANCEL_REASONS)[number];

export const LESSON_STATUSES = ["SCHEDULED", "CANCELLED"] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

export const LESSON_AUDIT_ACTIONS = [
  "CREATED",
  "UPDATED",
  "CANCELLED",
  "RESTORED",
  "SERIES_CREATED",
  "SERIES_UPDATED",
  "SERIES_ENDED",
] as const;
export type LessonAuditAction = (typeof LESSON_AUDIT_ACTIONS)[number];

export const FREEZE_REASONS = ["RAIN", "MAINTENANCE"] as const;
export type FreezeReason = (typeof FREEZE_REASONS)[number];
export const freezeReasonSchema = z.enum(FREEZE_REASONS);

export const FREEZE_SCOPES = ["COURT", "SURFACE", "ALL"] as const;
export type FreezeScope = (typeof FREEZE_SCOPES)[number];

/** Singles (1 vs 1) or doubles (2 vs 2). */
export const MATCH_FORMATS = ["SINGLES", "DOUBLES"] as const;
export type MatchFormat = (typeof MATCH_FORMATS)[number];
export const matchFormatSchema = z.enum(MATCH_FORMATS);

/** What a match counts for: FRIENDLY (no rating), RANKED (Elo ladder), TOURNAMENT (a draw). */
export const MATCH_TYPES = ["FRIENDLY", "RANKED", "TOURNAMENT"] as const;
export type MatchType = (typeof MATCH_TYPES)[number];
export const matchTypeSchema = z.enum(MATCH_TYPES);

export const MATCH_STATUSES = ["PENDING", "CONFIRMED", "DISPUTED", "VOIDED"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const MATCH_CONFIRMATIONS = [
  "OPPONENT_APPROVED",
  "AUTO_APPROVED",
  "ADMIN_RESOLVED",
] as const;
export type MatchConfirmation = (typeof MATCH_CONFIRMATIONS)[number];

export const TEAM_SIDES = ["A", "B"] as const;
export type TeamSide = (typeof TEAM_SIDES)[number];

export const GUEST_DOCUMENT_TYPES = ["CPF", "RG"] as const;
export type GuestDocumentType = (typeof GUEST_DOCUMENT_TYPES)[number];
export const guestDocumentTypeSchema = z.enum(GUEST_DOCUMENT_TYPES);

export const GUEST_PASS_STATUSES = ["ACTIVE", "USED", "CANCELLED"] as const;
export type GuestPassStatus = (typeof GUEST_PASS_STATUSES)[number];

export const GATE_SCAN_METHODS = ["QR", "MANUAL"] as const;
export type GateScanMethod = (typeof GATE_SCAN_METHODS)[number];

export const GATE_SCAN_RESULTS = [
  "ACCEPTED",
  "INVALID_TOKEN",
  "WRONG_DATE",
  "ALREADY_USED",
  "PASS_CANCELLED",
  "DOCUMENT_BLOCKED",
  "HOST_SUSPENDED",
  "NOT_FOUND",
] as const;
export type GateScanResult = (typeof GATE_SCAN_RESULTS)[number];

export const NOTIFICATION_TYPES = [
  "BOOKING_INVITE",
  "BOOKING_CONFIRMED",
  "BOOKING_CANCELLED",
  "SLOT_OPENED",
  "LESSON_CANCELLED",
  "MATCH_REPORTED",
  "MATCH_CONFIRMED",
  "MATCH_DISPUTED",
  "DISPUTE_RESOLVED",
  "COURT_FROZEN",
  "COURT_UNFROZEN",
  "GUEST_CHECKED_IN",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
