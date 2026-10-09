import {
  type Category,
  type Court,
  PrismaClient,
  Role,
  type Surface,
  type TimeSlot,
} from "@ficc/db";
import { DEFAULT_SLOT_GRID } from "@ficc/shared";
import { hash } from "argon2";

export const TEST_PASSWORD = "senha-teste-123";

let passwordHash: Promise<string> | null = null;
const getPasswordHash = () => (passwordHash ??= hash(TEST_PASSWORD));

/** Empties every application table. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  const list = tables.map(({ tablename }) => `"${tablename}"`).join(", ");
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export type CourtName = "Q1" | "Q2" | "Q3" | "Q4" | "Q5" | "Q6";

export interface Club {
  courts: Record<CourtName, Court>;
  slots: Record<string, TimeSlot>;
}

/** The real court layout and slot grid. */
export async function seedClub(prisma: PrismaClient): Promise<Club> {
  const surfaces: [CourtName, Surface][] = [
    ["Q1", "HARTRU"],
    ["Q2", "HARTRU"],
    ["Q3", "HARTRU"],
    ["Q4", "HARTRU"],
    ["Q5", "SAIBRO"],
    ["Q6", "SAIBRO"],
  ];
  const courts = await prisma.court.createManyAndReturn({
    data: surfaces.map(([name, surface], index) => ({ name, surface, sortOrder: index + 1 })),
  });
  const slots = await prisma.timeSlot.createManyAndReturn({
    data: DEFAULT_SLOT_GRID.map((slot) => ({ ...slot })),
  });
  return {
    courts: Object.fromEntries(courts.map((court) => [court.name, court])) as Club["courts"],
    slots: Object.fromEntries(slots.map((slot) => [slot.startTime, slot])),
  };
}

let membershipCounter = 500000;

export async function createMember(
  prisma: PrismaClient,
  options: { name?: string; membershipId?: string; categories?: Category[]; elo?: number } = {},
) {
  const membershipId = options.membershipId ?? String((membershipCounter += 1));
  await prisma.validMembershipId.upsert({
    where: { membershipId },
    create: { membershipId, holderName: options.name ?? null },
    update: {},
  });
  return prisma.user.create({
    data: {
      role: Role.MEMBER,
      membershipId,
      name: options.name ?? `Sócio ${membershipId}`,
      categories: options.categories ?? ["CLASS_B"],
      elo: options.elo ?? 1200,
      passwordHash: await getPasswordHash(),
    },
  });
}

export async function createStaff(
  prisma: PrismaClient,
  role: Role,
  email: string,
  name = "Equipe",
) {
  return prisma.user.create({ data: { role, email, name, passwordHash: await getPasswordHash() } });
}

export async function createCoach(
  prisma: PrismaClient,
  options: { name: string; email: string; courtIds: string[]; color?: string },
) {
  const user = await prisma.user.create({
    data: {
      role: Role.COACH,
      email: options.email,
      name: options.name,
      passwordHash: await getPasswordHash(),
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
  prisma: PrismaClient,
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
