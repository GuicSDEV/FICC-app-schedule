import type { IsoDate } from "../dates";
import type {
  DrawFormat,
  EntryStatus,
  MatchFormat,
  MatchOutcome,
  PaymentStatus,
  ResultStatus,
  ScoreFormat,
  SeedingMethod,
  TournamentStage,
  TournamentStatus,
} from "../enums";
import type { SetScore } from "../score";
import type { RoundName } from "../tournaments/bracket";
import type { StandingRow } from "../tournaments/groups";
import type { CircuitStanding, Placement, PointsTable } from "../tournaments/points";
import type { TimeRestrictions } from "../tournaments/schedule";
import type { CourtSummary, IsoDateTime, SlotSummary } from "./common";

/** A player of an entry: a member, or a guest / external player. */
export interface TournamentPlayer {
  userId: string | null;
  name: string;
  photoUrl: string | null;
  /** Ladder rating (members only). */
  elo: number | null;
  guest: boolean;
  /** Doubles partner invitations: false until the partner accepts. */
  accepted: boolean;
}

export interface EntrySummary {
  id: string;
  categoryId: string;
  status: EntryStatus;
  paymentStatus: PaymentStatus;
  seed: number | null;
  /** "Ana / Bia" */
  name: string;
  players: TournamentPlayer[];
  /** Seeding strength (average Elo or circuit points). */
  rating: number;
  createdAt: IsoDateTime;
  /** Shown to the entry's players and organizers only. */
  note: string | null;
  restrictions: TimeRestrictions | null;
}

export interface TournamentCategoryInfo {
  id: string;
  name: string;
  entryType: MatchFormat;
  drawFormat: DrawFormat;
  groupSize: number;
  advancePerGroup: number;
  maxEntries: number;
  scoreFormat: ScoreFormat;
  countsForElo: boolean;
  seeding: SeedingMethod;
  circuitCategoryId: string | null;
  circuitCategoryName: string | null;
  drawGenerated: boolean;
  drawPublished: boolean;
  confirmedEntries: number;
  waitlisted: number;
  championEntryId: string | null;
}

export interface TournamentSummary {
  id: string;
  /** Unguessable id of the public read-only page. */
  publicId: string;
  name: string;
  coverImageUrl: string | null;
  status: TournamentStatus;
  startDate: IsoDate;
  endDate: IsoDate;
  location: string;
  registrationOpensAt: IsoDateTime | null;
  registrationClosesAt: IsoDateTime | null;
  /** Registration is open right now (status and window). */
  registrationOpen: boolean;
  categories: { id: string; name: string; entryType: MatchFormat }[];
  entrants: number;
  circuit: { id: string; name: string } | null;
  /** The viewer's entry status in any category, when registered. */
  myEntryStatus: EntryStatus | null;
}

export interface Announcement {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  body: string;
  authorName: string;
  createdAt: IsoDateTime;
}

export interface TournamentDetail extends Omit<TournamentSummary, "categories"> {
  description: string;
  sponsorLogos: string[];
  allowGuests: boolean;
  feeAmountCents: number | null;
  requiresApproval: boolean;
  restMinutes: number;
  courtIds: string[];
  categories: TournamentCategoryInfo[];
  organizers: { id: string; name: string }[];
  /** Admin or organizer of this tournament. */
  canManage: boolean;
  myEntries: EntrySummary[];
  announcements: Announcement[];
  /** Confirmed entries by category (names only, for the "registered players" list). */
  entries: Record<string, { id: string; name: string; seed: number | null; status: EntryStatus }[]>;
}

export interface TournamentMatchView {
  id: string;
  tournamentId: string;
  categoryId: string;
  categoryName: string;
  stage: TournamentStage;
  groupName: string | null;
  round: number;
  roundName: RoundName | null;
  position: number;
  a: Pick<EntrySummary, "id" | "name" | "players" | "seed"> | null;
  b: Pick<EntrySummary, "id" | "name" | "players" | "seed"> | null;
  /** For empty sides of later rounds: the match whose winner fills it. */
  feederA: { round: number; position: number } | null;
  feederB: { round: number; position: number } | null;
  winnerEntryId: string | null;
  outcome: MatchOutcome | null;
  resultStatus: ResultStatus;
  /** Side A first. */
  sets: SetScore[];
  score: string | null;
  reportedBy: string | null;
  schedule: {
    date: IsoDate;
    courtId: string;
    courtName: string;
    timeSlotId: string;
    startTime: string;
    endTime: string;
    published: boolean;
  } | null;
  /** No result 2 h after the slot ended. */
  overdue: boolean;
  /** The scheduled court is frozen (rain / maintenance). */
  frozen: boolean;
  viewer: { canReport: boolean; canConfirm: boolean };
}

export interface GroupView {
  id: string;
  name: string;
  standings: (StandingRow & { entry: Pick<EntrySummary, "id" | "name" | "players" | "seed"> })[];
  matches: TournamentMatchView[];
  finished: boolean;
}

export interface DrawView {
  category: TournamentCategoryInfo;
  groups: GroupView[];
  rounds: { round: number; name: RoundName; matches: TournamentMatchView[] }[];
  championEntryId: string | null;
}

export interface OrderOfPlay {
  date: IsoDate;
  published: boolean;
  matches: TournamentMatchView[];
}

export type BoardCellState = "free" | "booking" | "lesson" | "frozen" | "tournament";

export interface ScheduleBoard {
  date: IsoDate;
  courts: CourtSummary[];
  slots: SlotSummary[];
  cells: {
    courtId: string;
    timeSlotId: string;
    state: BoardCellState;
    matchId: string | null;
    past: boolean;
  }[];
  /** Matches of this tournament scheduled on the date. */
  scheduled: TournamentMatchView[];
  /** Undecided matches without a slot, both entries known first. */
  unscheduled: TournamentMatchView[];
  published: boolean;
}

export interface AutoScheduleResult {
  scheduled: number;
  unscheduled: { matchId: string; reason: "NO_SLOT" | "WAITING_PREVIOUS" }[];
}

export interface PendingResults {
  overdue: TournamentMatchView[];
  awaitingConfirmation: TournamentMatchView[];
  frozen: TournamentMatchView[];
}

export interface MyTournamentItem {
  tournament: Pick<TournamentSummary, "id" | "name" | "status" | "startDate" | "endDate">;
  category: { id: string; name: string };
  entry: EntrySummary;
  nextMatch: TournamentMatchView | null;
  eliminated: boolean;
  champion: boolean;
}

export interface PlayerTitle {
  tournamentId: string;
  tournamentName: string;
  categoryName: string;
  placement: Extract<Placement, "CHAMPION" | "FINALIST">;
  date: IsoDate;
}

export interface CircuitSummary {
  id: string;
  name: string;
  season: string;
  categories: { id: string; name: string }[];
  stages: { tournamentId: string; name: string; startDate: IsoDate; status: TournamentStatus }[];
}

export interface CircuitDetail extends CircuitSummary {
  pointsTable: PointsTable;
  rankings: {
    categoryId: string;
    categoryName: string;
    standings: (CircuitStanding & {
      name: string;
      photoUrl: string | null;
      userId: string | null;
    })[];
  }[];
}

export interface PublicTournament {
  clubName: string;
  tournament: Omit<TournamentDetail, "myEntries" | "canManage" | "organizers">;
  draws: DrawView[];
  schedule: OrderOfPlay[];
}
