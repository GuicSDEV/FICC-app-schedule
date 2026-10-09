import { randomBytes } from "node:crypto";

import type { Prisma } from "../../src";
import { addDays, type IsoDate, toDbDate } from "./dates";

/** Points for circuit placements (the spec's example table). */
const POINTS_TABLE = {
  CHAMPION: 100,
  FINALIST: 70,
  SEMIFINAL: 45,
  QUARTERFINAL: 25,
  ROUND_OF_16: 15,
  ROUND_OF_32: 10,
  PARTICIPATION: 5,
};

const NO_RESTRICTIONS = { weekdayNotBefore: null, weekendNotBefore: null, unavailableDates: [] };

interface SeedTournamentsClient {
  circuit: { create: (args: Prisma.CircuitCreateArgs) => Promise<{ id: string }> };
  circuitCategory: {
    findMany: (args: Prisma.CircuitCategoryFindManyArgs) => Promise<{ id: string; name: string }[]>;
  };
  tournament: { create: (args: Prisma.TournamentCreateArgs) => Promise<{ id: string }> };
  tournamentCategory: {
    findMany: (
      args: Prisma.TournamentCategoryFindManyArgs,
    ) => Promise<{ id: string; name: string }[]>;
  };
  tournamentEntry: { create: (args: Prisma.TournamentEntryCreateArgs) => Promise<{ id: string }> };
}

/**
 * A season circuit and two tournaments: one open for registration (with entries) and one draft,
 * so the tournaments screens have something to show. Draws and results are created in the app.
 */
export async function seedTournaments(
  prisma: SeedTournamentsClient,
  options: {
    today: IsoDate;
    adminId: string;
    singles: string[];
    doubles: [string, string][];
    season: string;
  },
): Promise<{ tournaments: number; entries: number }> {
  const circuit = await prisma.circuit.create({
    data: {
      name: `Circuito FICC ${options.season}`,
      season: options.season,
      pointsTable: POINTS_TABLE,
      categories: {
        create: [
          { name: "Simples A", sortOrder: 0 },
          { name: "Duplas", sortOrder: 1 },
        ],
      },
    },
  });
  const circuitCategories = await prisma.circuitCategory.findMany({
    where: { circuitId: circuit.id },
  });
  const circuitCategory = (name: string) =>
    circuitCategories.find((category) => category.name === name)!.id;

  const open = await prisma.tournament.create({
    data: {
      publicId: randomBytes(9).toString("base64url"),
      name: "Aberto de Primavera FICC",
      description:
        "**Etapa 1 do Circuito FICC.**\n\nJogos em melhor de 3 sets com match tie-break no 3º set. " +
        "Tolerância de 15 minutos para W.O.\n\n- Bolas fornecidas pelo clube\n- Premiação para campeões e vices",
      startDate: toDbDate(addDays(options.today, 10)),
      endDate: toDbDate(addDays(options.today, 12)),
      location: "Quadras do FICC",
      status: "REGISTRATION_OPEN",
      registrationClosesAt: new Date(`${addDays(options.today, 8)}T23:59:00-03:00`),
      allowGuests: true,
      feeAmountCents: 8000,
      restMinutes: 60,
      circuitId: circuit.id,
      createdById: options.adminId,
      categories: {
        create: [
          {
            name: "Simples A",
            entryType: "SINGLES",
            drawFormat: "SINGLE_ELIMINATION",
            maxEntries: 16,
            scoreFormat: "BEST_OF_3_MATCH_TIEBREAK",
            countsForElo: true,
            circuitCategoryId: circuitCategory("Simples A"),
            sortOrder: 0,
          },
          {
            name: "Duplas",
            entryType: "DOUBLES",
            drawFormat: "GROUPS_THEN_KNOCKOUT",
            groupSize: 4,
            advancePerGroup: 2,
            maxEntries: 8,
            scoreFormat: "PRO_SET_8",
            circuitCategoryId: circuitCategory("Duplas"),
            sortOrder: 1,
          },
        ],
      },
    },
  });
  const categories = await prisma.tournamentCategory.findMany({ where: { tournamentId: open.id } });
  const categoryId = (name: string) => categories.find((category) => category.name === name)!.id;

  let entries = 0;
  for (const userId of options.singles) {
    await prisma.tournamentEntry.create({
      data: {
        categoryId: categoryId("Simples A"),
        status: "CONFIRMED",
        paymentStatus: entries % 3 === 0 ? "UNPAID" : "PAID",
        restrictions: NO_RESTRICTIONS,
        createdById: userId,
        players: { create: [{ position: 0, userId, acceptedAt: new Date() }] },
      },
    });
    entries += 1;
  }
  for (const [first, second] of options.doubles) {
    await prisma.tournamentEntry.create({
      data: {
        categoryId: categoryId("Duplas"),
        status: "CONFIRMED",
        restrictions: { ...NO_RESTRICTIONS, weekdayNotBefore: "18:00" },
        createdById: first,
        players: {
          create: [
            { position: 0, userId: first, acceptedAt: new Date() },
            { position: 1, userId: second, acceptedAt: new Date() },
          ],
        },
      },
    });
    entries += 1;
  }

  await prisma.tournament.create({
    data: {
      publicId: randomBytes(9).toString("base64url"),
      name: "Torneio de Inverno",
      startDate: toDbDate(addDays(options.today, 45)),
      endDate: toDbDate(addDays(options.today, 47)),
      location: "Quadras do FICC",
      createdById: options.adminId,
      categories: {
        create: [
          {
            name: "Simples B",
            entryType: "SINGLES",
            drawFormat: "SINGLE_ELIMINATION",
            maxEntries: 32,
          },
        ],
      },
    },
  });
  return { tournaments: 2, entries };
}
