import { Role, type User } from "@ficc/db";

import { MatchesService } from "../src/matches/matches.service";
import { createTestApp, type TestContext } from "./support/app";
import {
  type Club,
  createMember,
  createStaff,
  ratingOf,
  resetDatabase,
  seedClub,
  setRating,
} from "./support/fixtures";

// Fake clock: Monday 2030-03-04 09:00 club time.
const SUNDAY = "2030-03-03";

describe("Matches, Elo and ranking", () => {
  let ctx: TestContext;
  let club: Club;
  let ana: User;
  let bruno: User;
  let carla: User;
  let diego: User;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  beforeEach(async () => {
    ctx.clock.reset();
    await resetDatabase(ctx);
    club = await seedClub(ctx);
    ana = await createMember(ctx.prisma, { name: "Ana Lima", categories: ["CLASS_A", "WOMENS"] });
    bruno = await createMember(ctx.prisma, { name: "Bruno Reis", categories: ["CLASS_A"] });
    carla = await createMember(ctx.prisma, {
      name: "Carla Dias",
      categories: ["CLASS_B", "WOMENS"],
      elo: 1400,
    });
    diego = await createMember(ctx.prisma, { name: "Diego Melo", categories: ["CLASS_B"] });
  });

  const singles = (
    a: User,
    b: User,
    score = [
      { a: 6, b: 4 },
      { a: 6, b: 3 },
    ],
    extra: Record<string, unknown> = {},
  ) => ({
    format: "SINGLES",
    sideA: [a.id],
    sideB: [b.id],
    score,
    playedOn: SUNDAY,
    courtId: club.courts.Q5.id,
    ...extra,
  });

  const eloOf = async (user: User) => ratingOf(ctx.prisma, user.id);

  it("approve → applies the correct Elo change, writes history and notifies both players", async () => {
    const ana$ = await ctx.loginMember(ana.membershipId!);
    const bruno$ = await ctx.loginMember(bruno.membershipId!);
    const reported = await ana$.post("/api/v1/matches").send(singles(ana, bruno)).expect(201);
    expect(reported.body).toMatchObject({
      status: "PENDING",
      score: "6-4, 6-3",
      winnerSide: "A",
      surface: "SAIBRO",
      approvalDeadline: "2030-03-06T12:00:00.000Z",
      viewer: { side: "A", canRespond: false },
    });

    const pending = await bruno$.get("/api/v1/matches/mine").expect(200);
    expect(pending.body.awaitingMyResponse.map((match: { id: string }) => match.id)).toEqual([
      reported.body.id,
    ]);

    // The reporter's own side cannot approve.
    await ana$.post(`/api/v1/matches/${reported.body.id}/approve`).expect(403);

    const approved = await bruno$.post(`/api/v1/matches/${reported.body.id}/approve`).expect(200);
    expect(approved.body).toMatchObject({ status: "CONFIRMED", confirmation: "OPPONENT_APPROVED" });
    // Equal ratings, K = 32 → ±16.
    expect(await eloOf(ana)).toBe(1216);
    expect(await eloOf(bruno)).toBe(1184);
    expect(approved.body.players).toEqual([
      expect.objectContaining({ side: "A", eloBefore: 1200, eloAfter: 1216, delta: 16 }),
      expect.objectContaining({ side: "B", eloBefore: 1200, eloAfter: 1184, delta: -16 }),
    ]);
    expect(await ctx.prisma.eloHistory.count({ where: { matchId: reported.body.id } })).toBe(2);

    const confirmedNote = await ctx.prisma.notification.findFirstOrThrow({
      where: { userId: ana.id, type: "MATCH_CONFIRMED" },
    });
    expect(confirmedNote.payload).toMatchObject({
      won: true,
      eloBefore: 1200,
      eloAfter: 1216,
      delta: 16,
      rankAfter: 2,
    });
    await bruno$.post(`/api/v1/matches/${reported.body.id}/approve`).expect(409);
  });

  it("rewards an upset more (beating a 1400 player gives +24)", async () => {
    const ana$ = await ctx.loginMember(ana.membershipId!);
    const carla$ = await ctx.loginMember(carla.membershipId!);
    const reported = await ana$.post("/api/v1/matches").send(singles(ana, carla)).expect(201);
    await carla$.post(`/api/v1/matches/${reported.body.id}/approve`).expect(200);
    expect(await eloOf(ana)).toBe(1224);
    expect(await eloOf(carla)).toBe(1376);
  });

  it("rates doubles by team average and gives each player the team delta", async () => {
    await setRating(ctx.prisma, ana.id, 1300);
    await setRating(ctx.prisma, bruno.id, 1100);
    await setRating(ctx.prisma, carla.id, 1200);
    const ana$ = await ctx.loginMember(ana.membershipId!);
    const diego$ = await ctx.loginMember(diego.membershipId!);
    const reported = await ana$
      .post("/api/v1/matches")
      .send({
        format: "DOUBLES",
        sideA: [ana.id, bruno.id],
        sideB: [carla.id, diego.id],
        score: [
          { a: 4, b: 6 },
          { a: 6, b: 3 },
          { a: 8, b: 10, tiebreak: true },
        ],
        playedOn: SUNDAY,
        surface: "HARTRU",
      })
      .expect(201);
    expect(reported.body.score).toBe("4-6, 6-3, [8-10]");
    await diego$.post(`/api/v1/matches/${reported.body.id}/approve`).expect(200);
    expect([await eloOf(ana), await eloOf(bruno), await eloOf(carla), await eloOf(diego)]).toEqual([
      1284, 1084, 1216, 1216,
    ]);
  });

  it("dispute → no Elo change until an admin resolves it", async () => {
    await createStaff(ctx.prisma, Role.ADMIN, "admin@ficc.test", "Diretoria");
    const ana$ = await ctx.loginMember(ana.membershipId!);
    const bruno$ = await ctx.loginMember(bruno.membershipId!);
    const reported = await ana$.post("/api/v1/matches").send(singles(ana, bruno)).expect(201);

    const disputed = await bruno$
      .post(`/api/v1/matches/${reported.body.id}/dispute`)
      .send({ comment: "Foi 6-4, 4-6, [10-7] pra mim" })
      .expect(200);
    expect(disputed.body).toMatchObject({
      status: "DISPUTED",
      disputeComment: "Foi 6-4, 4-6, [10-7] pra mim",
    });
    expect([await eloOf(ana), await eloOf(bruno)]).toEqual([1200, 1200]);
    expect(await ctx.prisma.eloHistory.count()).toBe(0);
    expect(await ctx.prisma.notification.count({ where: { type: "MATCH_DISPUTED" } })).toBe(2); // reporter + admin

    // Auto-approve never touches disputed matches.
    ctx.clock.advance(3 * 86_400_000);
    expect(await ctx.inClub(() => ctx.app.get(MatchesService).autoApprove())).toBe(0);

    const admin = await ctx.loginStaff("admin@ficc.test");
    const queue = await admin.get("/api/v1/admin/disputes").expect(200);
    expect(queue.body.map((match: { id: string }) => match.id)).toEqual([reported.body.id]);

    const resolved = await admin
      .post(`/api/v1/admin/disputes/${reported.body.id}/resolve`)
      .send({
        action: "EDIT",
        score: [
          { a: 4, b: 6 },
          { a: 6, b: 4 },
          { a: 7, b: 10, tiebreak: true },
        ],
        note: "Corrigido",
      })
      .expect(200);
    expect(resolved.body).toMatchObject({
      status: "CONFIRMED",
      confirmation: "ADMIN_RESOLVED",
      winnerSide: "B",
      score: "4-6, 6-4, [7-10]",
      resolvedBy: { name: "Diretoria" },
      resolutionNote: "Corrigido",
    });
    expect([await eloOf(ana), await eloOf(bruno)]).toEqual([1184, 1216]);
  });

  it("voids a disputed match without changing ratings", async () => {
    await createStaff(ctx.prisma, Role.ADMIN, "admin@ficc.test");
    const ana$ = await ctx.loginMember(ana.membershipId!);
    const bruno$ = await ctx.loginMember(bruno.membershipId!);
    const reported = await ana$.post("/api/v1/matches").send(singles(ana, bruno)).expect(201);
    await bruno$.post(`/api/v1/matches/${reported.body.id}/dispute`).send({}).expect(200);
    const admin = await ctx.loginStaff("admin@ficc.test");
    const voided = await admin
      .post(`/api/v1/admin/disputes/${reported.body.id}/resolve`)
      .send({ action: "VOID" })
      .expect(200);
    expect(voided.body.status).toBe("VOIDED");
    expect([await eloOf(ana), await eloOf(bruno)]).toEqual([1200, 1200]);
    await admin
      .post(`/api/v1/admin/disputes/${reported.body.id}/resolve`)
      .send({ action: "ACCEPT" })
      .expect(409);
  });

  it("auto-approves unanswered reports after 48 hours", async () => {
    const ana$ = await ctx.loginMember(ana.membershipId!);
    const reported = await ana$.post("/api/v1/matches").send(singles(ana, bruno)).expect(201);
    const matches = ctx.app.get(MatchesService);
    ctx.clock.advance(48 * 60 * 60 * 1000 - 1);
    expect(await ctx.inClub(() => matches.autoApprove())).toBe(0);
    ctx.clock.advance(1);
    expect(await ctx.inClub(() => matches.autoApprove())).toBe(1);
    const match = await ctx.prisma.match.findUniqueOrThrow({ where: { id: reported.body.id } });
    expect(match).toMatchObject({ status: "CONFIRMED", confirmation: "AUTO_APPROVED" });
    expect(await eloOf(ana)).toBe(1216);
  });

  it("validates reports: score rules, players, dates and booking links", async () => {
    const ana$ = await ctx.loginMember(ana.membershipId!);
    const invalidSet = await ana$
      .post("/api/v1/matches")
      .send(
        singles(ana, bruno, [
          { a: 6, b: 5 },
          { a: 6, b: 3 },
        ]),
      )
      .expect(400);
    expect(invalidSet.body.message).toContain("Set inválido: 6-5");
    const noWinner = await ana$
      .post("/api/v1/matches")
      .send(
        singles(ana, bruno, [
          { a: 6, b: 4 },
          { a: 3, b: 6 },
        ]),
      )
      .expect(400);
    expect(noWinner.body.message).toContain("falta o set decisivo");
    await ana$.post("/api/v1/matches").send(singles(bruno, carla)).expect(403);
    await ana$
      .post("/api/v1/matches")
      .send(singles(ana, bruno, undefined, { playedOn: "2030-03-05" }))
      .expect(422);
    await ana$
      .post("/api/v1/matches")
      .send(singles(ana, bruno, undefined, { playedOn: "2030-01-01" }))
      .expect(422);

    // A confirmed booking links its court and can only be reported once.
    const booking = await ana$
      .post("/api/v1/bookings")
      .send({
        courtId: club.courts.Q2.id,
        timeSlotId: club.slots["10:00"]!.id,
        date: "2030-03-04",
        type: "SINGLES",
        playerIds: [bruno.id],
      })
      .expect(201);
    const bruno$ = await ctx.loginMember(bruno.membershipId!);
    await bruno$.post(`/api/v1/bookings/${booking.body.id}/confirm`).expect(200);
    ctx.clock.set("2030-03-04T15:00:00Z");
    // Ended, unreported bookings are offered to prefill a report…
    const before = await ana$.get("/api/v1/bookings/mine").expect(200);
    expect(before.body.recent.map((entry: { id: string }) => entry.id)).toEqual([booking.body.id]);
    const linked = await ana$
      .post("/api/v1/matches")
      .send({
        ...singles(ana, bruno, undefined, { playedOn: "2030-03-04", courtId: undefined }),
        bookingId: booking.body.id,
      })
      .expect(201);
    expect(linked.body).toMatchObject({
      bookingId: booking.body.id,
      court: { name: "Q2" },
      surface: "HARTRU",
    });
    // …and disappear once reported.
    const after = await bruno$.get("/api/v1/bookings/mine").expect(200);
    expect(after.body.recent).toEqual([]);
    await ana$
      .post("/api/v1/matches")
      .send({
        ...singles(ana, bruno, undefined, { playedOn: "2030-03-04" }),
        bookingId: booking.body.id,
      })
      .expect(409);
    await ana$
      .post("/api/v1/matches")
      .send({
        ...singles(ana, carla, undefined, { playedOn: "2030-03-04" }),
        bookingId: booking.body.id,
      })
      .expect(422);
  });

  it("serves the leaderboard by category with W/L, win rate and 30-day trend", async () => {
    const report = async (winner: User, loser: User) => {
      const winner$ = await ctx.loginMember(winner.membershipId!);
      const loser$ = await ctx.loginMember(loser.membershipId!);
      const reported = await winner$
        .post("/api/v1/matches")
        .send(singles(winner, loser))
        .expect(201);
      await loser$.post(`/api/v1/matches/${reported.body.id}/approve`).expect(200);
    };
    await report(ana, bruno);
    await report(ana, carla);

    const member = await ctx.loginMember(diego.membershipId!);
    const all = await member.get("/api/v1/leaderboard").expect(200);
    expect(
      all.body.entries.map((entry: { player: { name: string }; rank: number; elo: number }) => [
        entry.rank,
        entry.player.name,
        entry.elo,
      ]),
    ).toEqual([
      // Ana 1200 beats Bruno 1200 (+16), then beats Carla 1400 from 1216 (E = 0.2575 → +24).
      [1, "Carla Dias", 1376],
      [2, "Ana Lima", 1240],
      [3, "Diego Melo", 1200],
      [4, "Bruno Reis", 1184],
    ]);
    const anaRow = all.body.entries.find(
      (entry: { player: { name: string } }) => entry.player.name === "Ana Lima",
    );
    expect(anaRow).toMatchObject({ wins: 2, losses: 0, matches: 2, winRate: 100, trend: 40 });

    const womens = await member.get("/api/v1/leaderboard?category=WOMENS").expect(200);
    expect(
      womens.body.entries.map((entry: { player: { name: string } }) => entry.player.name),
    ).toEqual(["Carla Dias", "Ana Lima"]);
    await member.get("/api/v1/leaderboard?category=JUNIORS").expect(400);

    // Trend only counts the last 30 days.
    ctx.clock.advance(31 * 86_400_000);
    const later = await member.get("/api/v1/leaderboard").expect(200);
    expect(
      later.body.entries.find(
        (entry: { player: { name: string } }) => entry.player.name === "Ana Lima",
      ).trend,
    ).toBe(0);
  });

  it("returns Elo history and a head-to-head comparison", async () => {
    const play = async (
      reporter: User,
      a: User,
      b: User,
      score: { a: number; b: number; tiebreak?: boolean }[],
      courtId: string,
    ) => {
      const reporter$ = await ctx.loginMember(reporter.membershipId!);
      const other = reporter.id === a.id ? b : a;
      const other$ = await ctx.loginMember(other.membershipId!);
      const reported = await reporter$
        .post("/api/v1/matches")
        .send(singles(a, b, score, { courtId }))
        .expect(201);
      await other$.post(`/api/v1/matches/${reported.body.id}/approve`).expect(200);
      ctx.clock.advance(60_000);
    };
    await play(
      ana,
      ana,
      bruno,
      [
        { a: 6, b: 4 },
        { a: 6, b: 4 },
      ],
      club.courts.Q5.id,
    ); // Ana wins on Saibro
    await play(
      bruno,
      bruno,
      ana,
      [
        { a: 6, b: 2 },
        { a: 6, b: 2 },
      ],
      club.courts.Q2.id,
    ); // Bruno wins on Har-Tru
    await play(
      ana,
      ana,
      bruno,
      [
        { a: 7, b: 6 },
        { a: 7, b: 5 },
      ],
      club.courts.Q1.id,
    ); // Ana wins on Har-Tru

    const member = await ctx.loginMember(carla.membershipId!);
    const history = await member.get(`/api/v1/players/${ana.id}/elo-history`).expect(200);
    // +16 (equal), −17 (Bruno 1184 upsets Ana 1216), +16 (1199 vs 1201 → 32 × 0.503).
    expect(history.body.map((point: { elo: number }) => point.elo)).toEqual([
      1200, 1216, 1199, 1215,
    ]);

    const { body } = await member.get(`/api/v1/h2h?a=${ana.id}&b=${bruno.id}`).expect(200);
    expect(body).toMatchObject({
      meetings: 3,
      a: { player: { name: "Ana Lima" }, h2hWins: 2, winRate: 67, matches: 3 },
      b: { player: { name: "Bruno Reis" }, h2hWins: 1, winRate: 33 },
      surfaces: {
        HARTRU: { played: 2, aWins: 1, bWins: 1 },
        SAIBRO: { played: 1, aWins: 1, bWins: 0 },
      },
    });
    // Scores are shown from player A's point of view, most recent first.
    expect(
      body.lastMeetings.map((meeting: { score: string; winner: string }) => [
        meeting.score,
        meeting.winner,
      ]),
    ).toEqual([
      ["7-6, 7-5", "a"],
      ["2-6, 2-6", "b"],
      ["6-4, 6-4", "a"],
    ]);
    expect(body.a.history).toHaveLength(4);
    await member.get(`/api/v1/h2h?a=${ana.id}&b=${ana.id}`).expect(400);

    const profile = await member.get(`/api/v1/players/${ana.id}`).expect(200);
    expect(profile.body).toMatchObject({ rank: 2, wins: 2, losses: 1 });
    expect(profile.body.recentMatches).toHaveLength(3);
  });
});
