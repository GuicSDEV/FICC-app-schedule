import type { IsoDate } from "../dates";
import type {
  MatchConfirmation,
  MatchFormat,
  MatchStatus,
  MatchType,
  Sport,
  Surface,
  TeamSide,
} from "../enums";
import type { SetScore } from "../score";
import type { CourtSummary, IsoDateTime, PlayerSummary } from "./common";

export interface MatchPlayerInfo {
  user: PlayerSummary;
  side: TeamSide;
  /** Rating change from this match (null until confirmed). */
  eloBefore: number | null;
  eloAfter: number | null;
  delta: number | null;
}

export interface MatchDetail {
  id: string;
  /** Singles or doubles. */
  format: MatchFormat;
  /** What it counts for (only RANKED matches move the Elo ladder). */
  type: MatchType;
  sport: Sport;
  /** Set for TOURNAMENT matches (Phase 9.5). */
  tournamentId: string | null;
  status: MatchStatus;
  playedOn: IsoDate;
  surface: Surface;
  court: CourtSummary | null;
  bookingId: string | null;
  /** Sets from side A's point of view. */
  sets: SetScore[];
  /** "6-4, 3-6, [10-8]" (side A first). */
  score: string;
  winnerSide: TeamSide;
  players: MatchPlayerInfo[];
  reportedBy: { id: string; name: string };
  reportedAt: IsoDateTime;
  approvalDeadline: IsoDateTime;
  respondedBy: { id: string; name: string } | null;
  respondedAt: IsoDateTime | null;
  disputeComment: string | null;
  confirmation: MatchConfirmation | null;
  confirmedAt: IsoDateTime | null;
  resolvedBy: { id: string; name: string } | null;
  resolutionNote: string | null;
  viewer: {
    /** The viewer's side, when they played. */
    side: TeamSide | null;
    /** True when the viewer may approve or dispute (opposing side of the reporter). */
    canRespond: boolean;
  };
}

export interface MyMatchesResponse {
  /** Reported by the other side, waiting for the viewer to approve or dispute. */
  awaitingMyResponse: MatchDetail[];
  /** Reported by the viewer's side, waiting for the opponent. */
  awaitingOpponent: MatchDetail[];
  disputed: MatchDetail[];
  /** Confirmed matches, most recent first. */
  recent: MatchDetail[];
}

export interface LeaderboardEntry {
  rank: number;
  player: PlayerSummary;
  elo: number;
  wins: number;
  losses: number;
  matches: number;
  /** 0–100, rounded. */
  winRate: number;
  /** Elo change over the last 30 days. */
  trend: number;
}

export interface LeaderboardResponse {
  /** Category key, or null for everyone. */
  category: string | null;
  sport: Sport;
  entries: LeaderboardEntry[];
  updatedAt: IsoDateTime;
}

export interface EloPoint {
  at: IsoDateTime;
  elo: number;
  delta: number;
  matchId: string | null;
}

export interface PlayerProfile {
  player: PlayerSummary;
  rank: number;
  wins: number;
  losses: number;
  winRate: number;
  trend: number;
  recentMatches: MatchDetail[];
}

export interface H2HSideStats {
  player: PlayerSummary;
  /** Wins against the other player. */
  h2hWins: number;
  /** Overall win rate in all confirmed matches (0–100). */
  winRate: number;
  matches: number;
  history: EloPoint[];
}

export interface H2HMeeting {
  matchId: string;
  playedOn: IsoDate;
  format: MatchFormat;
  surface: Surface;
  /** Score from player A's point of view. */
  score: string;
  winner: "a" | "b";
}

export interface H2HResponse {
  a: H2HSideStats;
  b: H2HSideStats;
  meetings: number;
  lastMeetings: H2HMeeting[];
  surfaces: Record<Surface, { played: number; aWins: number; bWins: number }>;
}
