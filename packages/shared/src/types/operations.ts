import type { IsoDate } from "../dates";
import type { CourtMode, NoShowKind, Permission, QueueStatus, Role, UserStatus } from "../enums";
import type { DateException } from "../operations";
import type { CourtSummary, IsoDateTime, PlayerSummary } from "./common";

export interface ScheduleExceptionItem extends DateException {
  id: string;
}

/** How a calendar day works, sent with the schedule grid. */
export interface DayPlanInfo {
  mode: CourtMode;
  closed: boolean;
  closedCourtIds: string[];
  note: string | null;
  /** Members may book this day now (inside the window and opened). */
  bookingOpen: boolean;
  inWindow: boolean;
  /** When bookings open (rule set); null when the day opens with the window. */
  opensAt: IsoDateTime | null;
  /** Server clock when the response was built: countdowns use it, never the phone's clock. */
  serverNow: IsoDateTime;
}

/** Details of SLOT_TAKEN: the next free options shown right away. */
export interface SlotAlternative {
  courtId: string;
  courtName: string;
  timeSlotId: string;
  startTime: string;
}

export interface CheckInView {
  id: string;
  courtId: string;
  players: PlayerSummary[];
  startedAt: IsoDateTime;
  /** Automatic check-out. */
  endsAt: IsoDateTime;
}

export type CourtNowState = "free" | "in_use" | "offered" | "blocked" | "closed";

export interface CourtNow {
  court: CourtSummary;
  state: CourtNowState;
  checkIn: CheckInView | null;
  /** Lesson, tournament match or freeze occupying the court right now. */
  blockedBy: "lesson" | "tournament" | "frozen" | null;
  /** Free court held for the first in line until this instant. */
  offeredUntil: IsoDateTime | null;
}

export interface QueueEntryView {
  id: string;
  status: QueueStatus;
  /** 1-based place in line while waiting. */
  position: number | null;
  joinedAt: IsoDateTime;
  offeredCourtId: string | null;
  offerExpiresAt: IsoDateTime | null;
}

/** Live "Quadras agora" screen of a free-play day. */
export interface CourtsNow {
  date: IsoDate;
  mode: CourtMode;
  serverNow: IsoDateTime;
  courts: CourtNow[];
  queue: { enabled: boolean; waiting: number; me: QueueEntryView | null };
  myCheckIn: CheckInView | null;
}

export interface PendingSignup {
  id: string;
  name: string;
  membershipId: string;
  /** Holder's name from the club's list (when imported with names). */
  listedName: string | null;
  /** Dependent of this holder matrícula. */
  holderMembershipId: string | null;
  createdAt: IsoDateTime;
}

export interface SignupStatusResponse {
  status: UserStatus;
  rejectionReason: string | null;
}

export interface NoShowItem {
  id: string;
  kind: NoShowKind;
  date: IsoDate;
  courtName: string;
  startTime: string;
  markedBy: string | null;
  note: string | null;
  createdAt: IsoDateTime;
}

export interface MemberNoShows {
  items: NoShowItem[];
  /** Counted in the penalty window. */
  recent: number;
  bookingSuspendedUntil: IsoDateTime | null;
}

export interface NewsPostItem {
  id: string;
  title: string;
  body: string;
  photoUrls: string[];
  eventDate: IsoDate | null;
  pinned: boolean;
  author: { id: string; name: string };
  publishedAt: IsoDateTime;
  reactions: number;
  reactedByMe: boolean;
  readByMe: boolean;
  /** Staff only. */
  readCount: number | null;
}

export interface StaffRoleItem {
  id: string;
  /** Default roles keep their key (SECRETARIA…); custom roles have none. */
  key: string | null;
  name: string;
  description: string;
  permissions: Permission[];
  memberCount: number;
}

export interface StaffMemberItem {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  roles: { id: string; name: string }[];
  permissions: Permission[];
  isActive: boolean;
}

export interface AuditLogItem {
  id: string;
  actor: { id: string; name: string } | null;
  /** "POST /freezes", "PATCH /members/:id/status"… */
  action: string;
  entityId: string | null;
  /** Request body without secrets, for context. */
  details: unknown;
  createdAt: IsoDateTime;
}
