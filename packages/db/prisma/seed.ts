// Development seed: wipes every table, then creates the FICC club (settings, categories) and
// loads its real setup (courts, slot grid, coaches, lesson template) plus fictional members and
// a history of confirmed matches. Everything after the club row goes through the same tenant
// extension the API uses, so every row gets FICC's clubId.
// Run with `pnpm db:seed`. Deterministic: the same data every run, dated relative to today.

import { DEFAULT_STAFF_ROLES, timeToMinutes, slotEndTime, slotStartsAt } from "@ficc/shared";
import { hash } from "argon2";

import {
  BookingType,
  LessonAuditAction,
  LessonStatus,
  MatchStatus,
  MatchType,
  Prisma,
  PrismaClient,
  Role,
  Sport,
  TeamSide,
  tenantExtension,
  UserStatus,
} from "../src";
import {
  COACHES,
  type CoachKey,
  COURTS,
  type CourtName,
  FICC_CATEGORIES,
  FICC_CLUB,
  FICC_SETTINGS,
  FICC_SLOT_GRID,
  FICC_WEEKDAY_TIMES,
  FICC_WEEKEND_TIMES,
  LESSON_TEMPLATE,
  LESSON_WEEKDAYS,
  LESSON_WINDOW_DAYS,
  MEMBERS,
  NEWS_POSTS,
  PARTNER_REQUESTS,
  PENDING_SIGNUP,
  STAFF,
  UNCLAIMED_MEMBERSHIPS,
} from "./seed/data";
import { addDays, clubToday, type IsoDate, toDbDate, weekdayOf } from "./seed/dates";
import { planMatches, rateMatches } from "./seed/matches";
import { createRandom } from "./seed/random";
import { seedTournaments } from "./seed/tournaments";
import { printTable } from "./seed/report";

const RANDOM_SEED = 0xf1cc;
const DEFAULT_SEED_PASSWORD = "ficc1234";

const base = new PrismaClient();
let clubId: string | undefined;
/** Scoped to FICC once the club row exists (see tenantExtension in src/tenant.ts). */
const prisma = base.$extends(tenantExtension(() => clubId));
type SeedClient = typeof prisma;

function lookup<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Seed lookup failed for ${String(key)}`);
  return value;
}

/** Empties every application table (keeps Prisma's migration history). */
async function resetDatabase(): Promise<void> {
  const tables = await base.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`).join(", ");
  await base.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

async function main(): Promise<void> {
  // A demo deployment may load this data on purpose (fresh database, its own password); the real
  // club's database never: it is created with `pnpm db:bootstrap`.
  if (process.env.NODE_ENV === "production") {
    if (process.env.SEED_ALLOW_WIPE !== "yes") {
      throw new Error(
        "Refusing to seed with NODE_ENV=production: the seed wipes every table. " +
          "Only for a demo deployment: set SEED_ALLOW_WIPE=yes and SEED_PASSWORD.",
      );
    }
    if (!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD === DEFAULT_SEED_PASSWORD) {
      throw new Error("A demo deployment needs its own SEED_PASSWORD (not the development one).");
    }
  }

  const now = new Date();
  const today = clubToday(now, FICC_CLUB.timezone);
  const random = createRandom(RANDOM_SEED);
  const password = process.env.SEED_PASSWORD || DEFAULT_SEED_PASSWORD;
  // Every seeded account shares one development password, so hash it once.
  const passwordHash = await hash(password);

  await resetDatabase();

  // ── The club, its rules and categories ────────────────────────────────────
  const club = await base.club.create({
    data: { ...FICC_CLUB, settings: { create: { values: FICC_SETTINGS } } },
  });
  clubId = club.id;
  const categories = await prisma.category.createManyAndReturn({ data: [...FICC_CATEGORIES] });
  const categoryIds = new Map(categories.map((category) => [category.key, category.id]));

  // ── Courts and slot grid ──────────────────────────────────────────────────
  const courts = await prisma.court.createManyAndReturn({
    data: COURTS.map((court, index) => ({ ...court, sortOrder: index + 1 })),
  });
  const courtIds = new Map(courts.map((court) => [court.name as CourtName, court.id]));
  const courtSurfaces = new Map(courts.map((court) => [court.name as CourtName, court.surface]));

  const slots = await prisma.timeSlot.createManyAndReturn({
    data: FICC_SLOT_GRID.map((slot) => ({ ...slot })),
  });
  const slotIds = new Map(slots.map((slot) => [slot.startTime, slot.id]));

  // ── Staff roles, staff and coaches ────────────────────────────────────────
  const staffRoles = await prisma.staffRole.createManyAndReturn({
    data: DEFAULT_STAFF_ROLES.map((role) => ({
      key: role.key,
      name: role.name,
      description: role.description,
      permissions: [...role.permissions],
    })),
  });
  const roleIds = new Map(staffRoles.map((role) => [role.key!, role.id]));
  const staff = [];
  for (const { roles, ...account } of STAFF) {
    staff.push(
      await prisma.user.create({
        data: {
          ...account,
          passwordHash,
          staffRoles: { create: roles.map((key) => ({ roleId: lookup(roleIds, key) })) },
        },
      }),
    );
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
        staffRoles: { create: [{ roleId: lookup(roleIds, "PROFESSOR") }] },
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
  const windowEnd = addDays(today, LESSON_WINDOW_DAYS - 1);
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
      passwordHash,
    })),
  });
  const memberIds = new Map(members.map((user) => [user.membershipId!, user.id]));
  const memberId = (membershipId: string) => lookup(memberIds, membershipId);
  await prisma.userCategory.createMany({
    data: MEMBERS.flatMap((member) =>
      member.categories.map((key) => ({
        userId: memberId(member.membershipId),
        categoryId: lookup(categoryIds, key),
      })),
    ),
  });
  const ratedMatchCount = new Map<string, number>();
  for (const match of ratedMatches.matches) {
    for (const rating of match.ratings) {
      const key = rating.member.membershipId;
      ratedMatchCount.set(key, (ratedMatchCount.get(key) ?? 0) + 1);
    }
  }
  await prisma.playerRating.createMany({
    data: MEMBERS.map((member) => ({
      userId: memberId(member.membershipId),
      sport: Sport.TENNIS,
      elo: ratedMatches.finalRatings.get(member.membershipId) ?? FICC_SETTINGS.eloInitialRating,
      matches: ratedMatchCount.get(member.membershipId) ?? 0,
    })),
  });

  // ── Confirmed matches with their rating history ───────────────────────────
  for (const match of ratedMatches.matches) {
    await prisma.match.create({
      data: {
        format: match.format,
        type: MatchType.RANKED,
        sport: Sport.TENNIS,
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
            sport: Sport.TENNIS,
            before: rating.before,
            after: rating.after,
            delta: rating.delta,
            createdAt: match.confirmedAt,
          })),
        },
      },
    });
  }

  // ── A circuit and tournaments (one open for registration, one draft) ──────
  // Rafael (the first member) stays out of the singles so the registration can be tried.
  const others = MEMBERS.slice(1).map((member) => memberId(member.membershipId));
  await seedTournaments(prisma, {
    today,
    adminId: admin.id,
    season: today.slice(0, 4),
    singles: others.slice(0, 11),
    doubles: [
      [memberId(MEMBERS[0]!.membershipId), others[11]!],
      [others[12]!, others[13]!],
      [others[14]!, others[15]!],
      [others[16]!, others[17]!],
      [others[18]!, others[19]!],
    ],
  });

  // ── A self sign-up waiting for approval ───────────────────────────────────
  await prisma.user.create({
    data: {
      role: Role.MEMBER,
      membershipId: PENDING_SIGNUP.membershipId,
      name: PENDING_SIGNUP.name,
      passwordHash,
      status: UserStatus.PENDING,
      createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      ratings: { create: { sport: Sport.TENNIS, elo: FICC_SETTINGS.eloInitialRating } },
    },
  });

  // ── A maintenance day: the clay courts close (date exception) ────────────
  await prisma.scheduleException.create({
    data: {
      date: toDbDate(addDays(today, 5)),
      closedCourtIds: [lookup(courtIds, "Q5"), lookup(courtIds, "Q6")],
      note: "Manutenção do saibro (Q5 e Q6)",
      createdById: admin.id,
    },
  });

  // ── Mural ─────────────────────────────────────────────────────────────────
  for (const post of NEWS_POSTS) {
    await prisma.newsPost.create({
      data: {
        title: post.title,
        body: post.body,
        pinned: post.pinned,
        eventDate: post.eventInDays === null ? null : toDbDate(addDays(today, post.eventInDays)),
        authorId: lookup(
          new Map(staff.map((user) => [user.email!, user.id])),
          "secretaria@ficc.test",
        ),
        publishedAt: new Date(now.getTime() - post.daysAgo * 24 * 60 * 60 * 1000),
      },
    });
  }

  // ── Looking for a partner: members with nobody to play with ──────────────
  const requestDays: IsoDate[] = [];
  for (let date = addDays(today, 1); requestDays.length < 2; date = addDays(date, 1)) {
    if (!["SAT", "SUN"].includes(weekdayOf(date))) requestDays.push(date);
  }
  const evening = slots
    .filter((slot) => (FICC_WEEKDAY_TIMES as readonly string[]).includes(slot.startTime))
    .sort((a, b) => b.sortOrder - a.sortOrder)
    .slice(0, 2);
  for (const [index, request] of PARTNER_REQUESTS.entries()) {
    const date = requestDays[index % requestDays.length]!;
    const slot = evening[index % evening.length]!;
    await prisma.partnerRequest.create({
      data: {
        userId: memberId(request.membershipId),
        date: toDbDate(date),
        timeSlotId: slot.id,
        type: request.type,
        note: request.note,
        startsAt: slotStartsAt(date, slot, FICC_CLUB.timezone),
      },
    });
  }

  const checks = await runIntegrityChecks(prisma, members[0]!.id);
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

async function runIntegrityChecks(
  prisma: SeedClient,
  anyMemberId: string,
): Promise<IntegrityCheck[]> {
  const checks: IntegrityCheck[] = [];

  // FICC's grids: weekdays use the 8 slots of the spec (lunch gap, last ending at 22:15), weekends
  // their own earlier grid; neither overlaps itself and the two differ.
  const allSlots = await prisma.timeSlot.findMany({ orderBy: { sortOrder: "asc" } });
  const gridOf = (times: readonly string[]) =>
    allSlots.filter((slot) => times.includes(slot.startTime));
  const overlaps = (grid: typeof allSlots) =>
    grid.filter(
      (slot, index) =>
        index > 0 && timeToMinutes(slotEndTime(grid[index - 1]!)) > timeToMinutes(slot.startTime),
    ).length;
  const weekday = gridOf(FICC_WEEKDAY_TIMES);
  const weekend = gridOf(FICC_WEEKEND_TIMES);
  const settingsRow = await prisma.clubSettings.findFirstOrThrow();
  const stored = settingsRow.values as { scheduleGrids?: Record<string, string[]> };
  const gridOk =
    weekday.length === 8 &&
    overlaps(weekday) === 0 &&
    slotEndTime(weekday[1]!) === "11:15" &&
    weekday[2]!.startTime === "14:45" &&
    slotEndTime(weekday.at(-1)!) === "22:15" &&
    weekend.length === FICC_WEEKEND_TIMES.length &&
    overlaps(weekend) === 0 &&
    JSON.stringify(stored.scheduleGrids?.MON) !== JSON.stringify(stored.scheduleGrids?.SAT);
  checks.push({
    name: "Slot grids: weekdays 8 × 75 min to 22:15, weekends differ, no overlap",
    passed: gridOk,
    detail: `seg–sex ${weekday.map((slot) => slot.startTime).join(" ")} · sáb/dom ${weekend.map((slot) => slot.startTime).join(" ")}`,
  });

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
    WHERE l."clubId" = ${clubId} AND NOT EXISTS (
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
    where: { sport: Sport.TENNIS },
    orderBy: [{ userId: "asc" }, { createdAt: "asc" }],
  });
  const users = await prisma.user.findMany({
    where: { role: Role.MEMBER },
    include: { ratings: { where: { sport: Sport.TENNIS } } },
  });
  const historyByUser = new Map<string, typeof history>();
  for (const row of history) {
    historyByUser.set(row.userId, [...(historyByUser.get(row.userId) ?? []), row]);
  }
  const brokenChains = users.filter((user) => {
    let rating = FICC_SETTINGS.eloInitialRating;
    const rows = historyByUser.get(user.id) ?? [];
    for (const row of rows) {
      if (row.before !== rating) return true;
      rating = row.after;
    }
    const current = user.ratings[0];
    return !current || rating !== current.elo || current.matches !== rows.length;
  });
  checks.push({
    name: "Elo history chains from 1200 to each member's rating",
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
      include: {
        matchPlayers: { include: { match: true } },
        ratings: { where: { sport: Sport.TENNIS } },
        categories: { include: { category: true } },
      },
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
  const eloOf = (member: (typeof members)[number]) => member.ratings[0]?.elo ?? 0;
  members.sort((a, b) => eloOf(b) - eloOf(a) || a.name.localeCompare(b.name));
  const perCategory = FICC_CATEGORIES.map((category) => {
    const count = members.filter((member) =>
      member.categories.some((entry) => entry.category.key === category.key),
    ).length;
    return `${category.name} ${count}`;
  }).join(" · ");
  const singles = matches.filter((match) => match.format === "SINGLES").length;
  const autoApproved = matches.filter((match) => match.confirmation === "AUTO_APPROVED").length;
  const playedDates = matches.map((match) => match.playedOn.toISOString().slice(0, 10)).sort();
  const claimed = validIds.filter((entry) => entry.user).length;

  console.log(`\n${FICC_CLUB.name} seed complete · club date ${today} (${FICC_CLUB.timezone})`);

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
        `${today} → ${windowEnd} (${LESSON_WINDOW_DAYS / 7} weeks), all scheduled`,
      ],
      ["Slot occupancies", occupancyCount, "one per scheduled lesson"],
      ["Lesson audit log", auditCount, "SERIES_CREATED by the admin"],
      [
        "Valid membership IDs",
        validIds.length,
        `${claimed} registered · ${validIds.length - claimed} free for sign-up`,
      ],
      ["Club", 1, `${FICC_CLUB.name} (${FICC_CLUB.slug}) · ${FICC_CLUB.locale} · settings stored`],
      [
        "Categories",
        FICC_CATEGORIES.length,
        FICC_CATEGORIES.map((category) => category.name).join(" · "),
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
        member.categories.map((entry) => entry.category.name).join(", "),
        eloOf(member),
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
  .finally(() => base.$disconnect());
