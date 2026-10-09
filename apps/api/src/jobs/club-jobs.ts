/**
 * Every background job, with its schedule. Each one runs once per active club, inside that
 * club's tenant context, and is idempotent: it acts on current state (expired bookings, due
 * auto-approvals…), so a retry or a duplicate run changes nothing.
 */
export const CLUB_JOBS = {
  /** Cancel pending bookings nobody fully confirmed in time. */
  "bookings.expire-pending": { every: 60_000, runOnBoot: false },
  /** Confirm results unanswered past the club's auto-approve window. */
  "matches.auto-approve": { every: 5 * 60_000, runOnBoot: false },
  /** Keep weekly lesson series generated for the club's window (hourly; catches up on boot). */
  "lessons.generate": { every: 60 * 60_000, runOnBoot: true },
  /** Broadcast freezes that ended on their own. */
  "freezes.announce-expired": { every: 60_000, runOnBoot: false },
  /** LGPD: anonymize guest data after the club's retention period. */
  "guests.anonymize-expired": { every: 24 * 60 * 60_000, runOnBoot: true },
  /** LGPD: encrypt guest documents stored before encryption existed. */
  "guests.encrypt-legacy": { every: 24 * 60 * 60_000, runOnBoot: true },
} as const satisfies Record<string, { every: number; runOnBoot: boolean }>;

export type ClubJobName = keyof typeof CLUB_JOBS;

export const CLUB_JOBS_QUEUE = "club-jobs";
