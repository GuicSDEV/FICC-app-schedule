import { Role } from "@ficc/db";
import type { AdminMemberItem, BookingDetail, MyBookingsResponse } from "@ficc/shared";
import type TestAgent from "supertest/lib/agent";

import { createTestApp, type TestContext } from "./support/app";
import { type Club, createMember, createStaff, resetDatabase, seedClub } from "./support/fixtures";

/** Monday 2030-03-04 09:00 in São Paulo (the fake clock's default). */
const MONDAY_9AM = "2030-03-04T12:00:00.000Z";
const TUESDAY = "2030-03-05";

describe("Booking rules per member (admin exceptions, booking alone)", () => {
  let ctx: TestContext;
  let club: Club;
  let admin$: TestAgent;
  let ronaldo$: TestAgent;
  let bia$: TestAgent;
  let ids: { ronaldo: string; bia: string; caio: string; dani: string };

  const at = (court: "Q1" | "Q2" | "Q3", time: string) => ({
    courtId: club.courts[court].id,
    timeSlotId: club.slots[time]!.id,
    date: TUESDAY,
  });
  const rules = (id: string, body: object) =>
    admin$.patch(ctx.api(`/admin/members/${id}/booking-rules`)).send(body);

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx);
    ctx.clock.set(MONDAY_9AM);
    club = await seedClub(ctx);
    await createStaff(ctx.prisma, Role.ADMIN, "admin@ficc.test", "Super Admin");
    const ronaldo = await createMember(ctx.prisma, { membershipId: "9001", name: "Ronaldo" });
    const bia = await createMember(ctx.prisma, { membershipId: "9002", name: "Bia" });
    const caio = await createMember(ctx.prisma, { membershipId: "9003", name: "Caio" });
    const dani = await createMember(ctx.prisma, { membershipId: "9004", name: "Dani" });
    ids = { ronaldo: ronaldo.id, bia: bia.id, caio: caio.id, dani: dani.id };
    admin$ = await ctx.loginStaff("admin@ficc.test");
    ronaldo$ = await ctx.loginMember("9001");
    bia$ = await ctx.loginMember("9002");
  });

  it("books alone only with the admin's permission, confirmed at once, twice a day with his own limit", async () => {
    const alone = { ...at("Q1", "08:30"), type: "DOUBLES", playerIds: [], alone: true };
    expect((await ronaldo$.post(ctx.api("/bookings")).send(alone).expect(403)).body.code).toBe(
      "BOOK_ALONE_NOT_ALLOWED",
    );

    await rules(ids.ronaldo, { bookingsPerDay: 2, activeBookings: 4, canBookAlone: true }).expect(
      200,
    );
    const list = (await admin$.get(ctx.api("/admin/members")).expect(200))
      .body as AdminMemberItem[];
    expect(list.find((entry) => entry.player.id === ids.ronaldo)?.bookingRules).toEqual({
      bookingsPerDay: 2,
      activeBookings: 4,
      canBookAlone: true,
    });
    expect((await ronaldo$.get(ctx.api("/auth/me")).expect(200)).body.canBookAlone).toBe(true);

    const first = (await ronaldo$.post(ctx.api("/bookings")).send(alone).expect(201))
      .body as BookingDetail;
    expect(first.status).toBe("CONFIRMED");
    expect(first.players).toHaveLength(1);
    await ronaldo$
      .post(ctx.api("/bookings"))
      .send({ ...alone, ...at("Q2", "10:00") })
      .expect(201);
    // His own limit (2 a day) is reached; the club's rule (1 a day) still holds for the others.
    expect(
      (
        await ronaldo$
          .post(ctx.api("/bookings"))
          .send({ ...alone, ...at("Q3", "14:45") })
          .expect(422)
      ).body.code,
    ).toBe("MAX_BOOKINGS_PER_DAY");
    await bia$
      .post(ctx.api("/bookings"))
      .send({ ...at("Q3", "14:45"), type: "SINGLES", playerIds: [ids.caio] })
      .expect(201);
    expect(
      (
        await bia$
          .post(ctx.api("/bookings"))
          .send({ ...at("Q1", "16:00"), type: "SINGLES", playerIds: [ids.dani] })
          .expect(422)
      ).body.code,
    ).toBe("MAX_BOOKINGS_PER_DAY");

    // Back to the club's rule: no more booking alone.
    await rules(ids.ronaldo, {
      bookingsPerDay: null,
      activeBookings: null,
      canBookAlone: false,
    }).expect(200);
    expect((await ronaldo$.get(ctx.api("/auth/me")).expect(200)).body.canBookAlone).toBe(false);
  });

  it("adds the players later; a decline only takes that player out", async () => {
    await rules(ids.ronaldo, {
      bookingsPerDay: null,
      activeBookings: null,
      canBookAlone: true,
    }).expect(200);
    const booking = (
      await ronaldo$
        .post(ctx.api("/bookings"))
        .send({ ...at("Q1", "08:30"), type: "SINGLES", playerIds: [], alone: true })
        .expect(201)
    ).body as BookingDetail;

    // Only the creator adds players, and no more than the game takes.
    await bia$
      .post(ctx.api(`/bookings/${booking.id}/players`))
      .send({ playerIds: [ids.caio] })
      .expect(403);
    expect(
      (
        await ronaldo$
          .post(ctx.api(`/bookings/${booking.id}/players`))
          .send({ playerIds: [ids.bia, ids.caio] })
          .expect(422)
      ).body.code,
    ).toBe("BOOKING_FULL");

    const added = (
      await ronaldo$
        .post(ctx.api(`/bookings/${booking.id}/players`))
        .send({ playerIds: [ids.bia] })
        .expect(200)
    ).body as BookingDetail;
    expect(added.status).toBe("CONFIRMED");
    expect(added.players.map((player) => player.user.id).sort()).toEqual(
      [ids.ronaldo, ids.bia].sort(),
    );
    expect(
      await ctx.prisma.notification.count({ where: { userId: ids.bia, type: "BOOKING_INVITE" } }),
    ).toBe(1);
    const mine = (await bia$.get(ctx.api("/bookings/mine")).expect(200)).body as MyBookingsResponse;
    expect(mine.invites.map((entry) => entry.id)).toEqual([booking.id]);

    // Bia declines: she leaves, the court stays booked for Ronaldo, who is told.
    const after = (await bia$.post(ctx.api(`/bookings/${booking.id}/decline`)).expect(200))
      .body as BookingDetail;
    expect(after.status).toBe("CONFIRMED");
    expect(after.players.map((player) => player.user.id)).toEqual([ids.ronaldo]);
    expect(
      await ctx.prisma.notification.count({
        where: { userId: ids.ronaldo, type: "BOOKING_PLAYER_LEFT" },
      }),
    ).toBe(1);

    // Caio is added and confirms: still one confirmed booking.
    await ronaldo$
      .post(ctx.api(`/bookings/${booking.id}/players`))
      .send({ playerIds: [ids.caio] })
      .expect(200);
    const caio$ = await ctx.loginMember("9003");
    const confirmed = (await caio$.post(ctx.api(`/bookings/${booking.id}/confirm`)).expect(200))
      .body as BookingDetail;
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.myStatus).toBe("CONFIRMED");
  });
});
