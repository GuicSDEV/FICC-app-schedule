import { Role, type User } from "@ficc/db";

import { BookingsService } from "../src/bookings/bookings.service";

import { createTestApp, type TestContext } from "./support/app";
import {
  type Club,
  createCoach,
  createLesson,
  createMember,
  createStaff,
  resetDatabase,
  seedClub,
} from "./support/fixtures";

// The fake clock is Monday 2030-03-04 09:00 (club time); bookings target Wednesday.
const WEDNESDAY = "2030-03-06";
const THURSDAY = "2030-03-07";

describe("Bookings", () => {
  let ctx: TestContext;
  let club: Club;
  let ana: User;
  let bruno: User;
  let carla: User;
  let diego: User;
  let eva: User;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  beforeEach(async () => {
    ctx.clock.reset();
    await resetDatabase(ctx);
    club = await seedClub(ctx);
    ana = await createMember(ctx.prisma, { name: "Ana Lima", membershipId: "100001" });
    bruno = await createMember(ctx.prisma, { name: "Bruno Reis", membershipId: "100002" });
    carla = await createMember(ctx.prisma, { name: "Carla Dias", membershipId: "100003" });
    diego = await createMember(ctx.prisma, { name: "Diego Melo", membershipId: "100004" });
    eva = await createMember(ctx.prisma, { name: "Eva Prado", membershipId: "100005" });
  });

  const singles = (playerId: string, overrides: Record<string, unknown> = {}) => ({
    courtId: club.courts.Q2.id,
    timeSlotId: club.slots["18:30"]!.id,
    date: WEDNESDAY,
    type: "SINGLES",
    playerIds: [playerId],
    ...overrides,
  });

  const cellState = async (
    agent: Awaited<ReturnType<TestContext["loginMember"]>>,
    courtId: string,
    slot: string,
    date = WEDNESDAY,
  ) => {
    const response = await agent.get(`/api/v1/schedule?date=${date}`).expect(200);
    return response.body.cells.find(
      (cell: { courtId: string; timeSlotId: string }) =>
        cell.courtId === courtId && cell.timeSlotId === club.slots[slot]!.id,
    );
  };

  describe("creating", () => {
    it("creates a PENDING singles booking that holds the slot and invites the opponent", async () => {
      const agent = await ctx.loginMember(ana.membershipId!);
      const response = await agent.post("/api/v1/bookings").send(singles(bruno.id)).expect(201);

      expect(response.body).toMatchObject({
        status: "PENDING",
        type: "SINGLES",
        date: WEDNESDAY,
        court: { name: "Q2", surface: "HARTRU" },
        slot: { startTime: "18:30", endTime: "19:45" },
        myStatus: "CONFIRMED",
      });
      expect(
        response.body.players.map((player: { user: { name: string } }) => player.user.name),
      ).toEqual(["Ana Lima", "Bruno Reis"]);
      // Expires 2 h after creation.
      expect(response.body.expiresAt).toBe("2030-03-04T14:00:00.000Z");

      const cell = await cellState(agent, club.courts.Q2.id, "18:30");
      expect(cell).toMatchObject({ state: "booking", booking: { status: "PENDING" } });

      const invite = await ctx.prisma.notification.findFirstOrThrow({
        where: { userId: bruno.id },
      });
      expect(invite).toMatchObject({
        type: "BOOKING_INVITE",
        payload: expect.objectContaining({ invitedBy: "Ana Lima" }),
      });
    });

    it("prevents double-booking the same court, date and slot", async () => {
      const ana$ = await ctx.loginMember(ana.membershipId!);
      const carla$ = await ctx.loginMember(carla.membershipId!);
      await ana$.post("/api/v1/bookings").send(singles(bruno.id)).expect(201);

      const second = await carla$.post("/api/v1/bookings").send(singles(diego.id)).expect(409);
      expect(second.body.code).toBe("SLOT_TAKEN");
    });

    it("lets only one of two simultaneous requests win the slot", async () => {
      const ana$ = await ctx.loginMember(ana.membershipId!);
      const carla$ = await ctx.loginMember(carla.membershipId!);
      const results = await Promise.all([
        ana$.post("/api/v1/bookings").send(singles(bruno.id)),
        carla$.post("/api/v1/bookings").send(singles(diego.id)),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
      expect(await ctx.prisma.slotOccupancy.count()).toBe(1);
    });

    it("refuses a slot held by a lesson", async () => {
      const { coach } = await createCoach(ctx.prisma, {
        name: "Alan",
        email: "alan@ficc.test",
        courtIds: [club.courts.Q5.id],
      });
      await createLesson(ctx.prisma, {
        coachId: coach.id,
        courtId: club.courts.Q5.id,
        timeSlotId: club.slots["18:30"]!.id,
        date: WEDNESDAY,
      });
      const agent = await ctx.loginMember(ana.membershipId!);
      const response = await agent
        .post("/api/v1/bookings")
        .send(singles(bruno.id, { courtId: club.courts.Q5.id }))
        .expect(409);
      expect(response.body.code).toBe("SLOT_HAS_LESSON");
    });

    it.each([
      ["singles with two others", "SINGLES", 2],
      ["singles with nobody", "SINGLES", 0],
      ["doubles with one other", "DOUBLES", 1],
      ["doubles with two others", "DOUBLES", 2],
    ])("rejects the wrong player count: %s", async (_label, type, count) => {
      const agent = await ctx.loginMember(ana.membershipId!);
      const others = [bruno.id, carla.id, diego.id].slice(0, count as number);
      const response = await agent
        .post("/api/v1/bookings")
        .send(singles(bruno.id, { type, playerIds: others }))
        .expect(400);
      expect(response.body.code).toBe("VALIDATION_FAILED");
      expect(await ctx.prisma.booking.count()).toBe(0);
    });

    it("rejects tagging yourself and non-members", async () => {
      const agent = await ctx.loginMember(ana.membershipId!);
      const self = await agent.post("/api/v1/bookings").send(singles(ana.id)).expect(422);
      expect(self.body.code).toBe("INVALID_PLAYERS");

      const admin = await createStaff(ctx.prisma, Role.ADMIN, "admin@ficc.test");
      const staff = await agent.post("/api/v1/bookings").send(singles(admin.id)).expect(422);
      expect(staff.body.code).toBe("INVALID_PLAYERS");
    });

    it("does not let a player be in two bookings at the same time", async () => {
      const ana$ = await ctx.loginMember(ana.membershipId!);
      await ana$.post("/api/v1/bookings").send(singles(bruno.id)).expect(201);
      const carla$ = await ctx.loginMember(carla.membershipId!);
      const response = await carla$
        .post("/api/v1/bookings")
        .send(singles(bruno.id, { courtId: club.courts.Q3.id }))
        .expect(409);
      expect(response.body).toMatchObject({
        code: "PLAYER_BUSY",
        message: "Bruno Reis já tem uma reserva nesse horário.",
      });
    });

    it("allows at most 2 future active bookings per member", async () => {
      const agent = await ctx.loginMember(ana.membershipId!);
      await agent
        .post("/api/v1/bookings")
        .send(singles(bruno.id, { timeSlotId: club.slots["17:15"]!.id }))
        .expect(201);
      await agent
        .post("/api/v1/bookings")
        .send(singles(carla.id, { date: THURSDAY }))
        .expect(201);

      const third = await agent
        .post("/api/v1/bookings")
        .send(singles(diego.id, { timeSlotId: club.slots["21:00"]!.id }))
        .expect(422);
      expect(third.body.code).toBe("BOOKING_LIMIT");

      // The rule also protects invited players: Bruno is in one booking, give him a second…
      const eva$ = await ctx.loginMember(eva.membershipId!);
      await eva$
        .post("/api/v1/bookings")
        .send(singles(bruno.id, { courtId: club.courts.Q4.id, date: THURSDAY }))
        .expect(201);
      // …a third invitation for Bruno is refused.
      const diego$ = await ctx.loginMember(diego.membershipId!);
      const forBruno = await diego$
        .post("/api/v1/bookings")
        .send(
          singles(bruno.id, { courtId: club.courts.Q1.id, timeSlotId: club.slots["21:00"]!.id }),
        )
        .expect(422);
      expect(forBruno.body.message).toContain("Bruno Reis já tem 2 reservas ativas");
    });

    it("frees a place under the limit once a booking is cancelled", async () => {
      const agent = await ctx.loginMember(ana.membershipId!);
      const first = await agent
        .post("/api/v1/bookings")
        .send(singles(bruno.id, { timeSlotId: club.slots["17:15"]!.id }))
        .expect(201);
      await agent
        .post("/api/v1/bookings")
        .send(singles(carla.id, { date: THURSDAY }))
        .expect(201);
      await agent.post(`/api/v1/bookings/${first.body.id}/cancel`).expect(200);
      await agent
        .post("/api/v1/bookings")
        .send(singles(diego.id, { timeSlotId: club.slots["21:00"]!.id }))
        .expect(201);
    });

    it("refuses past slots, dates beyond the booking window and frozen courts", async () => {
      const agent = await ctx.loginMember(ana.membershipId!);
      const past = await agent
        .post("/api/v1/bookings")
        .send(singles(bruno.id, { date: "2030-03-04", timeSlotId: club.slots["08:30"]!.id }))
        .expect(422);
      expect(past.body.code).toBe("SLOT_IN_PAST");

      // Today + 13 days is the last bookable date.
      const tooFar = await agent
        .post("/api/v1/bookings")
        .send(singles(bruno.id, { date: "2030-03-18" }))
        .expect(422);
      expect(tooFar.body.code).toBe("BEYOND_BOOKING_WINDOW");
      const lastDay = await agent
        .post("/api/v1/bookings")
        .send(singles(bruno.id, { date: "2030-03-17" }))
        .expect(201);
      await agent.post(`/api/v1/bookings/${lastDay.body.id}/cancel`).expect(200);

      const admin = await createStaff(ctx.prisma, Role.ADMIN, "admin@ficc.test");
      await ctx.prisma.courtFreeze.create({
        data: {
          reason: "RAIN",
          scope: "COURT",
          startsAt: new Date("2030-03-06T12:00:00Z"),
          endsAt: new Date("2030-03-07T03:00:00Z"),
          createdById: admin.id,
          courts: { create: [{ courtId: club.courts.Q2.id }] },
        },
      });
      const frozen = await agent.post("/api/v1/bookings").send(singles(bruno.id)).expect(409);
      expect(frozen.body.code).toBe("COURT_FROZEN");
    });
  });

  describe("confirmation flow", () => {
    it("confirms singles once the opponent accepts and notifies both players", async () => {
      const ana$ = await ctx.loginMember(ana.membershipId!);
      const bruno$ = await ctx.loginMember(bruno.membershipId!);
      const created = await ana$.post("/api/v1/bookings").send(singles(bruno.id)).expect(201);

      const invites = await bruno$.get("/api/v1/bookings/mine").expect(200);
      expect(invites.body.invites.map((booking: { id: string }) => booking.id)).toEqual([
        created.body.id,
      ]);

      const confirmed = await bruno$
        .post(`/api/v1/bookings/${created.body.id}/confirm`)
        .expect(200);
      expect(confirmed.body).toMatchObject({ status: "CONFIRMED", myStatus: "CONFIRMED" });
      expect(
        await ctx.prisma.notification.count({
          where: { type: "BOOKING_CONFIRMED", userId: { in: [ana.id, bruno.id] } },
        }),
      ).toBe(2);
      expect((await bruno$.get("/api/v1/bookings/mine")).body.invites).toEqual([]);
      await bruno$.post(`/api/v1/bookings/${created.body.id}/confirm`).expect(409);
    });

    it("keeps doubles pending until all four players confirm", async () => {
      const ana$ = await ctx.loginMember(ana.membershipId!);
      const created = await ana$
        .post("/api/v1/bookings")
        .send(singles(bruno.id, { type: "DOUBLES", playerIds: [bruno.id, carla.id, diego.id] }))
        .expect(201);

      for (const [index, player] of [bruno, carla, diego].entries()) {
        const agent = await ctx.loginMember(player.membershipId!);
        const response = await agent
          .post(`/api/v1/bookings/${created.body.id}/confirm`)
          .expect(200);
        expect(response.body.status).toBe(index < 2 ? "PENDING" : "CONFIRMED");
      }
    });

    it("cancels the booking and frees the slot when a player declines", async () => {
      await ctx.prisma.slotFavorite.create({
        data: { userId: eva.id, courtId: club.courts.Q2.id, timeSlotId: club.slots["18:30"]!.id },
      });
      const ana$ = await ctx.loginMember(ana.membershipId!);
      const bruno$ = await ctx.loginMember(bruno.membershipId!);
      const created = await ana$.post("/api/v1/bookings").send(singles(bruno.id)).expect(201);

      const declined = await bruno$.post(`/api/v1/bookings/${created.body.id}/decline`).expect(200);
      expect(declined.body).toMatchObject({ status: "CANCELLED", cancelReason: "DECLINED" });
      expect(await cellState(ana$, club.courts.Q2.id, "18:30")).toMatchObject({
        state: "free",
        booking: null,
      });
      expect(
        await ctx.prisma.notification.findFirst({
          where: { userId: ana.id, type: "BOOKING_CANCELLED" },
        }),
      ).not.toBeNull();
      // Members watching that court + slot hear it opened.
      expect(
        await ctx.prisma.notification.findFirst({ where: { userId: eva.id, type: "SLOT_OPENED" } }),
      ).not.toBeNull();
      // The slot can be booked again.
      await ana$.post("/api/v1/bookings").send(singles(carla.id)).expect(201);
    });

    it("expires pending bookings after 2 hours and releases the slot", async () => {
      const ana$ = await ctx.loginMember(ana.membershipId!);
      const bruno$ = await ctx.loginMember(bruno.membershipId!);
      const created = await ana$.post("/api/v1/bookings").send(singles(bruno.id)).expect(201);
      const bookings = ctx.app.get(BookingsService);

      ctx.clock.advance(119 * 60 * 1000);
      expect(await ctx.inClub(() => bookings.expirePending())).toBe(0);

      ctx.clock.advance(60 * 1000);
      expect(await ctx.inClub(() => bookings.expirePending())).toBe(1);
      const booking = await ctx.prisma.booking.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(booking).toMatchObject({ status: "CANCELLED", cancelReason: "EXPIRED" });
      expect(await ctx.prisma.slotOccupancy.count()).toBe(0);

      const late = await bruno$.post(`/api/v1/bookings/${created.body.id}/confirm`).expect(409);
      expect(late.body.code).toBe("BOOKING_NOT_PENDING");
    });

    it("refuses a confirmation that arrives after the deadline even before the job runs", async () => {
      const ana$ = await ctx.loginMember(ana.membershipId!);
      const bruno$ = await ctx.loginMember(bruno.membershipId!);
      const created = await ana$.post("/api/v1/bookings").send(singles(bruno.id)).expect(201);
      ctx.clock.advance(2 * 60 * 60 * 1000 + 1);
      const response = await bruno$.post(`/api/v1/bookings/${created.body.id}/confirm`).expect(409);
      expect(response.body.code).toBe("BOOKING_EXPIRED");
      expect(await ctx.prisma.slotOccupancy.count()).toBe(0);
    });

    it("lets a player cancel and stops strangers from touching the booking", async () => {
      const ana$ = await ctx.loginMember(ana.membershipId!);
      const eva$ = await ctx.loginMember(eva.membershipId!);
      const created = await ana$.post("/api/v1/bookings").send(singles(bruno.id)).expect(201);

      await eva$.post(`/api/v1/bookings/${created.body.id}/confirm`).expect(403);
      await eva$.post(`/api/v1/bookings/${created.body.id}/cancel`).expect(403);
      const cancelled = await ana$.post(`/api/v1/bookings/${created.body.id}/cancel`).expect(200);
      expect(cancelled.body).toMatchObject({
        status: "CANCELLED",
        cancelReason: "CANCELLED_BY_PLAYER",
      });
    });
  });

  describe("favorites", () => {
    it("adds, lists and removes a court + slot favorite", async () => {
      const agent = await ctx.loginMember(ana.membershipId!);
      const body = { courtId: club.courts.Q5.id, timeSlotId: club.slots["19:45"]!.id };
      await agent.post("/api/v1/favorites").send(body).expect(201);
      await agent.post("/api/v1/favorites").send(body).expect(201);
      expect((await agent.get("/api/v1/favorites")).body).toHaveLength(1);
      expect((await cellState(agent, club.courts.Q5.id, "19:45")).favorite).toBe(true);
      await agent.delete("/api/v1/favorites").send(body).expect(204);
      expect((await agent.get("/api/v1/favorites")).body).toHaveLength(0);
    });
  });
});
