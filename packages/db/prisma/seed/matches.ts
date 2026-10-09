import { calculateMatchElo, slotEndTime } from "@ficc/shared";

import { MatchConfirmation, MatchFormat, TeamSide, Weekday } from "../../src";
import {
  type CategoryKey,
  COURTS,
  type CourtName,
  FICC_CLUB,
  FICC_SETTINGS,
  FICC_SLOT_START_TIMES,
  LESSON_TEMPLATE,
  MATCH_COUNTS,
  MATCH_SPACING_DAYS,
  MEMBERS,
  RIVALRIES,
  type SeedMember,
  type SlotStartTime,
} from "./data";
import { addDays, clubInstant, type IsoDate, weekdayOf } from "./dates";
import type { Random } from "./random";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Unanswered reports are auto-approved after the club's window (48 h for FICC). */
const APPROVAL_WINDOW_MS = FICC_SETTINGS.matchAutoApproveHours * HOUR;

export interface PlannedSet {
  setNumber: number;
  sideAGames: number;
  sideBGames: number;
  isMatchTiebreak: boolean;
}

export interface PlannedMatch {
  format: MatchFormat;
  sideA: readonly SeedMember[];
  sideB: readonly SeedMember[];
  winner: TeamSide;
  sets: PlannedSet[];
  playedOn: IsoDate;
  startTime: string;
  court: CourtName;
  reportedBy: SeedMember;
  respondedBy: SeedMember | null;
  confirmation: MatchConfirmation;
  reportedAt: Date;
  respondedAt: Date | null;
  approvalDeadline: Date;
  confirmedAt: Date;
}

export interface RatedPlayer {
  member: SeedMember;
  before: number;
  after: number;
  delta: number;
}

export interface RatedMatch extends PlannedMatch {
  ratings: RatedPlayer[];
}

interface Matchup {
  format: MatchFormat;
  sideA: SeedMember[];
  sideB: SeedMember[];
}

function memberNamed(name: string): SeedMember {
  const member = MEMBERS.find((candidate) => candidate.name === name);
  if (!member) throw new Error(`Unknown seed member "${name}"`);
  return member;
}

function membersIn(category: CategoryKey): SeedMember[] {
  return MEMBERS.filter((member) => member.categories.includes(category));
}

/** Rivalries first, then random pairings within a category, in shuffled order. */
function planMatchups(random: Random): Matchup[] {
  const matchups: Matchup[] = [];

  for (const { players, times } of RIVALRIES) {
    for (let game = 0; game < times; game += 1) {
      const [first, second] = players.map(memberNamed) as [SeedMember, SeedMember];
      // Alternate sides so neither rival is always side A.
      matchups.push({
        format: MatchFormat.SINGLES,
        sideA: game % 2 === 0 ? [first] : [second],
        sideB: game % 2 === 0 ? [second] : [first],
      });
    }
  }

  const singlesPools = [
    ["CLASS_A", 25],
    ["CLASS_B", 25],
    ["CLASS_C", 25],
    ["WOMENS", 15],
    ["SENIORS", 10],
  ] as const;
  while (matchups.length < MATCH_COUNTS.singles) {
    const [first, second] = random.shuffle(membersIn(random.weighted(singlesPools))) as [
      SeedMember,
      SeedMember,
    ];
    matchups.push({ format: MatchFormat.SINGLES, sideA: [first], sideB: [second] });
  }

  const doublesPools = [
    ["CLASS_A", 15],
    ["CLASS_B", 30],
    ["CLASS_C", 30],
    ["WOMENS", 15],
    ["SENIORS", 10],
  ] as const;
  for (let game = 0; game < MATCH_COUNTS.doubles; game += 1) {
    const [p1, p2, p3, p4] = random.shuffle(membersIn(random.weighted(doublesPools))) as [
      SeedMember,
      SeedMember,
      SeedMember,
      SeedMember,
    ];
    matchups.push({ format: MatchFormat.DOUBLES, sideA: [p1, p2], sideB: [p3, p4] });
  }

  return random.shuffle(matchups);
}

function averageSkill(side: readonly SeedMember[]): number {
  return side.reduce((sum, member) => sum + member.skill, 0) / side.length;
}

/** The stronger side usually wins: ~85% with a one-class gap, ~60% within a class. */
function simulateWinner(
  sideA: readonly SeedMember[],
  sideB: readonly SeedMember[],
  random: Random,
) {
  const chanceA = 1 / (1 + Math.exp(-(averageSkill(sideA) - averageSkill(sideB)) / 10));
  return random.chance(chanceA) ? TeamSide.A : TeamSide.B;
}

const REGULAR_SET_SCORES: readonly (readonly [readonly [number, number], number])[] = [
  [[6, 0], 1],
  [[6, 1], 2],
  [[6, 2], 3],
  [[6, 3], 4],
  [[6, 4], 4],
  [[7, 5], 3],
  [[7, 6], 3],
];

function regularSet(setWinner: TeamSide, random: Random): Omit<PlannedSet, "setNumber"> {
  const [winnerGames, loserGames] = random.weighted(REGULAR_SET_SCORES);
  return setWinner === TeamSide.A
    ? { sideAGames: winnerGames, sideBGames: loserGames, isMatchTiebreak: false }
    : { sideAGames: loserGames, sideBGames: winnerGames, isMatchTiebreak: false };
}

/** Deciding match tie-break: first to 10, win by 2 (sometimes extended past 10-8). */
function matchTiebreak(setWinner: TeamSide, random: Random): Omit<PlannedSet, "setNumber"> {
  const loserPoints = random.chance(0.15) ? random.int(9, 12) : random.int(0, 8);
  const winnerPoints = Math.max(10, loserPoints + 2);
  return setWinner === TeamSide.A
    ? { sideAGames: winnerPoints, sideBGames: loserPoints, isMatchTiebreak: true }
    : { sideAGames: loserPoints, sideBGames: winnerPoints, isMatchTiebreak: true };
}

/** Valid best-of-3 score won by `winner`: straight sets, or 2-1 with a set or match tie-break. */
function generateSets(winner: TeamSide, random: Random): PlannedSet[] {
  const loser = winner === TeamSide.A ? TeamSide.B : TeamSide.A;
  const sets = random.chance(0.62)
    ? [regularSet(winner, random), regularSet(winner, random)]
    : [
        ...(random.chance(0.5)
          ? [regularSet(winner, random), regularSet(loser, random)]
          : [regularSet(loser, random), regularSet(winner, random)]),
        random.chance(0.55) ? matchTiebreak(winner, random) : regularSet(winner, random),
      ];
  return sets.map((set, index) => ({ setNumber: index + 1, ...set }));
}

const ALL_COURTS = COURTS.map((court) => court.name);
const EVENING_SLOTS: readonly SlotStartTime[] = ["17:15", "18:30", "19:45", "21:00"];

/** Weekday matches use evening slots on courts the lesson template leaves free; weekends use any. */
function pickCourtAndSlot(date: IsoDate, random: Random) {
  const weekday = weekdayOf(date);
  if (weekday === Weekday.SAT || weekday === Weekday.SUN) {
    return { startTime: random.pick(FICC_SLOT_START_TIMES), court: random.pick(ALL_COURTS) };
  }
  const startTime = random.pick(EVENING_SLOTS);
  const lessonCourts = LESSON_TEMPLATE[startTime];
  const court = random.pick(ALL_COURTS.filter((name) => !(name in lessonCourts)));
  return { startTime, court };
}

function planTimeline(
  matchup: Matchup,
  playedOn: IsoDate,
  startTime: string,
  now: Date,
  random: Random,
) {
  const endTime = slotEndTime({
    startTime,
    durationMinutes: FICC_SETTINGS.defaultSlotDurationMinutes,
  });
  const reportedAt = new Date(
    clubInstant(playedOn, endTime, FICC_CLUB.timezone).getTime() + random.int(5, 90) * MINUTE,
  );
  const approvalDeadline = new Date(reportedAt.getTime() + APPROVAL_WINDOW_MS);

  const reporterOnA = random.chance(0.5);
  const reportedBy = random.pick(reporterOnA ? matchup.sideA : matchup.sideB);
  const opponents = reporterOnA ? matchup.sideB : matchup.sideA;

  const canAutoApprove = approvalDeadline.getTime() < now.getTime() - HOUR;
  if (canAutoApprove && random.chance(0.15)) {
    return {
      reportedBy,
      reportedAt,
      approvalDeadline,
      respondedBy: null,
      respondedAt: null,
      confirmation: MatchConfirmation.AUTO_APPROVED,
      confirmedAt: approvalDeadline,
    };
  }

  // The opponent answers within 20 h, and always before "now".
  const maxDelay = Math.min(20 * HOUR, now.getTime() - reportedAt.getTime() - MINUTE);
  if (maxDelay < MINUTE) throw new Error(`Seed match on ${playedOn} ends too close to now`);
  const respondedAt = new Date(
    reportedAt.getTime() + Math.max(MINUTE, Math.floor(random.next() * maxDelay)),
  );
  return {
    reportedBy,
    reportedAt,
    approvalDeadline,
    respondedBy: random.pick(opponents),
    respondedAt,
    confirmation: MatchConfirmation.OPPONENT_APPROVED,
    confirmedAt: respondedAt,
  };
}

/** Confirmed matches spread over the past months, one every few days, the last one yesterday. */
export function planMatches({
  today,
  now,
  random,
}: {
  today: IsoDate;
  now: Date;
  random: Random;
}): PlannedMatch[] {
  const matchups = planMatchups(random);
  return matchups.map((matchup, index) => {
    const daysAgo = MATCH_SPACING_DAYS * (matchups.length - index) - (MATCH_SPACING_DAYS - 1);
    const playedOn = addDays(today, -daysAgo);
    const { startTime, court } = pickCourtAndSlot(playedOn, random);
    const winner = simulateWinner(matchup.sideA, matchup.sideB, random);
    return {
      ...matchup,
      winner,
      sets: generateSets(winner, random),
      playedOn,
      startTime,
      court,
      ...planTimeline(matchup, playedOn, startTime, now, random),
    };
  });
}

/**
 * Replays the matches in confirmation order with the shared Elo function, exactly as the API
 * will on approval. Returns each player's before/after and everyone's final rating.
 */
export function rateMatches(planned: readonly PlannedMatch[]) {
  const ratings = new Map<string, number>();
  const ratingOf = (member: SeedMember) =>
    ratings.get(member.membershipId) ?? FICC_SETTINGS.eloInitialRating;

  const matches: RatedMatch[] = [...planned]
    .sort((a, b) => a.confirmedAt.getTime() - b.confirmedAt.getTime())
    .map((match) => {
      const { deltaA, deltaB } = calculateMatchElo({
        sideA: match.sideA.map(ratingOf),
        sideB: match.sideB.map(ratingOf),
        winner: match.winner,
        k: FICC_SETTINGS.eloKFactor,
      });
      const rated: RatedPlayer[] = [
        ...match.sideA.map((member) => ({ member, delta: deltaA })),
        ...match.sideB.map((member) => ({ member, delta: deltaB })),
      ].map(({ member, delta }) => {
        const before = ratingOf(member);
        return { member, before, after: before + delta, delta };
      });
      for (const { member, after } of rated) ratings.set(member.membershipId, after);
      return { ...match, ratings: rated };
    });

  return { matches, finalRatings: ratings };
}
