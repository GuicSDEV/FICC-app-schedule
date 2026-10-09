import type { IsoDate } from "../dates";
import type { CategoryKey, Permission, Role, Sport, Surface } from "../enums";

/** Instants travel as ISO-8601 strings in JSON. */
export type IsoDateTime = string;

/** Standard error body returned by the API. */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  /** pt-BR message safe to show to the user. */
  message: string;
  details?: unknown;
}

export interface PlayerSummary {
  id: string;
  name: string;
  membershipId: string | null;
  photoUrl: string | null;
  /** Rating in the club's main sport (PlayerRating). */
  elo: number;
  /** Keys of the club's categories (see GET /categories for their names). */
  categories: CategoryKey[];
}

export interface CoachSummary {
  id: string;
  displayName: string;
  photoUrl: string | null;
  color: string;
}

export interface CourtSummary {
  id: string;
  name: string;
  surface: Surface;
  sport: Sport;
  sortOrder: number;
}

export interface SlotSummary {
  id: string;
  /** "HH:mm" club time. */
  startTime: string;
  /** "HH:mm" club time. */
  endTime: string;
  durationMinutes: number;
  sortOrder: number;
}

export interface AuthUser {
  id: string;
  clubId: string;
  role: Role;
  name: string;
  membershipId: string | null;
  email: string | null;
  photoUrl: string | null;
  /** Keys of the club's categories (see GET /categories for their names). */
  categories: CategoryKey[];
  elo: number;
  guestPassesSuspended: boolean;
  coach: (CoachSummary & { courtIds: string[] }) | null;
  /** Staff permissions from the person's roles (empty for members). */
  permissions: Permission[];
  /** Booking suspended by the no-show penalty until this instant. */
  bookingSuspendedUntil: IsoDateTime | null;
}

export interface CourtsResponse {
  courts: CourtSummary[];
  slots: SlotSummary[];
  today: IsoDate;
}
