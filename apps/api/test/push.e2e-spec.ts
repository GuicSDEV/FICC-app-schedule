import webpush from "web-push";

import { createTestApp, type TestContext } from "./support/app";
import { type Club, createMember, resetDatabase, seedClub } from "./support/fixtures";

const KEYS = webpush.generateVAPIDKeys();
const subscription = (n: number) => ({
  endpoint: `https://push.example.com/send/device-${n}`,
  keys: {
    p256dh:
      "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
    auth: "tBHItJI5svbpez7KI4CCXg",
  },
});

describe("Phone notifications (web push)", () => {
  let ctx: TestContext;
  let club: Club;
  const send = jest.spyOn(webpush, "sendNotification");

  beforeAll(async () => {
    process.env.VAPID_PUBLIC_KEY = KEYS.publicKey;
    process.env.VAPID_PRIVATE_KEY = KEYS.privateKey;
    ctx = await createTestApp();
  });

  afterAll(async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    send.mockRestore();
    await ctx.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx);
    ctx.clock.set("2030-03-04T12:00:00.000Z");
    club = await seedClub(ctx);
    send.mockReset();
  });

  /** Lets the fire-and-forget push send finish. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  it("sends an invitation to the invited player's phone, in the club's language", async () => {
    const ana = await createMember(ctx.prisma, { membershipId: "4001", name: "Ana Lima" });
    const bia = await createMember(ctx.prisma, { membershipId: "4002", name: "Bia" });
    const ana$ = await ctx.loginMember("4001");
    const bia$ = await ctx.loginMember("4002");

    expect((await bia$.get(ctx.api("/push/key")).expect(200)).body.publicKey).toBe(KEYS.publicKey);
    await bia$.post(ctx.api("/push/subscriptions")).send(subscription(1)).expect(204);
    send.mockResolvedValue({ statusCode: 201, body: "", headers: {} });

    await ana$
      .post(ctx.api("/bookings"))
      .send({
        courtId: club.courts.Q1.id,
        timeSlotId: club.slots["18:30"]!.id,
        date: "2030-03-05",
        type: "SINGLES",
        playerIds: [bia.id],
      })
      .expect(201);
    await settle();

    expect(send).toHaveBeenCalledTimes(1);
    const [target, body] = send.mock.calls[0]!;
    expect(target.endpoint).toBe(subscription(1).endpoint);
    const message = JSON.parse(body as string) as { title: string; body: string; url: string };
    expect(message.title).toBe("Convite para jogar");
    expect(message.body).toContain("Ana Lima reservou a Q1");
    expect(message.body).toContain("18:30");
    expect(message.url).toBe("/app");
    expect(ana.id).toBeTruthy();
  });

  it("drops a phone the push service no longer knows; unsubscribing stops it", async () => {
    const bia = await createMember(ctx.prisma, { membershipId: "4002", name: "Bia" });
    await createMember(ctx.prisma, { membershipId: "4001", name: "Ana" });
    const ana$ = await ctx.loginMember("4001");
    const bia$ = await ctx.loginMember("4002");
    await bia$.post(ctx.api("/push/subscriptions")).send(subscription(1)).expect(204);
    await bia$.post(ctx.api("/push/subscriptions")).send(subscription(2)).expect(204);
    await bia$
      .delete(ctx.api("/push/subscriptions"))
      .send({ endpoint: subscription(2).endpoint })
      .expect(204);
    send.mockRejectedValue(Object.assign(new Error("Gone"), { statusCode: 410 }));

    await ana$
      .post(ctx.api("/bookings"))
      .send({
        courtId: club.courts.Q1.id,
        timeSlotId: club.slots["18:30"]!.id,
        date: "2030-03-05",
        type: "SINGLES",
        playerIds: [bia.id],
      })
      .expect(201);
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    expect(await ctx.prisma.pushSubscription.count({ where: { userId: bia.id } })).toBe(0);
  });
});
