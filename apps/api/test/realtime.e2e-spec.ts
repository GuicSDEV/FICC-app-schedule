import type { AddressInfo } from "node:net";

import { SOCKET_EVENTS } from "@ficc/shared";
import { io, type Socket } from "socket.io-client";

import { createTestApp, type TestContext } from "./support/app";
import {
  type Club,
  createMember,
  resetDatabase,
  seedClub,
  TEST_PASSWORD,
} from "./support/fixtures";

describe("Realtime gateway", () => {
  let ctx: TestContext;
  let club: Club;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    ctx = await createTestApp({ listen: true });
    const { port } = ctx.app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
  });
  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await ctx.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx);
    club = await seedClub(ctx);
  });

  async function connectAs(membershipId: string): Promise<Socket> {
    const login = await ctx
      .http()
      .post("/api/v1/auth/login")
      .send({ kind: "member", membershipId, password: TEST_PASSWORD })
      .expect(200);
    const cookie = (login.headers["set-cookie"] as unknown as string[])
      .map((entry) => entry.split(";")[0])
      .join("; ");
    const socket = io(url, {
      transports: ["websocket"],
      extraHeaders: { cookie },
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("connect_error", reject);
    });
    return socket;
  }

  const nextEvent = <T>(socket: Socket, event: string) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), 5000);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  it("broadcasts schedule.updated and delivers notification.created to the invitee", async () => {
    const ana = await createMember(ctx.prisma, { name: "Ana Lima" });
    const bruno = await createMember(ctx.prisma, { name: "Bruno Reis" });
    const watcher = await connectAs(ana.membershipId!);
    const invitee = await connectAs(bruno.membershipId!);

    const scheduleEvent = nextEvent<{ kind: string; dates: string[]; cells: unknown[] }>(
      watcher,
      SOCKET_EVENTS.scheduleUpdated,
    );
    const notification = nextEvent<{ type: string; payload: { invitedBy: string } }>(
      invitee,
      SOCKET_EVENTS.notificationCreated,
    );

    const agent = await ctx.loginMember(ana.membershipId!);
    await agent
      .post("/api/v1/bookings")
      .send({
        courtId: club.courts.Q4.id,
        timeSlotId: club.slots["21:00"]!.id,
        date: "2030-03-06",
        type: "SINGLES",
        playerIds: [bruno.id],
      })
      .expect(201);

    expect(await scheduleEvent).toMatchObject({
      kind: "booking.created",
      dates: ["2030-03-06"],
      cells: [
        { courtId: club.courts.Q4.id, timeSlotId: club.slots["21:00"]!.id, date: "2030-03-06" },
      ],
    });
    expect(await notification).toMatchObject({
      type: "BOOKING_INVITE",
      payload: { invitedBy: "Ana Lima" },
    });
  });

  it("disconnects sockets without a valid session", async () => {
    const socket = io(url, { transports: ["websocket"], reconnection: false });
    sockets.push(socket);
    const reason = await new Promise<string>((resolve) => socket.on("disconnect", resolve));
    expect(reason).toBe("io server disconnect");
  });
});
