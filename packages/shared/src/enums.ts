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
  "TOURNAMENT_ENTRY_CONFIRMED",
  "TOURNAMENT_PARTNER_INVITE",
  "TOURNAMENT_DRAW_PUBLISHED",
  "TOURNAMENT_MATCH_SCHEDULED",
  "TOURNAMENT_MATCH_CHANGED",
  "TOURNAMENT_RESULT_REPORTED",
  "TOURNAMENT_ADVANCED",
  "TOURNAMENT_ELIMINATED",
  "TOURNAMENT_CHAMPION",
  "TOURNAMENT_ANNOUNCEMENT",
  "TOURNAMENT_RESULT_OVERDUE",
  "MEMBER_APPROVED",
  "COURT_AVAILABLE",
  "NEWS_POSTED",
  "BOOKING_SUSPENDED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// ── Tournaments (Phase 9.5) ──────────────────────────────────────────────────

export const TOURNAMENT_STATUSES = [
  "DRAFT",
  "REGISTRATION_OPEN",
  "REGISTRATION_CLOSED",
  "DRAW_PUBLISHED",
  "IN_PROGRESS",
  "FINISHED",
  "CANCELLED",
] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];
export const tournamentStatusSchema = z.enum(TOURNAMENT_STATUSES);

/** Status changes an organizer may make (the API also moves a tournament forward on its own). */
export const TOURNAMENT_TRANSITIONS: Record<TournamentStatus, readonly TournamentStatus[]> = {
  DRAFT: ["REGISTRATION_OPEN", "CANCELLED"],
  REGISTRATION_OPEN: ["DRAFT", "REGISTRATION_CLOSED", "CANCELLED"],
  REGISTRATION_CLOSED: ["REGISTRATION_OPEN", "DRAW_PUBLISHED", "IN_PROGRESS", "CANCELLED"],
  DRAW_PUBLISHED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["FINISHED", "CANCELLED"],
  FINISHED: [],
  CANCELLED: [],
};

/** Knockout only, or round-robin groups whose best entries go on to a knockout. */
export const DRAW_FORMATS = ["SINGLE_ELIMINATION", "GROUPS_THEN_KNOCKOUT"] as const;
export type DrawFormat = (typeof DRAW_FORMATS)[number];
export const drawFormatSchema = z.enum(DRAW_FORMATS);

/** How a tournament match is scored (validated by the sport's rules). */
export const SCORE_FORMATS = ["BEST_OF_3_MATCH_TIEBREAK", "BEST_OF_3", "PRO_SET_8"] as const;
export type ScoreFormat = (typeof SCORE_FORMATS)[number];
export const scoreFormatSchema = z.enum(SCORE_FORMATS);

/** Seeding by the Elo ladder or by points in a circuit. */
export const SEEDING_METHODS = ["ELO", "CIRCUIT"] as const;
export type SeedingMethod = (typeof SEEDING_METHODS)[number];
export const seedingMethodSchema = z.enum(SEEDING_METHODS);

export const ENTRY_STATUSES = [
  "PENDING_PARTNER",
  "PENDING_APPROVAL",
  "CONFIRMED",
  "WAITLISTED",
  "WITHDRAWN",
  "REJECTED",
] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];
export const entryStatusSchema = z.enum(ENTRY_STATUSES);

export const PAYMENT_STATUSES = ["UNPAID", "PAID", "EXEMPT"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);

export const TOURNAMENT_STAGES = ["GROUP", "KNOCKOUT"] as const;
export type TournamentStage = (typeof TOURNAMENT_STAGES)[number];

/** How a decided match ended. BYE: the entry had no opponent in the first round. */
export const MATCH_OUTCOMES = ["PLAYED", "WALKOVER", "RETIRED", "DISQUALIFIED", "BYE"] as const;
export type MatchOutcome = (typeof MATCH_OUTCOMES)[number];
export const matchOutcomeSchema = z.enum(MATCH_OUTCOMES);

export const RESULT_STATUSES = ["NONE", "REPORTED", "CONFIRMED"] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

// ── Club operations (Phase 9.8) ─────────────────────────────────────────────────

/** How courts work on a day: normal reservations, or walk-up play with check-in (no bookings). */
export const COURT_MODES = ["BOOKING", "FREE_PLAY"] as const;
export type CourtMode = (typeof COURT_MODES)[number];
export const courtModeSchema = z.enum(COURT_MODES);

/** Member accounts created by self sign-up wait for staff approval. */
export const USER_STATUSES = ["PENDING", "ACTIVE", "REJECTED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Free play queue: waiting → offered a court (claim window) → claimed, or expired / left. */
export const QUEUE_STATUSES = ["WAITING", "OFFERED", "CLAIMED", "EXPIRED", "LEFT"] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

/** A missed booking, or one cancelled inside the late-cancellation window. */
export const NO_SHOW_KINDS = ["NO_SHOW", "LATE_CANCEL"] as const;
export type NoShowKind = (typeof NO_SHOW_KINDS)[number];

/**
 * What a staff member may do. Permissions are grouped into editable roles (Secretaria,
 * Diretoria…); a person can hold several roles and gets the union.
 */
export const PERMISSIONS = [
  /** Cancel any booking, mark no-shows and see members' no-show history. */
  "BOOKINGS_MANAGE",
  /** Rain / maintenance freezes, date exceptions and free-play courts. */
  "COURTS_MANAGE",
  /** Club news board ("Mural"). */
  "NEWS_MANAGE",
  /** Approve or reject self sign-ups. */
  "MEMBERS_APPROVE",
  /** Member list, CSV import, deactivation. */
  "MEMBERS_MANAGE",
  /** Guest passes, blocked documents, hosts' permissions. */
  "GUESTS_MANAGE",
  /** Coaches and every lesson. */
  "LESSONS_MANAGE",
  /** Tournaments and circuits. */
  "TOURNAMENTS_MANAGE",
  /** Result disputes and the ladder. */
  "RANKING_MANAGE",
  /** Club rules (ClubSettings): schedules, booking opening, penalties… */
  "SETTINGS_MANAGE",
  /** Staff accounts and their roles; the audit log. */
  "STAFF_MANAGE",
  /** Platform: edit what each role may do (super admin only by default). */
  "PLATFORM_MANAGE",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const permissionSchema = z.enum(PERMISSIONS);
