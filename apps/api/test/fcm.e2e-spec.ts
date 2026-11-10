import { generateKeyPairSync } from "node:crypto";

import { createTestApp, type TestContext } from "./support/app";
import { type Club, createMember, resetDatabase, seedClub } from "./support/fixtures";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const SERVICE_ACCOUNT = Buffer.from(
  JSON.stringify({
    project_id: "ficc-tenis",
    client_email: "push@ficc-tenis.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  }),
).toString("base64");

const TOKEN_A = "fcm-token-device-a-0123456789abcdef";
const TOKEN_B = "fcm-token-device-b-0123456789abcdef";

describe("Native app push (Firebase)", () => {
  let ctx: TestContext;
  let club: Club;
  const realFetch = global.fetch;
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

  beforeAll(async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = SERVICE_ACCOUNT;
    ctx = await createTestApp();
  });

  afterAll(async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    global.fetch = realFetch;
    await ctx.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx);
    ctx.clock.set("2030-03-04T12:00:00.000Z");
    club = await seedClub(ctx);
    fetchMock.mockReset();
    // Only Google's endpoints are faked; supertest talks to the app without fetch.
    global.fetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://oauth2.googleapis.com") || url.startsWith("https://fcm.")) {
        return fetchMock(input, init);
      }
      return realFetch(input, init);
    }) as typeof fetch;
  });

  /** Lets the fire-and-forget send finish. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

  it("sends the invitation to the invited player's phones and drops an uninstalled app", async () => {
    await createMember(ctx.prisma, { membershipId: "4001", name: "Ana Lima" });
    const bia = await createMember(ctx.prisma, { membershipId: "4002", name: "Bia" });
    const ana$ = await ctx.loginMember("4001");
    const bia$ = await ctx.loginMember("4002");
    await bia$.post(ctx.api("/push/devices")).send({ token: TOKEN_A, platform: "IOS" }).expect(204);
    await bia$
      .post(ctx.api("/push/devices"))
      .send({ token: TOKEN_B, platform: "ANDROID" })
      .expect(204);

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith("https://oauth2.googleapis.com")) {
        return Response.json({ access_token: "google-access", expires_in: 3600 });
      }
      const body = JSON.parse(String(init?.body)) as { message: { token: string } };
      return body.message.token === TOKEN_A
        ? Response.json({ name: "projects/ficc-tenis/messages/1" })
        : new Response(
            JSON.stringify({ error: { status: "NOT_FOUND", details: ["UNREGISTERED"] } }),
            {
              status: 404,
            },
          );
    });

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

    const sends = fetchMock.mock.calls.filter(([url]) => String(url).startsWith("https://fcm."));
    expect(sends).toHaveLength(2);
    expect(String(sends[0]![0])).toBe(
      "https://fcm.googleapis.com/v1/projects/ficc-tenis/messages:send",
    );
    expect(sends[0]![1]?.headers).toMatchObject({ authorization: "Bearer google-access" });
    const message = (
      JSON.parse(String(sends[0]![1]?.body)) as {
        message: { notification: { title: string; body: string }; data: { url: string } };
      }
    ).message;
    expect(message.notification.title).toBe("Convite para jogar");
    expect(message.notification.body).toContain("Ana Lima reservou a Q1");
    expect(message.data.url).toBe("/app");
    // The app that Firebase no longer knows is forgotten; the other stays.
    const left = await ctx.prisma.deviceToken.findMany({ where: { userId: bia.id } });
    expect(left.map((device) => device.token)).toEqual([TOKEN_A]);

    // Logging out on the phone removes it.
    await bia$.delete(ctx.api("/push/devices")).send({ token: TOKEN_A }).expect(204);
    expect(await ctx.prisma.deviceToken.count()).toBe(0);
  });
});
