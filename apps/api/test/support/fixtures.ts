import { type Court, Role, Sport, type Surface, type TimeSlot } from "@ficc/db";
import { DEFAULT_CLUB_SETTINGS, DEFAULT_STAFF_ROLES } from "@ficc/shared";
import { hash } from "argon2";

import type { TestContext } from "./app";

export const TEST_PASSWORD = "senha-teste-123";

type ScopedClient = TestContext["prisma"];

let passwordHash: Promise<string> | null = null;
const getPasswordHash = () => (passwordHash ??= hash(TEST_PASSWORD));

/** Empties every application table and forgets cached clubs. */
export async function resetDatabase(ctx: TestContext): Promise<void> {
  const tables = await ctx.base.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  const list = tables.map(({ tablename }) => `"${tablename}"`).join(", ");
  if (list) await ctx.base.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  ctx.invalidateClubs();
}

export type CourtName = "Q1" | "Q2" | "Q3" | "Q4" | "Q5" | "Q6";

export interface Club {
  id: string;
  slug: string;
  courts: Record<CourtName, Court>;
  slots: Record<string, TimeSlot>;
}

/** FICC's grid (the tests' default club mirrors the real one). */
const SLOT_START_TIMES = ["08:30", "10:00", "14:45", "16:00", "17:15", "18:30", "19:45", "21:00"];
const CATEGORIES = [
  { key: "CLASS_A", name: "Classe A", sortOrder: 1 },
  { key: "CLASS_B", name: "Classe B", sortOrder: 2 },
  { key: "CLASS_C", name: "Classe C", sortOrder: 3 },
  { key: "WOMENS", name: "Feminino", sortOrder: 4 },
  { key: "SENIORS", name: "Sênior", sortOrder: 5 },
];

/**
 * Creates a club (by default the deployment's club, "ficc") with the real court layout, slot grid
 * and categories, and makes it the fixtures' current club.
 */
export async function seedClub(
  ctx: TestContext,
  options: { slug?: string; name?: string } = {},
): Promise<Club> {
  const slug = options.slug ?? process.env.DEFAULT_CLUB_SLUG ?? "ficc";
  const club = await ctx.base.club.create({
    data: {
      slug,
      name: options.name ?? slug.toUpperCase(),
      timezone: "America/Sao_Paulo",
      locale: "pt-BR",
      settings: { create: { values: DEFAULT_CLUB_SETTINGS } },
    },
  });
  ctx.useClub(club.id);
  const prisma = ctx.prisma;
  await prisma.category.createMany({ data: CATEGORIES });
  const surfaces: [CourtName, Surface][] = [
    ["Q1", "HARTRU"],
    ["Q2", "HARTRU"],
    ["Q3", "HARTRU"],
    ["Q4", "HARTRU"],
    ["Q5", "SAIBRO"],
    ["Q6", "SAIBRO"],
  ];
  const courts = await prisma.court.createManyAndReturn({
    data: surfaces.map(([name, surface], index) => ({
      name,
      surface,
      sport: Sport.TENNIS,
      sortOrder: index + 1,
    })),
  });
  await prisma.staffRole.createMany({
    data: DEFAULT_STAFF_ROLES.map((role) => ({
      key: role.key,
      name: role.name,
      description: role.description,
      permissions: [...role.permissions],
    })),
  });
  const slots = await prisma.timeSlot.createManyAndReturn({
    data: SLOT_START_TIMES.map((startTime, index) => ({
      startTime,
      durationMinutes: DEFAULT_CLUB_SETTINGS.defaultSlotDurationMinutes,
      sortOrder: index + 1,
    })),
  });
  return {
    id: club.id,
    slug,
    courts: Object.fromEntries(courts.map((court) => [court.name, court])) as Club["courts"],
    slots: Object.fromEntries(slots.map((slot) => [slot.startTime, slot])),
  };
}

let membershipCounter = 500000;

export async function createMember(
  prisma: ScopedClient,
  options: { name?: string; membershipId?: string; categories?: string[]; elo?: number } = {},
) {
  const membershipId = options.membershipId ?? String((membershipCounter += 1));
  const listed = await prisma.validMembershipId.findFirst({ where: { membershipId } });
  if (!listed) {
    await prisma.validMembershipId.create({
      data: { membershipId, holderName: options.name ?? null },
    });
  }
  const categories = await prisma.category.findMany({
    where: { key: { in: options.categories ?? ["CLASS_B"] } },
  });
  return prisma.user.create({
    data: {
      role: Role.MEMBER,
      membershipId,
      name: options.name ?? `Sócio ${membershipId}`,
      passwordHash: await getPasswordHash(),
      categories: { create: categories.map((category) => ({ categoryId: category.id })) },
      ratings: {
        create: {
          sport: Sport.TENNIS,
          elo: options.elo ?? DEFAULT_CLUB_SETTINGS.eloInitialRating,
        },
      },
    },
  });
}

/** A member's current rating in tennis (the clubs' primary sport in the tests). */
export async function ratingOf(prisma: ScopedClient, userId: string): Promise<number> {
  const rating = await prisma.playerRating.findFirstOrThrow({
    where: { userId, sport: Sport.TENNIS },
  });
  return rating.elo;
}

export async function setRating(prisma: ScopedClient, userId: string, elo: number): Promise<void> {
  await prisma.playerRating.updateMany({ where: { userId, sport: Sport.TENNIS }, data: { elo } });
}

/**
 * A staff account. Admins get the Super admin role unless `roles` names other default roles
 * (SECRETARIA, DIRETORIA…); gate accounts get none.
 */
export async function createStaff(
  prisma: ScopedClient,
  role: Role,
  email: string,
  name = "Equipe",
  roles: string[] = role === Role.ADMIN ? ["SUPER_ADMIN"] : [],
) {
  const roleRows = await prisma.staffRole.findMany({ where: { key: { in: roles } } });
  return prisma.user.create({
    data: {
      role,
      email,
      name,
      passwordHash: await getPasswordHash(),
      staffRoles: { create: roleRows.map((row) => ({ roleId: row.id })) },
    },
  });
}

export async function createCoach(
  prisma: ScopedClient,
  options: { name: string; email: string; courtIds: string[]; color?: string },
) {
  const user = await prisma.user.create({
    data: {
      role: Role.COACH,
      email: options.email,
      name: options.name,
      passwordHash: await getPasswordHash(),
      staffRoles: {
        create: (await prisma.staffRole.findMany({ where: { key: "PROFESSOR" } })).map((row) => ({
          roleId: row.id,
        })),
      },
      coach: {
        create: {
          displayName: options.name,
          color: options.color ?? "#8B7CF6",
          allowedCourts: { create: options.courtIds.map((courtId) => ({ courtId })) },
        },
      },
    },
    include: { coach: true },
  });
  return { user, coach: user.coach! };
}

/** A scheduled one-off lesson holding its slot, as the lessons module creates it. */
export async function createLesson(
  prisma: ScopedClient,
  options: { coachId: string; courtId: string; timeSlotId: string; date: string },
) {
  const lesson = await prisma.lesson.create({
    data: {
      coachId: options.coachId,
      courtId: options.courtId,
      timeSlotId: options.timeSlotId,
      date: new Date(`${options.date}T00:00:00.000Z`),
    },
  });
  await prisma.slotOccupancy.create({
    data: {
      courtId: lesson.courtId,
      date: lesson.date,
      timeSlotId: lesson.timeSlotId,
      lessonId: lesson.id,
    },
  });
  return lesson;
}
