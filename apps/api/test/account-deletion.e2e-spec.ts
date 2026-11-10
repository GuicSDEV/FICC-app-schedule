import { createTestApp, type TestContext } from "./support/app";
import {
  type Club,
  createMember,
  resetDatabase,
  seedClub,
  TEST_PASSWORD,
} from "./support/fixtures";

describe("Account deletion", () => {
  let ctx: TestContext;
  let club: Club;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  beforeEach(async () => {
    await resetDatabase(ctx);
    ctx.clock.set("2030-03-04T12:00:00.000Z");
    club = await seedClub(ctx);
  });

  it("cancels the member's bookings, removes their data and frees the matrícula", async () => {
    const ana = await createMember(ctx.prisma, { membershipId: "5001", name: "Ana Lima" });
    const bia = await createMember(ctx.prisma, { membershipId: "5002", name: "Bia Souza" });
    const ana$ = await ctx.loginMember("5001");
    const booking = await ana$
      .post(ctx.api("/bookings"))
      .send({
        courtId: club.courts.Q1.id,
        timeSlotId: club.slots["18:30"]!.id,
        date: "2030-03-05",
        type: "SINGLES",
        playerIds: [bia.id],
      })
      .expect(201);

    // The password is checked first.
    const wrong = await ana$.delete(ctx.api("/account")).send({ password: "errada" }).expect(401);
    expect(wrong.body.code).toBe("WRONG_PASSWORD");

    await ana$.delete(ctx.api("/account")).send({ password: TEST_PASSWORD }).expect(204);

    // The booking is cancelled and the other player told.
    const cancelled = await ctx.prisma.booking.findUniqueOrThrow({
      where: { id: booking.body.id },
    });
    expect(cancelled.status).toBe("CANCELLED");
    expect(await ctx.prisma.slotOccupancy.count()).toBe(0);
    expect(
      await ctx.prisma.notification.count({ where: { userId: bia.id, type: "BOOKING_CANCELLED" } }),
    ).toBe(1);

    // No personal data, no login, signed out.
    const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: ana.id } });
    expect(row).toMatchObject({
      name: "Ex-sócio",
      membershipId: null,
      isActive: false,
      photoUrl: null,
    });
    expect(row.deletedAt).not.toBeNull();
    await ana$.get(ctx.api("/auth/me")).expect(401);
    await ctx
      .http()
      .post(ctx.api("/auth/login"))
      .send({ kind: "member", membershipId: "5001", password: TEST_PASSWORD })
      .expect(401);

    // The matrícula can be registered again (waiting for the club's approval).
    const again = await ctx
      .http()
      .post(ctx.api("/auth/register"))
      .send({ membershipId: "5001", name: "Ana Lima", password: TEST_PASSWORD })
      .expect(202);
    expect(again.body.status).toBe("PENDING");
  });
});
