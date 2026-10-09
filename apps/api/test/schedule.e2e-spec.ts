import { Role } from "@ficc/db";

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

describe("Schedule", () => {
  let ctx: TestContext;
  let club: Club;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  beforeEach(async () => {
    ctx.clock.reset();
    await resetDatabase(ctx);
    club = await seedClub(ctx);
  });

  it("returns every court × slot with lesson, booking, frozen and free states", async () => {
    const date = "2030-03-04"; // today on the fake clock (09:00)
    const member = await createMember(ctx.prisma, { name: "Ana Lima" });
    const partner = await createMember(ctx.prisma, { name: "Bruno Reis" });
    const { coach } = await createCoach(ctx.prisma, {
      name: "Alan",
      email: "alan@ficc.test",
      courtIds: [club.courts.Q5.id],
    });
    await createLesson(ctx.prisma, {
      coachId: coach.id,
      courtId: club.courts.Q5.id,
      timeSlotId: club.slots["18:30"]!.id,
      date,
    });
    const agent = await ctx.loginMember(member.membershipId!);
    await agent
      .post("/api/v1/bookings")
      .send({
        courtId: club.courts.Q2.id,
        timeSlotId: club.slots["16:00"]!.id,
        date,
        type: "SINGLES",
        playerIds: [partner.id],
      })
      .expect(201);
    const admin = await createStaff(ctx.prisma, Role.ADMIN, "admin@ficc.test");
    await ctx.prisma.courtFreeze.create({
      data: {
        reason: "MAINTENANCE",
        scope: "COURT",
        startsAt: new Date("2030-03-04T22:00:00Z"), // 19:00 club time
        createdById: admin.id,
        courts: { create: [{ courtId: club.courts.Q3.id }] },
      },
    });

    const { body } = await agent.get(`/api/v1/schedule?date=${date}`).expect(200);
    expect(body.courts.map((court: { name: string }) => court.name)).toEqual([
      "Q1",
      "Q2",
      "Q3",
      "Q4",
      "Q5",
      "Q6",
    ]);
    expect(body.slots.map((slot: { startTime: string }) => slot.startTime)).toEqual([
      "08:30",
      "10:00",
      "14:45",
      "16:00",
      "17:15",
      "18:30",
      "19:45",
      "21:00",
    ]);
    expect(body.cells).toHaveLength(48);

    const cell = (court: keyof Club["courts"], slot: string) =>
      body.cells.find(
        (entry: { courtId: string; timeSlotId: string }) =>
          entry.courtId === club.courts[court].id && entry.timeSlotId === club.slots[slot]!.id,
      );

    expect(cell("Q5", "18:30")).toMatchObject({
      state: "lesson",
      lesson: { coach: { displayName: "Alan" }, studentNames: null },
    });
    expect(cell("Q2", "16:00")).toMatchObject({
      state: "booking",
      booking: { type: "SINGLES", status: "PENDING" },
    });
    expect(cell("Q2", "16:00").booking.players).toHaveLength(2);
    // The 19:00 freeze touches the 18:30 slot (ends 19:45) and everything after it.
    expect(cell("Q3", "17:15").state).toBe("free");
    expect(cell("Q3", "18:30")).toMatchObject({
      state: "frozen",
      freeze: { reason: "MAINTENANCE" },
    });
    expect(cell("Q3", "21:00").state).toBe("frozen");
    expect(cell("Q1", "08:30")).toMatchObject({ state: "free", past: true });
    expect(cell("Q1", "10:00").past).toBe(false);
  });

  it("filters by surface", async () => {
    const member = await createMember(ctx.prisma);
    const agent = await ctx.loginMember(member.membershipId!);
    const { body } = await agent.get("/api/v1/schedule?date=2030-03-05&surface=SAIBRO").expect(200);
    expect(body.courts.map((court: { name: string }) => court.name)).toEqual(["Q5", "Q6"]);
    expect(body.cells).toHaveLength(16);
  });

  it("validates the query", async () => {
    const member = await createMember(ctx.prisma);
    const agent = await ctx.loginMember(member.membershipId!);
    await agent.get("/api/v1/schedule?date=2030-02-30").expect(400);
    await agent.get("/api/v1/schedule?date=2030-03-05&surface=GRASS").expect(400);
  });

  it("lists courts, slots and today's club date", async () => {
    const member = await createMember(ctx.prisma);
    const agent = await ctx.loginMember(member.membershipId!);
    const { body } = await agent.get("/api/v1/courts").expect(200);
    expect(body.today).toBe("2030-03-04");
    expect(body.courts).toHaveLength(6);
    expect(body.slots.at(-1)).toMatchObject({
      startTime: "21:00",
      endTime: "22:15",
      durationMinutes: 75,
    });
  });

  it("searches members by name or matrícula", async () => {
    const member = await createMember(ctx.prisma, { name: "Ana Lima", membershipId: "104218" });
    await createMember(ctx.prisma, { name: "Bruno Lima", membershipId: "205300" });
    const agent = await ctx.loginMember(member.membershipId!);
    const byName = await agent.get("/api/v1/members/search?q=lima").expect(200);
    expect(byName.body.map((player: { name: string }) => player.name)).toEqual([
      "Bruno Lima",
      "Ana Lima",
    ]);
    const byId = await agent.get("/api/v1/members/search?q=205.3").expect(200);
    expect(byId.body.map((player: { name: string }) => player.name)).toEqual(["Bruno Lima"]);
  });
});
