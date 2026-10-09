import type { IsoDate } from "../dates";
import type { Category, Role, Surface } from "../enums";

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
  elo: number;
  categories: Category[];
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
  role: Role;
  name: string;
  membershipId: string | null;
  email: string | null;
  photoUrl: string | null;
  categories: Category[];
  elo: number;
  guestPassesSuspended: boolean;
  coach: (CoachSummary & { courtIds: string[] }) | null;
}

export interface CourtsResponse {
  courts: CourtSummary[];
  slots: SlotSummary[];
  today: IsoDate;
}
