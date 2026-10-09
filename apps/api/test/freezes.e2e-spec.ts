import { Role, type User } from "@ficc/db";

import { createTestApp, type TestContext } from "./support/app";
import {
  type Club,
  createCoach,
  createMember,
  createStaff,
  resetDatabase,
  seedClub,
} from "./support/fixtures";

describe("Court freezes and admin coaches", () => {
  let ctx: TestContext;
  let club: Club;
  let ana: User;
  let bruno: User;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  beforeEach(async () => {
    ctx.clock.reset();
    await resetDatabase(ctx);
    club = await seedClub(ctx);
    await createStaff(ctx.prisma, Role.ADMIN, "admin@ficc.test", "Diretoria");
    ana = await createMember(ctx.prisma, { name: "Ana Lima" });
    bruno = await createMember(ctx.prisma, { name: "Bruno Reis" });
  });

  const booking = (courtId: string, date = "2030-03-04", slot = "18:30") => ({
    courtId,
    timeSlotId: club.slots[slot]!.id,
    date,
    type: "SINGLES",
    playerIds: [bruno.id],
  });

  it("freezes all Saibro courts: blocks bookings and lessons, lists and cancels what it hits, then lifts", async () => {
    const alan = await createCoach(ctx.prisma, {
      name: "Alan",
      email: "alan@ficc.test",
      courtIds: [club.courts.Q5.id],
    });
    const member = await ctx.loginMember(ana.membershipId!);
    const coach = await ctx.loginStaff("alan@ficc.test");
    const admin = await ctx.loginStaff("admin@ficc.test");

    const existing = await member
      .post("/api/v1/bookings")
      .send(booking(club.courts.Q6.id))
      .expect(201);
    const lesson = await coach
      .post("/api/v1/coach/lessons")
      .send({ courtId: club.courts.Q5.id, timeSlotId: club.slots["19:45"]!.id, date: "2030-03-04" })
      .expect(201);
    // Outside the window: untouched.
    await member
      .post("/api/v1/bookings")
      .send(booking(club.courts.Q6.id, "2030-03-05"))
      .expect(201);

    const freeze = await admin
      .post("/api/v1/admin/freezes")
      .send({
        target: { scope: "SURFACE", surface: "SAIBRO" },
        reason: "RAIN",
        startsAt: "2030-03-04T14:00:00-03:00",
        endsAt: "2030-03-04T23:00:00-03:00",
      })
      .expect(201);
    expect(freeze.body).toMatchObject({
      scope: "SURFACE",
      surface: "SAIBRO",
      courtNames: ["Q5", "Q6"],
      reason: "RAIN",
    });
    expect(freeze.body.affected.bookings.map((entry: { id: string }) => entry.id)).toEqual([
      existing.body.id,
    ]);
    expect(freeze.body.affected.lessons.map((entry: { id: string }) => entry.id)).toEqual([
      lesson.body.lesson.id,
    ]);
    // Impacted players and the coach are notified.
    expect(
      await ctx.prisma.notification.count({
        where: { type: "COURT_FROZEN", userId: { in: [ana.id, bruno.id, alan.user.id] } },
      }),
    ).toBe(3);

    // A freeze blocks booking (and lessons) on the frozen courts.
    const blocked = await member
      .post("/api/v1/bookings")
      .send(booking(club.courts.Q5.id, "2030-03-04", "21:00"))
      .expect(409);
    expect(blocked.body.code).toBe("COURT_FROZEN");
    const blockedLesson = await coach
      .post("/api/v1/coach/lessons")
      .send({ courtId: club.courts.Q5.id, timeSlotId: club.slots["21:00"]!.id, date: "2030-03-04" })
      .expect(409);
    expect(blockedLesson.body.code).toBe("COURT_FROZEN");
    // Har-Tru courts still work.
    await ctx.prisma.booking.deleteMany({});
    await ctx.prisma.slotOccupancy.deleteMany({ where: { bookingId: { not: null } } });

    // At 09:00 the 14:00 freeze is announced as upcoming; once it starts it is active.
    const upcoming = await member.get("/api/v1/freezes/active").expect(200);
    expect(upcoming.body).toEqual([
      expect.objectContaining({ id: freeze.body.id, active: false, courtNames: ["Q5", "Q6"] }),
    ]);
    ctx.clock.set("2030-03-04T18:00:00Z");
    const banner = await member.get("/api/v1/freezes/active").expect(200);
    expect(banner.body).toEqual([expect.objectContaining({ id: freeze.body.id, active: true })]);

    const afterCancel = await admin
      .post(`/api/v1/admin/freezes/${freeze.body.id}/cancel-affected`)
      .send({ lessonIds: [lesson.body.lesson.id] })
      .expect(200);
    expect(afterCancel.body.affected.lessons).toEqual([]);

    await admin.post(`/api/v1/admin/freezes/${freeze.body.id}/lift`).expect(200);
    expect((await member.get("/api/v1/freezes/active")).body).toEqual([]);
    await member
      .post("/api/v1/bookings")
      .send(booking(club.courts.Q5.id, "2030-03-04", "21:00"))
      .expect(201);
    await admin.post(`/api/v1/admin/freezes/${freeze.body.id}/lift`).expect(409);
  });

  it("bulk-cancels affected bookings with the freeze reason", async () => {
    const member = await ctx.loginMember(ana.membershipId!);
    const admin = await ctx.loginStaff("admin@ficc.test");
    const existing = await member
      .post("/api/v1/bookings")
      .send(booking(club.courts.Q2.id, "2030-03-05"))
      .expect(201);
    const freeze = await admin
      .post("/api/v1/admin/freezes")
      .send({
        target: { scope: "COURT", courtId: club.courts.Q2.id },
        reason: "MAINTENANCE",
        startsAt: "2030-03-05T00:00:00-03:00",
      })
      .expect(201);
    expect(freeze.body.endsAt).toBeNull();

    await admin
      .post(`/api/v1/admin/freezes/${freeze.body.id}/cancel-affected`)
      .send({ bookingIds: ["not-affected"] })
      .expect(422);
    await admin
      .post(`/api/v1/admin/freezes/${freeze.body.id}/cancel-affected`)
      .send({ bookingIds: [existing.body.id] })
      .expect(200);
    expect(
      await ctx.prisma.booking.findUniqueOrThrow({ where: { id: existing.body.id } }),
    ).toMatchObject({
      status: "CANCELLED",
      cancelReason: "COURT_FROZEN",
    });
  });

  it("keeps freezes admin-only", async () => {
    const member = await ctx.loginMember(ana.membershipId!);
    await member
      .post("/api/v1/admin/freezes")
      .send({ target: { scope: "ALL" }, reason: "RAIN", startsAt: "2030-03-04T14:00:00-03:00" })
      .expect(403);
  });

  it("creates, updates and deactivates coach accounts", async () => {
    const admin = await ctx.loginStaff("admin@ficc.test");
    const created = await admin
      .post("/api/v1/admin/coaches")
      .send({
        name: "Carla Mendes",
        email: "carla@ficc.test",
        password: "senha-forte-1",
        displayName: "Carla",
        color: "#a78bfa",
        courtIds: [club.courts.Q2.id],
      })
      .expect(201);
    expect(created.body).toMatchObject({
      displayName: "Carla",
      color: "#A78BFA",
      isActive: true,
      courtIds: [club.courts.Q2.id],
    });
    await admin
      .post("/api/v1/admin/coaches")
      .send({
        name: "Outra Pessoa",
        email: "carla@ficc.test",
        password: "senha-forte-1",
        displayName: "Xu",
        color: "#000000",
        courtIds: [club.courts.Q2.id],
      })
      .expect(409);

    const login = await ctx
      .http()
      .post("/api/v1/auth/login")
      .send({ kind: "staff", email: "carla@ficc.test", password: "senha-forte-1" });
    expect(login.status).toBe(200);

    const updated = await admin
      .patch(`/api/v1/admin/coaches/${created.body.id}`)
      .send({ courtIds: [club.courts.Q3.id, club.courts.Q4.id], displayName: "Profa. Carla" })
      .expect(200);
    expect(updated.body).toMatchObject({
      displayName: "Profa. Carla",
      courtIds: [club.courts.Q3.id, club.courts.Q4.id].sort(),
    });

    await admin
      .patch(`/api/v1/admin/coaches/${created.body.id}`)
      .send({ isActive: false })
      .expect(200);
    await ctx
      .http()
      .post("/api/v1/auth/login")
      .send({ kind: "staff", email: "carla@ficc.test", password: "senha-forte-1" })
      .expect(401);
    expect((await admin.get("/api/v1/admin/coaches")).body[0]).toMatchObject({ isActive: false });
  });
});
