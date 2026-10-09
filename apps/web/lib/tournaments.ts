import type {
  EntrySummary,
  SetScore,
  TeamSide,
  TournamentMatchView,
  TournamentStatus,
} from "@ficc/shared";
import type { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "./query-keys";

type Side = TournamentMatchView["a"];

/** Refetches everything of one tournament (detail, draws, schedule, entries, board…). */
export function invalidateTournament(client: QueryClient, tournamentId: string): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.tournaments.detail(tournamentId) }),
    client.invalidateQueries({ queryKey: queryKeys.tournaments.mine }),
    client.invalidateQueries({ queryKey: ["tournaments", "list"] }),
  ]).then(() => undefined);
}

/** Member ids of one side. */
export function sideUserIds(side: Side): string[] {
  return (side?.players ?? []).flatMap((player) => (player.userId ? [player.userId] : []));
}

/** The side the viewer plays on, or null. */
export function viewerSide(
  match: TournamentMatchView,
  viewerId: string | undefined,
): TeamSide | null {
  if (!viewerId) return null;
  if (sideUserIds(match.a).includes(viewerId)) return "A";
  if (sideUserIds(match.b).includes(viewerId)) return "B";
  return null;
}

/** "6-4, 3-6, [10-8]" as seen by `side`. */
export function scoreSeenBy(sets: readonly SetScore[], side: TeamSide): string {
  return sets
    .map((set) => (side === "A" ? set : { ...set, a: set.b, b: set.a }))
    .map((set) => (set.tiebreak ? `[${set.a}-${set.b}]` : `${set.a}-${set.b}`))
    .join(", ");
}

/** Status pill tones, from planning (neutral) to live (ball) to done (success). */
export const STATUS_TONE: Record<
  TournamentStatus,
  "neutral" | "ball" | "ballSoft" | "success" | "danger" | "warning" | "lesson"
> = {
  DRAFT: "neutral",
  REGISTRATION_OPEN: "ball",
  REGISTRATION_CLOSED: "warning",
  DRAW_PUBLISHED: "lesson",
  IN_PROGRESS: "ballSoft",
  FINISHED: "success",
  CANCELLED: "danger",
};

/** Entries that hold (or wait for) a place in the draw. */
export const ACTIVE_ENTRY: ReadonlySet<EntrySummary["status"]> = new Set([
  "PENDING_PARTNER",
  "PENDING_APPROVAL",
  "CONFIRMED",
  "WAITLISTED",
]);

/** Entry status pill tones. */
export const ENTRY_TONE = {
  PENDING_PARTNER: "warning",
  PENDING_APPROVAL: "warning",
  CONFIRMED: "success",
  WAITLISTED: "lesson",
  WITHDRAWN: "neutral",
  REJECTED: "danger",
} as const satisfies Record<EntrySummary["status"], string>;

/** "R$ 80,00" from cents. */
export function formatMoney(cents: number, locale = "pt-BR", currency = "BRL"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

/** ISO instant → value for <input type="datetime-local"> in the device's zone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** <input type="datetime-local"> value → ISO instant (null when empty). */
export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

/** Every date from `start` to `end` inclusive (ISO days). */
export function datesBetween(start: string, end: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last && days.length < 60) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
