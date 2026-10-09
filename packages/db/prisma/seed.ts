// Development seed: wipes every table, then loads the real club setup (courts, slot grid,
// coaches, lesson template) plus fictional members and a history of confirmed matches.
// Run with `pnpm db:seed`. Deterministic: the same data every run, dated relative to today.

import { CATEGORY_LABELS, DEFAULT_SLOT_GRID, ELO_INITIAL_RATING } from "@ficc/shared";
import { hash } from "argon2";

import {
  BookingType,
  type Category,
  LessonAuditAction,
  LessonStatus,
  MatchStatus,
  Prisma,
  PrismaClient,
  Role,
  TeamSide,
} from "../src";
import {
  COACHES,
  type CoachKey,
  COURTS,
  type CourtName,
  LESSON_TEMPLATE,
  LESSON_WEEKDAYS,
  LESSON_WINDOW_WEEKS,
  MEMBERS,
  STAFF,
  UNCLAIMED_MEMBERSHIPS,
} from "./seed/data";
import { addDays, clubToday, type IsoDate, toDbDate, weekdayOf } from "./seed/dates";
import { planMatches, rateMatches } from "./seed/matches";
import { createRandom } from "./seed/random";
import { printTable } from "./seed/report";

const RANDOM_SEED = 0xf1cc;
const DEFAULT_SEED_PASSWORD = "ficc1234";

const prisma = new PrismaClient();

function lookup<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Seed lookup failed for ${String(key)}`);
  return value;
}

/** Empties every application table (keeps Prisma's migration history). */
async function resetDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed with NODE_ENV=production: the seed wipes every table.");
  }

  const now = new Date();
  const today = clubToday(now);
  const random = createRandom(RANDOM_SEED);
  const password = process.env.SEED_PASSWORD ?? DEFAULT_SEED_PASSWORD;
  // Every seeded account shares one development password, so hash it once.
  const passwordHash = await hash(password);

  await resetDatabase();

  // ── Courts and slot grid ──────────────────────────────────────────────────
  const courts = await prisma.court.createManyAndReturn({
    data: COURTS.map((court, index) => ({ ...court, sortOrder: index + 1 })),
  });
  const courtIds = new Map(courts.map((court) => [court.name as CourtName, court.id]));
  const courtSurfaces = new Map(courts.map((court) => [court.name as CourtName, court.surface]));

  const slots = await prisma.timeSlot.createManyAndReturn({
    data: DEFAULT_SLOT_GRID.map((slot) => ({ ...slot })),
  });
  const slotIds = new Map(slots.map((slot) => [slot.startTime, slot.id]));

  // ── Staff and coaches ─────────────────────────────────────────────────────
  const staff = [];
  for (const account of STAFF) {
    staff.push(await prisma.user.create({ data: { ...account, passwordHash } }));
  }
  const admin = staff.find((user) => user.role === Role.ADMIN);
  if (!admin) throw new Error("The seed needs an admin account");

  const coachIds = new Map<CoachKey, string>();
  for (const [key, coach] of Object.entries(COACHES) as [CoachKey, (typeof COACHES)[CoachKey]][]) {
    const user = await prisma.user.create({
      data: {
        role: Role.COACH,
        email: coach.email,
        name: coach.displayName,
        passwordHash,
        coach: {
          create: {
            displayName: coach.displayName,
            color: coach.color,
            allowedCourts: {
              create: coach.courts.map((court) => ({ courtId: lookup(courtIds, court) })),
            },
          },
        },
      },
      include: { coach: true },
    });
    coachIds.set(key, user.coach!.id);
  }

  // ── Lesson series and their occurrences for the rolling window ────────────
  const windowEnd = addDays(today, LESSON_WINDOW_WEEKS * 7 - 1);
  const lessonDates: IsoDate[] = [];
  for (let date = today; date <= windowEnd; date = addDays(date, 1)) {
    if (LESSON_WEEKDAYS.includes(weekdayOf(date))) lessonDates.push(date);
  }

  const series = [];
  for (const [startTime, cells] of Object.entries(LESSON_TEMPLATE)) {
    for (const [court, coachKey] of Object.entries(cells) as [CourtName, CoachKey][]) {
      if (!COACHES[coachKey].courts.includes(court)) {
        throw new Error(`${COACHES[coachKey].displayName} is not allowed on ${court}`);
      }
      const created = await prisma.lessonSeries.create({
        data: {
          coachId: lookup(coachIds, coachKey),
          courtId: lookup(courtIds, court),
          timeSlotId: lookup(slotIds, startTime),
          weekdays: [...LESSON_WEEKDAYS],
          startDate: toDbDate(today),
          generatedUntil: toDbDate(windowEnd),
        },
      });
      series.push({ ...created, court, startTime });
    }
  }

  await prisma.lessonAuditLog.createMany({
    data: series.map((entry) => ({
      seriesId: entry.id,
      actorId: admin.id,
      action: LessonAuditAction.SERIES_CREATED,
      details: {
        source: "seed",
        court: entry.court,
        startTime: entry.startTime,
        weekdays: entry.weekdays,
        startDate: today,
      },
    })),
  });

  const lessons = await prisma.lesson.createManyAndReturn({
    data: series.flatMap((entry) =>
      lessonDates.map((date) => ({
        seriesId: entry.id,
        coachId: entry.coachId,
        courtId: entry.courtId,
        timeSlotId: entry.timeSlotId,
        date: toDbDate(date),
      })),
    ),
  });
  // Each scheduled lesson claims its court + date + slot (see SlotOccupancy in schema.prisma).
  await prisma.slotOccupancy.createMany({
    data: lessons.map((lesson) => ({
      courtId: lesson.courtId,
      date: lesson.date,
      timeSlotId: lesson.timeSlotId,
      lessonId: lesson.id,
    })),
  });

  // ── Members, with ratings replayed from their match history ───────────────
  const ratedMatches = rateMatches(planMatches({ today, now, random }));

  await prisma.validMembershipId.createMany({
    data: [
      ...MEMBERS.map((member) => ({ membershipId: member.membershipId, holderName: member.name })),
      ...UNCLAIMED_MEMBERSHIPS,
    ],
  });
  const members = await prisma.user.createManyAndReturn({
    data: MEMBERS.map((member) => ({
      role: Role.MEMBER,
      membershipId: member.membershipId,
      name: member.name,
      categories: [...member.categories],
      passwordHash,
      elo: ratedMatches.finalRatings.get(member.membershipId) ?? ELO_INITIAL_RATING,
    })),
  });
  const memberIds = new Map(members.map((user) => [user.membershipId!, user.id]));
  const memberId = (membershipId: string) => lookup(memberIds, membershipId);

  // ── Confirmed matches with their rating history ───────────────────────────
  for (const match of ratedMatches.matches) {
    await prisma.match.create({
      data: {
        type: match.type,
        status: MatchStatus.CONFIRMED,
        playedOn: toDbDate(match.playedOn),
        surface: lookup(courtSurfaces, match.court),
        courtId: lookup(courtIds, match.court),
        winnerSide: match.winner,
        reportedById: memberId(match.reportedBy.membershipId),
        reportedAt: match.reportedAt,
        approvalDeadline: match.approvalDeadline,
        respondedById: match.respondedBy ? memberId(match.respondedBy.membershipId) : null,
        respondedAt: match.respondedAt,
        confirmation: match.confirmation,
        confirmedAt: match.confirmedAt,
        players: {
          create: [
            ...match.sideA.map((member) => ({
              userId: memberId(member.membershipId),
              side: TeamSide.A,
            })),
            ...match.sideB.map((member) => ({
              userId: memberId(member.membershipId),
              side: TeamSide.B,
            })),
          ],
        },
        sets: { create: match.sets },
        eloHistory: {
          create: match.ratings.map((rating) => ({
            userId: memberId(rating.member.membershipId),
            before: rating.before,
            after: rating.after,
            delta: rating.delta,
            createdAt: match.confirmedAt,
          })),
        },
      },
    });
  }

  const checks = await runIntegrityChecks(members[0]!.id);
  await printSummary({ today, windowEnd, password, checks });

  if (checks.some((check) => !check.passed)) {
    throw new Error("Seed integrity checks failed (see the table above)");
  }
}

interface IntegrityCheck {
  name: string;
  passed: boolean;
  detail: string;
}

async function runIntegrityChecks(anyMemberId: string): Promise<IntegrityCheck[]> {
  const checks: IntegrityCheck[] = [];

  const [scheduledLessons, lessonOccupancies] = await Promise.all([
    prisma.lesson.count({ where: { status: LessonStatus.SCHEDULED } }),
    prisma.slotOccupancy.count({ where: { lessonId: { not: null } } }),
  ]);
  checks.push({
    name: "Every scheduled lesson holds one slot occupancy",
    passed: scheduledLessons === lessonOccupancies,
    detail: `${scheduledLessons} lessons / ${lessonOccupancies} occupancies`,
  });

  const [{ outsideAllowed }] = await prisma.$queryRaw<[{ outsideAllowed: number }]>`
    SELECT count(*)::int AS "outsideAllowed" FROM "Lesson" l
    WHERE NOT EXISTS (
      SELECT 1 FROM "CoachCourt" cc WHERE cc."coachId" = l."coachId" AND cc."courtId" = l."courtId"
    )`;
  checks.push({
    name: "Lessons only on their coach's allowed courts",
    passed: outsideAllowed === 0,
    detail: `${outsideAllowed} violations`,
  });

  // The guard itself: a booking on a slot a lesson already holds must be rejected by the DB.
  const occupied = await prisma.slotOccupancy.findFirstOrThrow({
    where: { lessonId: { not: null } },
  });
  let guardError = "accepted (guard missing!)";
  try {
    await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.create({
        data: {
          type: BookingType.SINGLES,
          courtId: occupied.courtId,
          timeSlotId: occupied.timeSlotId,
          date: occupied.date,
          createdById: anyMemberId,
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        },
      });
      await tx.slotOccupancy.create({
        data: {
          courtId: occupied.courtId,
          date: occupied.date,
          timeSlotId: occupied.timeSlotId,
          bookingId: booking.id,
        },
      });
      throw new Error("guard-did-not-fire");
    });
  } catch (error) {
    guardError =
      error instanceof Prisma.PrismaClientKnownRequestError ? error.code : (error as Error).message;
  }
  checks.push({
    name: "A booking cannot take a lesson's slot",
    passed: guardError === "P2002",
    detail: guardError === "P2002" ? "rejected with P2002 (rolled back)" : guardError,
  });

  const history = await prisma.eloHistory.findMany({
    orderBy: [{ userId: "asc" }, { createdAt: "asc" }],
  });
  const users = await prisma.user.findMany({ where: { role: Role.MEMBER } });
  const historyByUser = new Map<string, typeof history>();
  for (const row of history) {
    historyByUser.set(row.userId, [...(historyByUser.get(row.userId) ?? []), row]);
  }
  const brokenChains = users.filter((user) => {
    let rating = ELO_INITIAL_RATING;
    for (const row of historyByUser.get(user.id) ?? []) {
      if (row.before !== rating) return true;
      rating = row.after;
    }
    return rating !== user.elo;
  });
  checks.push({
    name: "Elo history chains from 1200 to each member's Elo",
    passed: brokenChains.length === 0,
    detail: `${users.length - brokenChains.length}/${users.length} members consistent`,
  });

  const unbalanced = await prisma.eloHistory.groupBy({
    by: ["matchId"],
    _sum: { delta: true },
    having: { delta: { _sum: { not: 0 } } },
  });
  checks.push({
    name: "Every match is zero-sum",
    passed: unbalanced.length === 0,
    detail: `${unbalanced.length} unbalanced matches`,
  });

  const matches = await prisma.match.findMany({ include: { sets: true } });
  const wrongWinner = matches.filter((match) => {
    const setsWonByA = match.sets.filter((set) => set.sideAGames > set.sideBGames).length;
    return (setsWonByA === 2 ? TeamSide.A : TeamSide.B) !== match.winnerSide;
  });
  checks.push({
    name: "Stored winner matches the sets",
    passed: wrongWinner.length === 0,
    detail: `${matches.length - wrongWinner.length}/${matches.length} matches`,
  });

  return checks;
}

async function printSummary({
  today,
  windowEnd,
  password,
  checks,
}: {
  today: IsoDate;
  windowEnd: IsoDate;
  password: string;
  checks: IntegrityCheck[];
}): Promise<void> {
  const [
    courts,
    slots,
    staff,
    coaches,
    seriesCount,
    lessonCount,
    occupancyCount,
    auditCount,
    validIds,
    members,
    matches,
    setCount,
    eloRows,
  ] = await Promise.all([
    prisma.court.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.timeSlot.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.GATE] } },
      orderBy: { role: "asc" },
    }),
    prisma.coach.findMany({
      include: {
        user: true,
        allowedCourts: { include: { court: true } },
        _count: { select: { lessonSeries: true, lessons: true } },
      },
      orderBy: { displayName: "asc" },
    }),
    prisma.lessonSeries.count(),
    prisma.lesson.count(),
    prisma.slotOccupancy.count(),
    prisma.lessonAuditLog.count(),
    prisma.validMembershipId.findMany({ include: { user: true } }),
    prisma.user.findMany({
      where: { role: Role.MEMBER },
      include: { matchPlayers: { include: { match: true } } },
      orderBy: [{ elo: "desc" }, { name: "asc" }],
    }),
    prisma.match.findMany(),
    prisma.matchSet.count(),
    prisma.eloHistory.count(),
  ]);

  const surfaceCourts = (surface: string, label: string) =>
    `${courts
      .filter((court) => court.surface === surface)
      .map((court) => court.name)
      .join(", ")} ${label}`;
  const perCategory = (Object.keys(CATEGORY_LABELS) as Category[])
    .map((category) => {
      const count = members.filter((member) => member.categories.includes(category)).length;
      return `${CATEGORY_LABELS[category]} ${count}`;
    })
    .join(" · ");
  const singles = matches.filter((match) => match.type === "SINGLES").length;
  const autoApproved = matches.filter((match) => match.confirmation === "AUTO_APPROVED").length;
  const playedDates = matches.map((match) => match.playedOn.toISOString().slice(0, 10)).sort();
  const claimed = validIds.filter((entry) => entry.user).length;

  console.log(`\nFICC seed complete · club date ${today} (America/Sao_Paulo)`);

  printTable(
    "Seeded data",
    ["What", "Count", "Details"],
    [
      [
        "Courts",
        courts.length,
        `${surfaceCourts("HARTRU", "Har-Tru")} · ${surfaceCourts("SAIBRO", "Saibro")}`,
      ],
      [
        "Time slots",
        slots.length,
        `${slots.map((slot) => slot.startTime).join(" ")} · ${slots[0]?.durationMinutes} min each`,
      ],
      [
        "Staff accounts",
        staff.length,
        staff.map((user) => `${user.email} (${user.role})`).join(" · "),
      ],
      ["Coaches", coaches.length, coaches.map((coach) => coach.displayName).join(" · ")],
      ["Lesson series", seriesCount, `Mon–Fri, starting ${today}`],
      [
        "Lessons",
        lessonCount,
        `${today} → ${windowEnd} (${LESSON_WINDOW_WEEKS} weeks), all scheduled`,
      ],
      ["Slot occupancies", occupancyCount, "one per scheduled lesson"],
      ["Lesson audit log", auditCount, "SERIES_CREATED by the admin"],
      [
        "Valid membership IDs",
        validIds.length,
        `${claimed} registered · ${validIds.length - claimed} free for sign-up`,
      ],
      ["Members", members.length, perCategory],
      [
        "Matches",
        matches.length,
        `${singles} singles · ${matches.length - singles} doubles · all confirmed (${autoApproved} auto-approved)`,
      ],
      ["Match sets", setCount, "best of 3, some with a match tie-break"],
      ["Elo history", eloRows, `${playedDates[0]} → ${playedDates.at(-1)}`],
    ],
    ["left", "right", "left"],
  );

  printTable(
    "Coaches",
    ["Coach", "Login", "Allowed courts", "Series", "Lessons"],
    coaches.map((coach) => [
      coach.displayName,
      coach.user.email ?? "",
      coach.allowedCourts
        .map((entry) => entry.court.name)
        .sort()
        .join(", "),
      coach._count.lessonSeries,
      coach._count.lessons,
    ]),
    ["left", "left", "left", "right", "right"],
  );

  printTable(
    "Top 5 by Elo",
    ["#", "Player", "Matrícula", "Categories", "Elo", "W-L"],
    members.slice(0, 5).map((member, index) => {
      const wins = member.matchPlayers.filter(
        (entry) => entry.side === entry.match.winnerSide,
      ).length;
      return [
        index + 1,
        member.name,
        member.membershipId ?? "",
        member.categories.map((category) => CATEGORY_LABELS[category]).join(", "),
        member.elo,
        `${wins}-${member.matchPlayers.length - wins}`,
      ];
    }),
    ["right", "left", "left", "left", "right", "left"],
  );

  printTable(
    "Integrity checks",
    ["Check", "Result", "Detail"],
    checks.map((check) => [check.name, check.passed ? "OK" : "FAILED", check.detail]),
  );

  console.log(
    `\nLogin: members use their matrícula, staff and coaches their email. Password for every seeded account: ${password}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
