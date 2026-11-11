import { Role } from "@ficc/db";
import type { BookingDetail } from "@ficc/shared";

import { createTestApp, type TestContext } from "./support/app";
import { type Club, createMember, createStaff, resetDatabase, seedClub } from "./support/fixtures";

/** Monday 2030-03-04 09:00 in São Paulo; the bookings are for Tuesday. */
const MONDAY_9AM = "2030-03-04T12:00:00.000Z";
const TUESDAY = "2030-03-05";

describe("Bookings with a guest as a player", () => {
  let ctx: TestContext;
  let club: Club;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  beforeEach(async () => {
    await resetDatabase(ctx);
    ctx.clock.set(MONDAY_9AM);
    club = await seedClub(ctx);
  });

  const at = (court: "Q1" | "Q2", time: string) => ({
    courtId: club.courts[court].id,
    timeSlotId: club.slots[time]!.id,
    date: TUESDAY,
  });

  it("books singles with a guest: confirmed at once, the pass linked to the booking", async () => {
    await createMember(ctx.prisma, { membershipId: "7001", name: "Ana Lima" });
    const ana$ = await ctx.loginMember("7001");
    const pass = (
      await ana$
        .post(ctx.api("/guest-passes"))
        .send({
          guestName: "Carlos Souza",
          documentType: "CPF",
          documentNumber: "529.982.247-25",
          visitDate: TUESDAY,
        })
        .expect(201)
    ).body as { id: string };

    // The players + guests must fill the format.
    await ana$
      .post(ctx.api("/bookings"))
      .send({ ...at("Q1", "10:00"), type: "DOUBLES", playerIds: [], guestPassIds: [pass.id] })
      .expect(400);

    const booking = (
      await ana$
        .post(ctx.api("/bookings"))
        .send({ ...at("Q1", "10:00"), type: "SINGLES", playerIds: [], guestPassIds: [pass.id] })
        .expect(201)
    ).body as BookingDetail;
    expect(booking.status).toBe("CONFIRMED");
    expect(booking.players).toHaveLength(1);
    expect(booking.guests).toEqual([{ id: pass.id, name: "Carlos Souza" }]);
    const stored = await ctx.prisma.guestPass.findUniqueOrThrow({ where: { id: pass.id } });
    expect(stored.bookingId).toBe(booking.id);
    // The same guest cannot fill a spot in a second booking.
    const twice = await ana$
      .post(ctx.api("/bookings"))
      .send({ ...at("Q2", "18:30"), type: "SINGLES", playerIds: [], guestPassIds: [pass.id] })
      .expect(422);
    expect(twice.body.code).toBe("INVALID_GUESTS");
  });

  it("only takes the member's own passes for that day, at times open to guests", async () => {
    await createMember(ctx.prisma, { membershipId: "7001", name: "Ana Lima" });
    const bia = await createMember(ctx.prisma, { membershipId: "7002", name: "Bia Souza" });
    await createStaff(ctx.prisma, Role.ADMIN, "admin@ficc.test", "Super Admin");
    const ana$ = await ctx.loginMember("7001");
    const bia$ = await ctx.loginMember("7002");
    const admin$ = await ctx.loginStaff("admin@ficc.test");
    const guest = {
      guestName: "Carlos Souza",
      documentType: "CPF",
      documentNumber: "529.982.247-25",
    };
    const biasPass = (
      await bia$
        .post(ctx.api("/guest-passes"))
        .send({ ...guest, visitDate: TUESDAY })
        .expect(201)
    ).body as { id: string };
    const anasPass = (
      await ana$
        .post(ctx.api("/guest-passes"))
        .send({ ...guest, visitDate: TUESDAY })
        .expect(201)
    ).body as { id: string };

    const someoneElses = await ana$
      .post(ctx.api("/bookings"))
      .send({ ...at("Q1", "10:00"), type: "SINGLES", playerIds: [], guestPassIds: [biasPass.id] })
      .expect(422);
    expect(someoneElses.body.code).toBe("INVALID_GUESTS");

    await admin$
      .patch(ctx.api("/admin/settings"))
      .send({ guestBlockedTimes: { TUE: ["18:30"] } })
      .expect(200);
    const blocked = await ana$
      .post(ctx.api("/bookings"))
      .send({ ...at("Q1", "18:30"), type: "SINGLES", playerIds: [], guestPassIds: [anasPass.id] })
      .expect(422);
    expect(blocked.body.code).toBe("GUEST_BLOCKED_TIME");

    // Doubles with a member and a guest: the member still confirms.
    await createMember(ctx.prisma, { membershipId: "7003", name: "Caio Reis" });
    const caio = await ctx.prisma.user.findFirstOrThrow({ where: { membershipId: "7003" } });
    const doubles = (
      await ana$
        .post(ctx.api("/bookings"))
        .send({
          ...at("Q2", "10:00"),
          type: "DOUBLES",
          playerIds: [bia.id, caio.id],
          guestPassIds: [anasPass.id],
        })
        .expect(201)
    ).body as BookingDetail;
    expect(doubles.status).toBe("PENDING");
    expect(doubles.guests).toHaveLength(1);
  });
});
