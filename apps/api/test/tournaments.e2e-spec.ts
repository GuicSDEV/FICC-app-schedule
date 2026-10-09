import { Role, type User } from "@ficc/db";
import type { DrawView, ScheduleBoard, TournamentDetail, TournamentMatchView } from "@ficc/shared";
import type TestAgent from "supertest/lib/agent";

import { ResultsService } from "../src/tournaments/results.service";
import { createTestApp, type TestContext } from "./support/app";
import {
  type Club,
  createCoach,
  createLesson,
  createMember,
  createStaff,
  ratingOf,
  resetDatabase,
  seedClub,
} from "./support/fixtures";

// Fake clock: Monday 2030-03-04 09:00 club time.
const TUESDAY = "2030-03-05";
const WEDNESDAY = "2030-03-06";

describe("Tournaments", () => {
  let ctx: TestContext;
  let club: Club;
  let admin$: TestAgent;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  beforeEach(async () => {
    ctx.clock.reset();
    ctx.random.reset();
    await resetDatabase(ctx);
    club = await seedClub(ctx);
    await createStaff(ctx.prisma, Role.ADMIN, "admin@ficc.test", "Administração");
    admin$ = await ctx.loginStaff("admin@ficc.test");
  });

  const createTournament = async (
    category: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ): Promise<{ tournament: TournamentDetail; categoryId: string }> => {
    const created = await admin$
      .post("/api/v1/tournaments")
      .send({ name: "Aberto de Outono", startDate: TUESDAY, endDate: "2030-03-10", ...extra })
      .expect(201);
    const withCategory = await admin$
      .post(`/api/v1/tournaments/${created.body.id}/categories`)
      .send({
        name: "Simples A",
        entryType: "SINGLES",
        drawFormat: "SINGLE_ELIMINATION",
        maxEntries: 16,
        ...category,
      })
      .expect(201);
    return { tournament: withCategory.body, categoryId: withCategory.body.categories[0].id };
  };

  const setStatus = (id: string, status: string, expected = 200) =>
    admin$.post(`/api/v1/tournaments/${id}/status`).send({ status }).expect(expected);

  const addEntry = (
    tournamentId: string,
    categoryId: string,
    players: User[],
    restrictions?: object,
  ) =>
    admin$
      .post(`/api/v1/tournaments/${tournamentId}/categories/${categoryId}/entries/manual`)
      .send({
        players: players.map((player) => ({ userId: player.id })),
        ...(restrictions ? { restrictions } : {}),
      })
      .expect(201);

  const draw = async (tournamentId: string, categoryId: string): Promise<DrawView> =>
    (await admin$.get(`/api/v1/tournaments/${tournamentId}/draws/${categoryId}`).expect(200)).body;

  const allMatches = (view: DrawView): TournamentMatchView[] => [
    ...view.groups.flatMap((group) => group.matches),
    ...view.rounds.flatMap((round) => round.matches),
  ];

  /** Organizer enters a straight-sets result for side A or B. */
  const decide = (match: TournamentMatchView, winner: "A" | "B") =>
    admin$
      .post(`/api/v1/tournament-matches/${match.id}/result`)
      .send({
        sets:
          winner === "A"
            ? [
                { a: 6, b: 3 },
                { a: 6, b: 4 },
              ]
            : [
                { a: 2, b: 6 },
                { a: 3, b: 6 },
              ],
      })
      .expect(204);

  /** Decides every ready, undecided match (side A wins unless `winner` says otherwise). */
  const playOut = async (
    tournamentId: string,
    categoryId: string,
    winner: (match: TournamentMatchView) => "A" | "B" = () => "A",
  ) => {
    for (let guard = 0; guard < 64; guard += 1) {
      const view = await draw(tournamentId, categoryId);
      const next = allMatches(view).find(
        (match) => match.a && match.b && match.resultStatus !== "CONFIRMED",
      );
      if (!next) return view;
      await decide(next, winner(next));
    }
    throw new Error("draw did not finish");
  };

  it("runs a 12-player singles knockout from registration to champion", async () => {
    const { tournament, categoryId } = await createTournament({});
    const players: User[] = [];
    for (let index = 0; index < 12; index += 1) {
      players.push(
        await createMember(ctx.prisma, {
          name: `Jogador ${String(index + 1).padStart(2, "0")}`,
          elo: 1500 - index * 20,
        }),
      );
    }
    await setStatus(tournament.id, "REGISTRATION_OPEN");
    // Two players register themselves, the organizer enters the rest.
    for (const player of players.slice(0, 2)) {
      const agent = await ctx.loginMember(player.membershipId!);
      const entry = await agent
        .post(`/api/v1/tournaments/${tournament.id}/categories/${categoryId}/entries`)
        .send({ restrictions: { weekdayNotBefore: player === players[1] ? "18:00" : null } })
        .expect(201);
      expect(entry.body.status).toBe("CONFIRMED");
    }
    for (const player of players.slice(2)) await addEntry(tournament.id, categoryId, [player]);

    // The draw needs registration closed.
    await admin$
      .post(`/api/v1/tournaments/${tournament.id}/draws/${categoryId}/generate`)
      .expect(409);
    await setStatus(tournament.id, "REGISTRATION_CLOSED");
    const generated = (
      await admin$
        .post(`/api/v1/tournaments/${tournament.id}/draws/${categoryId}/generate`)
        .expect(200)
    ).body as DrawView;
    expect(generated.rounds.map((round) => round.name)).toEqual([
      "ROUND_OF_16",
      "QUARTERFINAL",
      "SEMIFINAL",
      "FINAL",
    ]);
    const first = generated.rounds[0]!.matches;
    expect(first).toHaveLength(8);
    // Byes for the 4 best rated, who are already through to the quarterfinals.
    const byes = first.filter((match) => match.outcome === "BYE");
    expect(byes.map((match) => match.winnerEntryId && (match.a ?? match.b)!.name).sort()).toEqual([
      "Jogador 01",
      "Jogador 02",
      "Jogador 03",
      "Jogador 04",
    ]);
    expect(first[0]!.a!.name).toBe("Jogador 01");
    expect(first[1]).toMatchObject({ a: { name: "Jogador 08" }, b: { name: "Jogador 09" } });
    expect(generated.rounds[1]!.matches[0]!.a!.name).toBe("Jogador 01");

    // "Sortear de novo" is a new lot: the byes stay with the 4 best rated, the rest moves.
    const pairsOf = (view: DrawView) =>
      view.rounds[0]!.matches.map((match) => `${match.a?.name ?? "-"} x ${match.b?.name ?? "-"}`);
    ctx.random.use(0, 0.4, 0.8, 0.2, 0.6);
    const redrawn = (
      await admin$
        .post(`/api/v1/tournaments/${tournament.id}/draws/${categoryId}/generate`)
        .expect(200)
    ).body as DrawView;
    expect(pairsOf(redrawn)).not.toEqual(pairsOf(generated));
    expect(redrawn.rounds[0]!.matches[0]!.a!.name).toBe("Jogador 01");
    expect(
      redrawn.rounds[0]!.matches.filter((match) => match.outcome === "BYE")
        .map((match) => (match.a ?? match.b)!.name)
        .sort(),
    ).toEqual(["Jogador 01", "Jogador 02", "Jogador 03", "Jogador 04"]);
    // Seeds are still the best rated, wherever the lot put them.
    const seedOf = (view: DrawView, name: string) =>
      view.rounds[0]!.matches.flatMap((match) => [match.a, match.b]).find((e) => e?.name === name)
        ?.seed;
    expect(["Jogador 01", "Jogador 02", "Jogador 03"].map((name) => seedOf(redrawn, name))).toEqual(
      [1, 2, 3],
    );
    // Back to the seed-order lot for the rest of the journey.
    ctx.random.reset();
    await admin$
      .post(`/api/v1/tournaments/${tournament.id}/draws/${categoryId}/generate`)
      .expect(200);

    // Players see nothing until it is published; then they are notified.
    const player$ = await ctx.loginMember(players[5]!.membershipId!);
    expect(
      (await player$.get(`/api/v1/tournaments/${tournament.id}/draws/${categoryId}`).expect(200))
        .body.rounds,
    ).toEqual([]);
    await admin$
      .post(`/api/v1/tournaments/${tournament.id}/draws/${categoryId}/publish`)
      .expect(200);
    expect(
      (await player$.get(`/api/v1/tournaments/${tournament.id}/draws/${categoryId}`).expect(200))
        .body.rounds,
    ).toHaveLength(4);
    const published = await ctx.prisma.notification.count({
      where: { type: "TOURNAMENT_DRAW_PUBLISHED" },
    });
    expect(published).toBe(12);
    expect((await admin$.get(`/api/v1/tournaments/${tournament.id}`).expect(200)).body.status).toBe(
      "DRAW_PUBLISHED",
    );

    // A booking and a lesson on Tuesday keep their slots; Jogador 02 (18:00 or later on weekdays) has a bye.
    const member$ = await ctx.loginMember(players[0]!.membershipId!);
    await member$
      .post("/api/v1/bookings")
      .send({
        courtId: club.courts.Q1.id,
        timeSlotId: club.slots["08:30"]!.id,
        date: TUESDAY,
        type: "SINGLES",
        playerIds: [players[1]!.id],
      })
      .expect(201);
    const { coach } = await createCoach(ctx.prisma, {
      name: "Alan",
      email: "alan@ficc.test",
      courtIds: [club.courts.Q2.id],
    });
    await createLesson(ctx.prisma, {
      coachId: coach.id,
      courtId: club.courts.Q2.id,
      timeSlotId: club.slots["08:30"]!.id,
      date: TUESDAY,
    });
    await admin$
      .patch(`/api/v1/tournaments/${tournament.id}`)
      .send({ courtIds: [club.courts.Q1.id, club.courts.Q2.id] })
      .expect(200);

    const scheduled = await admin$
      .post(`/api/v1/tournaments/${tournament.id}/auto-schedule`)
      .send({ dates: [TUESDAY, WEDNESDAY] })
      .expect(200);
    // 4 first-round matches, 4 quarters, 2 semis and the final: all fit in two days on 2 courts.
    expect(scheduled.body.scheduled).toBe(11);
    expect(scheduled.body.unscheduled).toEqual([]);
    const board = (
      await admin$
        .get(`/api/v1/tournaments/${tournament.id}/schedule-board?date=${TUESDAY}`)
        .expect(200)
    ).body as ScheduleBoard;
    const cell = (court: string, time: string) =>
      board.cells.find(
        (entry) =>
          entry.courtId === club.courts[court as "Q1"].id &&
          entry.timeSlotId === club.slots[time]!.id,
      )!;
    expect(cell("Q1", "08:30").state).toBe("booking");
    expect(cell("Q2", "08:30").state).toBe("lesson");
    expect(board.scheduled.length).toBeGreaterThan(0);
    // Every knockout match starts after the matches feeding it, plus rest time.
    const order = await admin$
      .get(`/api/v1/tournaments/${tournament.id}/order-of-play`)
      .expect(200);
    const all = order.body.flatMap(
      (day: { matches: TournamentMatchView[] }) => day.matches,
    ) as TournamentMatchView[];
    const startOf = (match: TournamentMatchView) =>
      `${match.schedule!.date}T${match.schedule!.startTime}`;
    const byRoundPosition = new Map(
      all.map((match) => [`${match.round}:${match.position}`, match]),
    );
    for (const match of all) {
      for (const feeder of [match.feederA, match.feederB]) {
        const before = feeder && byRoundPosition.get(`${feeder.round}:${feeder.position}`);
        if (before) expect(startOf(before) < startOf(match)).toBe(true);
      }
    }
    // A member cannot book over a tournament match.
    const taken = all.find((match) => match.schedule!.date === WEDNESDAY)!;
    await member$
      .post("/api/v1/bookings")
      .send({
        courtId: taken.schedule!.courtId,
        timeSlotId: taken.schedule!.timeSlotId,
        date: WEDNESDAY,
        type: "SINGLES",
        playerIds: [players[2]!.id],
      })
      .expect(409);
    // The club calendar shows it with a tournament chip.
    const day = await member$.get(`/api/v1/schedule?date=${WEDNESDAY}`).expect(200);
    const chip = day.body.cells.find(
      (entry: { courtId: string; timeSlotId: string }) =>
        entry.courtId === taken.schedule!.courtId &&
        entry.timeSlotId === taken.schedule!.timeSlotId,
    );
    expect(chip).toMatchObject({
      state: "tournament",
      tournament: { tournamentName: "Aberto de Outono" },
    });

    // Publishing a day notifies the players scheduled on it.
    await admin$
      .post(`/api/v1/tournaments/${tournament.id}/order-of-play/publish`)
      .send({ date: TUESDAY })
      .expect(204);
    expect(
      await ctx.prisma.notification.count({ where: { type: "TOURNAMENT_MATCH_SCHEDULED" } }),
    ).toBeGreaterThan(0);

    // A walkover, then everything else decided; winners move on to the final.
    const view = await draw(tournament.id, categoryId);
    const opener = view.rounds[0]!.matches.find((match) => match.outcome !== "BYE")!;
    await admin$
      .post(`/api/v1/tournament-matches/${opener.id}/outcome`)
      .send({ outcome: "WALKOVER", winnerEntryId: opener.b!.id })
      .expect(204);
    const after = await draw(tournament.id, categoryId);
    const quarter = after.rounds[1]!.matches[0]!;
    expect(quarter.b!.id).toBe(opener.b!.id);
    const finished = await playOut(tournament.id, categoryId);
    expect(finished.championEntryId).toBe(finished.rounds[3]!.matches[0]!.a!.id);
    const detail = await admin$.get(`/api/v1/tournaments/${tournament.id}`).expect(200);
    expect(detail.body.status).toBe("FINISHED");
    expect(await ctx.prisma.notification.count({ where: { type: "TOURNAMENT_CHAMPION" } })).toBe(1);
    // This category does not count for Elo.
    expect(await ratingOf(ctx.prisma, players[0]!.id)).toBe(1500);
    expect(await ctx.prisma.match.count()).toBe(0);
    // Hall of fame.
    const titles = await member$.get(`/api/v1/players/${players[0]!.id}/titles`).expect(200);
    expect(titles.body).toEqual([
      expect.objectContaining({ placement: "CHAMPION", categoryName: "Simples A" }),
    ]);
  });

  it("runs an 8-team doubles groups-then-knockout category that counts for Elo", async () => {
    const { tournament, categoryId } = await createTournament({
      name: "Duplas",
      entryType: "DOUBLES",
      drawFormat: "GROUPS_THEN_KNOCKOUT",
      groupSize: 4,
      advancePerGroup: 2,
      maxEntries: 8,
      countsForElo: true,
    });
    const members: User[] = [];
    for (let index = 0; index < 16; index += 1) {
      members.push(
        await createMember(ctx.prisma, { name: `Dupla ${index}`, elo: 1400 - index * 10 }),
      );
    }
    await setStatus(tournament.id, "REGISTRATION_OPEN");
    for (let team = 0; team < 8; team += 1)
      await addEntry(tournament.id, categoryId, [members[team]!, members[15 - team]!]);
    await setStatus(tournament.id, "REGISTRATION_CLOSED");
    const generated = (
      await admin$
        .post(`/api/v1/tournaments/${tournament.id}/draws/${categoryId}/generate`)
        .expect(200)
    ).body as DrawView;
    expect(generated.groups.map((group) => group.name)).toEqual(["A", "B"]);
    expect(
      generated.groups.every((group) => group.standings.length === 4 && group.matches.length === 6),
    ).toBe(true);
    expect(generated.rounds).toEqual([]);
    await admin$
      .post(`/api/v1/tournaments/${tournament.id}/draws/${categoryId}/publish`)
      .expect(200);

    // Groups: the better seed (side A of the first fixture… or whoever) wins by the organizer's entry.
    const groupsDone = await playOut(tournament.id, categoryId, (match) =>
      (match.a!.seed ?? 99) <= (match.b!.seed ?? 99) ? "A" : "B",
    );
    const [groupA, groupB] = groupsDone.groups;
    expect(groupA!.finished && groupB!.finished).toBe(true);
    // Knockout built from the tables: A1 v B2 and B1 v A2, then the final.
    expect(groupsDone.rounds.map((round) => round.name)).toEqual(["SEMIFINAL", "FINAL"]);
    const semis = groupsDone.rounds[0]!.matches;
    expect([semis[0]!.a!.id, semis[0]!.b!.id]).toEqual([
      groupA!.standings[0]!.entry.id,
      groupB!.standings[1]!.entry.id,
    ]);
    expect([semis[1]!.a!.id, semis[1]!.b!.id]).toEqual([
      groupB!.standings[0]!.entry.id,
      groupA!.standings[1]!.entry.id,
    ]);
    expect(groupsDone.championEntryId).toBe(groupsDone.rounds[1]!.matches[0]!.winnerEntryId);
    expect(groupsDone.championEntryId).not.toBeNull();

    // Elo applied for each of the 15 played matches (4 players each).
    expect(
      await ctx.prisma.match.count({
        where: { type: "TOURNAMENT", status: "CONFIRMED", tournamentId: tournament.id },
      }),
    ).toBe(15);
    expect(await ctx.prisma.eloHistory.count()).toBe(60);
    // Third and fourth of each group were told they are out.
    expect(
      await ctx.prisma.notification.count({ where: { type: "TOURNAMENT_ELIMINATED" } }),
    ).toBeGreaterThanOrEqual(8);
  });

  it("handles partner invites, approval, the waitlist and withdrawals", async () => {
    const { tournament, categoryId } = await createTournament(
      { name: "Duplas", entryType: "DOUBLES", maxEntries: 2 },
      { requiresApproval: false },
    );
    // One place is already taken by a team the organizer entered.
    const fillers = [await createMember(ctx.prisma), await createMember(ctx.prisma)];
    const [ana, bia, caio, duda] = [
      await createMember(ctx.prisma, { name: "Ana Lima" }),
      await createMember(ctx.prisma, { name: "Bia Reis" }),
      await createMember(ctx.prisma, { name: "Caio Dias" }),
      await createMember(ctx.prisma, { name: "Duda Melo" }),
    ];
    const ana$ = await ctx.loginMember(ana.membershipId!);
    // Closed until the organizer opens registration.
    await ana$
      .post(`/api/v1/tournaments/${tournament.id}/categories/${categoryId}/entries`)
      .send({ partnerId: bia.id })
      .expect(409);
    await setStatus(tournament.id, "REGISTRATION_OPEN");
    await addEntry(tournament.id, categoryId, fillers);
    await ana$
      .post(`/api/v1/tournaments/${tournament.id}/categories/${categoryId}/entries`)
      .send({})
      .expect(422);
    const invited = await ana$
      .post(`/api/v1/tournaments/${tournament.id}/categories/${categoryId}/entries`)
      .send({ partnerId: bia.id, note: "Só à noite" })
      .expect(201);
    expect(invited.body.status).toBe("PENDING_PARTNER");
    expect(
      await ctx.prisma.notification.count({
        where: { userId: bia.id, type: "TOURNAMENT_PARTNER_INVITE" },
      }),
    ).toBe(1);
    const bia$ = await ctx.loginMember(bia.membershipId!);
    // Bia can't enter twice while invited.
    await bia$
      .post(`/api/v1/tournaments/${tournament.id}/categories/${categoryId}/entries`)
      .send({ partnerId: caio.id })
      .expect(409);
    await ana$.post(`/api/v1/tournament-entries/${invited.body.id}/accept`).expect(403);
    const accepted = await bia$
      .post(`/api/v1/tournament-entries/${invited.body.id}/accept`)
      .expect(200);
    expect(accepted.body.status).toBe("CONFIRMED");

    // Full (max 2): the next team waits.
    const caio$ = await ctx.loginMember(caio.membershipId!);
    const second = await caio$
      .post(`/api/v1/tournaments/${tournament.id}/categories/${categoryId}/entries`)
      .send({ partnerId: duda.id })
      .expect(201);
    const duda$ = await ctx.loginMember(duda.membershipId!);
    expect(
      (await duda$.post(`/api/v1/tournament-entries/${second.body.id}/accept`).expect(200)).body
        .status,
    ).toBe("WAITLISTED");

    // Ana withdraws: Caio and Duda take the place and are told.
    await ana$.post(`/api/v1/tournament-entries/${invited.body.id}/withdraw`).expect(204);
    const entries = await admin$.get(`/api/v1/tournaments/${tournament.id}/entries`).expect(200);
    expect(entries.body.find((entry: { id: string }) => entry.id === second.body.id).status).toBe(
      "CONFIRMED",
    );
    const placed = await ctx.prisma.notification.findMany({
      where: { userId: caio.id, type: "TOURNAMENT_ENTRY_CONFIRMED" },
      orderBy: { createdAt: "asc" },
    });
    expect(placed.map((row) => (row.payload as { waitlisted: boolean }).waitlisted)).toEqual([
      true,
      false,
    ]);

    // Organizer controls: payment, CSV export.
    await admin$
      .patch(`/api/v1/tournament-entries/${second.body.id}/manage`)
      .send({ paymentStatus: "PAID" })
      .expect(200);
    const csv = await admin$.get(`/api/v1/tournaments/${tournament.id}/entries.csv`).expect(200);
    expect(csv.text.split("\n")[0]).toContain("categoria;inscricao;jogador1");
    expect(csv.text).toContain("Caio Dias");
    expect(csv.text).toContain("PAID");

    // Members can't organize unless given the permission.
    await caio$
      .post(`/api/v1/tournaments/${tournament.id}/status`)
      .send({ status: "REGISTRATION_CLOSED" })
      .expect(403);
    await admin$
      .put(`/api/v1/tournaments/${tournament.id}/organizers`)
      .send({ userIds: [caio.id] })
      .expect(200);
    await caio$
      .post(`/api/v1/tournaments/${tournament.id}/status`)
      .send({ status: "REGISTRATION_CLOSED" })
      .expect(200);
  });

  it("confirms player reports by the opponent, auto-confirms and alerts about overdue results", async () => {
    const { tournament, categoryId } = await createTournament({ maxEntries: 4 });
    const players = [
      await createMember(ctx.prisma, { name: "Ana Lima", elo: 1300 }),
      await createMember(ctx.prisma, { name: "Bia Reis", elo: 1250 }),
      await createMember(ctx.prisma, { name: "Caio Dias", elo: 1200 }),
      await createMember(ctx.prisma, { name: "Duda Melo", elo: 1150 }),
    ];
    await setStatus(tournament.id, "REGISTRATION_OPEN");
    for (const player of players) await addEntry(tournament.id, categoryId, [player]);
    await setStatus(tournament.id, "REGISTRATION_CLOSED");
    await admin$
      .post(`/api/v1/tournaments/${tournament.id}/draws/${categoryId}/generate`)
      .expect(200);
    await admin$
      .post(`/api/v1/tournaments/${tournament.id}/draws/${categoryId}/publish`)
      .expect(200);
    const view = await draw(tournament.id, categoryId);
    const [semi1, semi2] = view.rounds[0]!.matches;
    expect(semi1).toMatchObject({ a: { name: "Ana Lima" }, b: { name: "Duda Melo" } });

    // Schedule semi 1 today at 10:00 on Q3.
    await admin$
      .post(`/api/v1/tournament-matches/${semi1!.id}/schedule`)
      .send({ date: "2030-03-04", courtId: club.courts.Q3.id, timeSlotId: club.slots["10:00"]!.id })
      .expect(204);

    const ana$ = await ctx.loginMember(players[0]!.membershipId!);
    const duda$ = await ctx.loginMember(players[3]!.membershipId!);
    const bia$ = await ctx.loginMember(players[1]!.membershipId!);
    // Invalid score for the format, then a valid report.
    await ana$
      .post(`/api/v1/tournament-matches/${semi1!.id}/result`)
      .send({
        sets: [
          { a: 6, b: 5 },
          { a: 6, b: 0 },
        ],
      })
      .expect(400);
    await bia$
      .post(`/api/v1/tournament-matches/${semi1!.id}/result`)
      .send({
        sets: [
          { a: 6, b: 1 },
          { a: 6, b: 1 },
        ],
      })
      .expect(403);
    await ana$
      .post(`/api/v1/tournament-matches/${semi1!.id}/result`)
      .send({
        sets: [
          { a: 6, b: 4 },
          { a: 7, b: 5 },
        ],
      })
      .expect(204);
    expect(
      await ctx.prisma.notification.count({
        where: { userId: players[3]!.id, type: "TOURNAMENT_RESULT_REPORTED" },
      }),
    ).toBe(1);
    await ana$.post(`/api/v1/tournament-matches/${semi1!.id}/confirm`).expect(403);
    await duda$.post(`/api/v1/tournament-matches/${semi1!.id}/confirm`).expect(204);
    const final = (await draw(tournament.id, categoryId)).rounds[1]!.matches[0]!;
    expect(final.a!.name).toBe("Ana Lima");

    // Semi 2: reported, unanswered → confirmed by the job after the auto-approve window.
    const caio$ = await ctx.loginMember(players[2]!.membershipId!);
    // Caio is side B; scores are always sent from side A's point of view.
    await caio$
      .post(`/api/v1/tournament-matches/${semi2!.id}/result`)
      .send({
        sets: [
          { a: 2, b: 6 },
          { a: 2, b: 6 },
        ],
      })
      .expect(204);
    const results = ctx.app.get(ResultsService);
    expect(await ctx.inClub(() => results.autoConfirm())).toBe(0);
    ctx.clock.advance(49 * 3_600_000);
    expect(await ctx.inClub(() => results.autoConfirm())).toBe(1);
    expect((await draw(tournament.id, categoryId)).rounds[1]!.matches[0]!.b!.name).toBe(
      "Caio Dias",
    );

    // The final is scheduled and nobody reports it: 2 h after the slot ends the organizers hear.
    ctx.clock.reset();
    await admin$
      .post(`/api/v1/tournament-matches/${final.id}/schedule`)
      .send({ date: "2030-03-04", courtId: club.courts.Q4.id, timeSlotId: club.slots["14:45"]!.id })
      .expect(204);
    ctx.clock.set("2030-03-04T19:30:00Z"); // 16:30 local: slot ended at 16:00
    expect(await ctx.inClub(() => results.alertOverdue())).toBe(0);
    ctx.clock.set("2030-03-04T21:01:00Z"); // 18:01 local
    expect(await ctx.inClub(() => results.alertOverdue())).toBe(1);
    expect(await ctx.inClub(() => results.alertOverdue())).toBe(0);
    expect(
      await ctx.prisma.notification.count({ where: { type: "TOURNAMENT_RESULT_OVERDUE" } }),
    ).toBe(1);
    const pending = await admin$
      .get(`/api/v1/tournaments/${tournament.id}/pending-results`)
      .expect(200);
    expect(pending.body.overdue.map((match: { id: string }) => match.id)).toEqual([final.id]);
  });

  it("ranks a circuit over two stages", async () => {
    const circuit = await admin$
      .post("/api/v1/circuits")
      .send({
        name: "Circuito FICC",
        season: "2030",
        pointsTable: {
          CHAMPION: 100,
          FINALIST: 70,
          SEMIFINAL: 45,
          QUARTERFINAL: 25,
          ROUND_OF_16: 15,
          ROUND_OF_32: 10,
          PARTICIPATION: 5,
        },
        categories: ["Simples A"],
      })
      .expect(201);
    const circuitCategoryId = circuit.body.categories[0].id;
    const players = [
      await createMember(ctx.prisma, { name: "Ana Lima", elo: 1300 }),
      await createMember(ctx.prisma, { name: "Bia Reis", elo: 1250 }),
      await createMember(ctx.prisma, { name: "Caio Dias", elo: 1200 }),
      await createMember(ctx.prisma, { name: "Duda Melo", elo: 1150 }),
    ];
    const stage = async (
      name: string,
      winner: (match: TournamentMatchView) => "A" | "B",
      seeding = "ELO",
    ) => {
      const { tournament, categoryId } = await createTournament(
        { maxEntries: 4, circuitCategoryId, seeding },
        { name, circuitId: circuit.body.id },
      );
      await setStatus(tournament.id, "REGISTRATION_OPEN");
      for (const player of players) await addEntry(tournament.id, categoryId, [player]);
      await setStatus(tournament.id, "REGISTRATION_CLOSED");
      await admin$
        .post(`/api/v1/tournaments/${tournament.id}/draws/${categoryId}/generate`)
        .expect(200);
      await admin$
        .post(`/api/v1/tournaments/${tournament.id}/draws/${categoryId}/publish`)
        .expect(200);
      return playOut(tournament.id, categoryId, winner);
    };
    // Stage 1: favourites win (Ana champion, Bia finalist, Caio and Duda semis).
    await stage("Etapa 1", () => "A");
    // Stage 2: underdogs win every match (Duda beats Ana, Caio beats Bia, Caio wins the final).
    const second = await stage("Etapa 2", () => "B");
    expect(second.rounds[1]!.matches[0]!.winnerEntryId).not.toBeNull();

    const ranking = await admin$.get(`/api/v1/circuits/${circuit.body.id}`).expect(200);
    expect(ranking.body.stages).toHaveLength(2);
    const standings = ranking.body.rankings[0].standings.map(
      (row: { name: string; total: number; position: number }) => [
        row.name,
        row.total,
        row.position,
      ],
    );
    expect(standings).toEqual([
      ["Ana Lima", 145, 1],
      ["Caio Dias", 145, 1],
      ["Bia Reis", 115, 3],
      ["Duda Melo", 115, 3],
    ]);
    // Seeding by circuit points puts the leaders on top in a third stage.
    const third = await createTournament(
      { maxEntries: 4, circuitCategoryId, seeding: "CIRCUIT" },
      { name: "Etapa 3", circuitId: circuit.body.id },
    );
    await setStatus(third.tournament.id, "REGISTRATION_OPEN");
    for (const player of [...players].reverse())
      await addEntry(third.tournament.id, third.categoryId, [player]);
    const entries = await admin$
      .get(`/api/v1/tournaments/${third.tournament.id}/entries`)
      .expect(200);
    expect(
      entries.body
        .map((entry: { name: string; rating: number }) => [entry.name, entry.rating])
        .sort(),
    ).toEqual([
      ["Ana Lima", 145],
      ["Bia Reis", 115],
      ["Caio Dias", 145],
      ["Duda Melo", 115],
    ]);
  });

  it("serves a public read-only page by link, never drafts", async () => {
    const { tournament, categoryId } = await createTournament({ maxEntries: 4 });
    await ctx.http().get(`/api/v1/public/tournaments/${tournament.publicId}`).expect(404);
    const players = [
      await createMember(ctx.prisma),
      await createMember(ctx.prisma),
      await createMember(ctx.prisma),
    ];
    await setStatus(tournament.id, "REGISTRATION_OPEN");
    for (const player of players) await addEntry(tournament.id, categoryId, [player]);
    await setStatus(tournament.id, "REGISTRATION_CLOSED");
    await admin$
      .post(`/api/v1/tournaments/${tournament.id}/draws/${categoryId}/generate`)
      .expect(200);
    const before = await ctx
      .http()
      .get(`/api/v1/public/tournaments/${tournament.publicId}`)
      .expect(200);
    expect(before.body.draws).toEqual([]);
    await admin$
      .post(`/api/v1/tournaments/${tournament.id}/draws/${categoryId}/publish`)
      .expect(200);
    const view = await draw(tournament.id, categoryId);
    const match = view.rounds[0]!.matches.find((entry) => entry.outcome !== "BYE")!;
    await admin$
      .post(`/api/v1/tournament-matches/${match.id}/schedule`)
      .send({ date: TUESDAY, courtId: club.courts.Q1.id, timeSlotId: club.slots["10:00"]!.id })
      .expect(204);
    // Unpublished days stay private.
    expect(
      (await ctx.http().get(`/api/v1/public/tournaments/${tournament.publicId}`).expect(200)).body
        .schedule,
    ).toEqual([]);
    await admin$
      .post(`/api/v1/tournaments/${tournament.id}/order-of-play/publish`)
      .send({ date: TUESDAY })
      .expect(204);
    const page = await ctx
      .http()
      .get(`/api/v1/public/tournaments/${tournament.publicId}`)
      .expect(200);
    expect(page.body).toMatchObject({
      clubName: "FICC",
      tournament: { name: "Aberto de Outono", categories: [{ drawPublished: true }] },
      draws: [{ rounds: [{ name: "SEMIFINAL" }, { name: "FINAL" }] }],
      schedule: [{ date: TUESDAY, published: true }],
    });
    expect(page.body.tournament.canManage).toBeUndefined();
    expect(page.body.draws[0].rounds[0].matches[0].a.players[0]).not.toHaveProperty("membershipId");
  });

  it("duplicates a tournament as a template and protects the draw once published", async () => {
    const { tournament, categoryId } = await createTournament({ maxEntries: 4 });
    const copy = await admin$.post(`/api/v1/tournaments/${tournament.id}/duplicate`).expect(201);
    expect(copy.body).toMatchObject({
      name: "Aberto de Outono (cópia)",
      status: "DRAFT",
      categories: [{ name: "Simples A" }],
    });
    const players = [
      await createMember(ctx.prisma),
      await createMember(ctx.prisma),
      await createMember(ctx.prisma),
      await createMember(ctx.prisma),
    ];
    await setStatus(tournament.id, "REGISTRATION_OPEN");
    for (const player of players) await addEntry(tournament.id, categoryId, [player]);
    await setStatus(tournament.id, "REGISTRATION_CLOSED");
    const generated = (
      await admin$
        .post(`/api/v1/tournaments/${tournament.id}/draws/${categoryId}/generate`)
        .expect(200)
    ).body as DrawView;
    const [m1, m2] = generated.rounds[0]!.matches;
    // Swap two players between first-round matches before publishing.
    const swapped = (
      await admin$
        .post(`/api/v1/tournaments/${tournament.id}/draws/${categoryId}/swap`)
        .send({ entryA: m1!.b!.id, entryB: m2!.b!.id })
        .expect(200)
    ).body as DrawView;
    expect(swapped.rounds[0]!.matches[0]!.b!.id).toBe(m2!.b!.id);
    await admin$
      .post(`/api/v1/tournaments/${tournament.id}/draws/${categoryId}/publish`)
      .expect(200);
    await admin$
      .post(`/api/v1/tournaments/${tournament.id}/draws/${categoryId}/generate`)
      .expect(409);
    await admin$
      .patch(`/api/v1/tournaments/${tournament.id}/categories/${categoryId}`)
      .send({
        name: "Simples A",
        entryType: "DOUBLES",
        drawFormat: "SINGLE_ELIMINATION",
        maxEntries: 4,
      })
      .expect(409);
    // Rain on Q1 on Tuesday: the match there is flagged, then moved in bulk to Wednesday.
    const firstMatch = (await draw(tournament.id, categoryId)).rounds[0]!.matches[0]!;
    await admin$
      .post(`/api/v1/tournament-matches/${firstMatch.id}/schedule`)
      .send({ date: TUESDAY, courtId: club.courts.Q1.id, timeSlotId: club.slots["10:00"]!.id })
      .expect(204);
    await admin$
      .post(`/api/v1/tournaments/${tournament.id}/order-of-play/publish`)
      .send({ date: TUESDAY })
      .expect(204);
    await admin$
      .post("/api/v1/admin/freezes")
      .send({
        target: { scope: "COURT", courtId: club.courts.Q1.id },
        reason: "RAIN",
        startsAt: "2030-03-05T11:00:00Z",
        endsAt: "2030-03-05T23:00:00Z",
      })
      .expect(201);
    const pending = await admin$
      .get(`/api/v1/tournaments/${tournament.id}/pending-results`)
      .expect(200);
    expect(pending.body.frozen.map((match: { id: string }) => match.id)).toEqual([firstMatch.id]);
    const moved = await admin$
      .post(`/api/v1/tournaments/${tournament.id}/reschedule-frozen`)
      .send({ dates: [WEDNESDAY] })
      .expect(200);
    expect(moved.body).toMatchObject({ moved: 1 });
    const after = (await draw(tournament.id, categoryId)).rounds[0]!.matches[0]!;
    expect(after.schedule!.date).toBe(WEDNESDAY);
    expect(
      await ctx.prisma.notification.count({ where: { type: "TOURNAMENT_MATCH_CHANGED" } }),
    ).toBe(2);

    // Announcements reach every entrant.
    await admin$
      .post(`/api/v1/tournaments/${tournament.id}/announcements`)
      .send({ body: "Jogos de sábado adiados." })
      .expect(201);
    expect(
      await ctx.prisma.notification.count({ where: { type: "TOURNAMENT_ANNOUNCEMENT" } }),
    ).toBe(4);
  });
});
