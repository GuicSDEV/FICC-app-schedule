import { Role } from "@ficc/db";
import { DEFAULT_CLUB_SETTINGS } from "@ficc/shared";

import { createTestApp, type TestContext } from "./support/app";
import {
  createMember,
  createStaff,
  resetDatabase,
  seedClub,
  TEST_PASSWORD,
} from "./support/fixtures";

const cookieNames = (response: { headers: Record<string, unknown> }) =>
  ((response.headers["set-cookie"] as string[] | undefined) ?? []).map(
    (cookie) => cookie.split("=")[0],
  );

describe("Auth", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  beforeEach(async () => {
    await resetDatabase(ctx);
    await seedClub(ctx);
  });

  describe("member registration", () => {
    it("registers a listed matrícula, sets the auth cookies and logs the member in", async () => {
      // Clubs that do not require approval let new members in right away.
      await ctx.prisma.clubSettings.update({
        where: { clubId: ctx.currentClubId() },
        data: { values: { ...DEFAULT_CLUB_SETTINGS, signupRequiresApproval: false } },
      });
      ctx.invalidateClubs();
      await ctx.prisma.validMembershipId.create({
        data: { membershipId: "777123", holderName: "Ana Lima" },
      });
      const agent = ctx.http();

      const response = await agent
        .post("/api/v1/auth/register")
        .send({ membershipId: "777.123", name: "Ana Lima", password: TEST_PASSWORD })
        .expect(201);

      expect(response.body).toMatchObject({
        role: "MEMBER",
        membershipId: "777123",
        name: "Ana Lima",
        elo: 1200,
      });
      expect(cookieNames(response)).toEqual(
        expect.arrayContaining(["ficc_at", "ficc_rt", "ficc_role"]),
      );
      await agent.get("/api/v1/auth/me").expect(200);
    });

    it("rejects a matrícula that is not on the club's list", async () => {
      const response = await ctx
        .http()
        .post("/api/v1/auth/register")
        .send({ membershipId: "999999", name: "Fulano Silva", password: TEST_PASSWORD })
        .expect(404);
      expect(response.body.code).toBe("MEMBERSHIP_NOT_FOUND");
    });

    it("rejects a matrícula that already has an account", async () => {
      await createMember(ctx.prisma, { membershipId: "777124" });
      const response = await ctx
        .http()
        .post("/api/v1/auth/register")
        .send({ membershipId: "777124", name: "Outra Pessoa", password: TEST_PASSWORD })
        .expect(409);
      expect(response.body.code).toBe("MEMBERSHIP_TAKEN");
    });

    it("validates the body with the shared schema", async () => {
      const response = await ctx
        .http()
        .post("/api/v1/auth/register")
        .send({ membershipId: "12", name: "A", password: "x" })
        .expect(400);
      expect(response.body.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("login", () => {
    it("logs a member in by matrícula and rejects a wrong password", async () => {
      await createMember(ctx.prisma, { membershipId: "777200", name: "Rafael Almeida" });
      await ctx
        .http()
        .post("/api/v1/auth/login")
        .send({ kind: "member", membershipId: "777200", password: TEST_PASSWORD })
        .expect(200);
      const wrong = await ctx
        .http()
        .post("/api/v1/auth/login")
        .send({ kind: "member", membershipId: "777200", password: "errada" })
        .expect(401);
      expect(wrong.body).toMatchObject({
        code: "INVALID_CREDENTIALS",
        message: "Matrícula ou senha incorretos.",
      });
    });

    it.each([Role.ADMIN, Role.GATE, Role.COACH])("logs %s staff in by email", async (role) => {
      await createStaff(ctx.prisma, role, `${role.toLowerCase()}@ficc.test`);
      const agent = await ctx.loginStaff(`${role.toLowerCase()}@ficc.test`);
      const me = await agent.get("/api/v1/auth/me").expect(200);
      expect(me.body.role).toBe(role);
    });

    it("refuses deactivated accounts", async () => {
      const member = await createMember(ctx.prisma, { membershipId: "777201" });
      await ctx.prisma.user.update({ where: { id: member.id }, data: { isActive: false } });
      await ctx
        .http()
        .post("/api/v1/auth/login")
        .send({ kind: "member", membershipId: "777201", password: TEST_PASSWORD })
        .expect(401);
    });
  });

  describe("guards", () => {
    it("requires authentication", async () => {
      const response = await ctx.http().get("/api/v1/bookings/mine").expect(401);
      expect(response.body.code).toBe("UNAUTHENTICATED");
    });

    it("enforces roles", async () => {
      await createStaff(ctx.prisma, Role.GATE, "portaria@ficc.test");
      const gate = await ctx.loginStaff("portaria@ficc.test");
      const response = await gate.get("/api/v1/bookings/mine").expect(403);
      expect(response.body.code).toBe("FORBIDDEN");
    });

    it("accepts a bearer token as well as the cookie", async () => {
      await createMember(ctx.prisma, { membershipId: "777202" });
      const response = await ctx
        .http()
        .post("/api/v1/auth/login")
        .send({ kind: "member", membershipId: "777202", password: TEST_PASSWORD });
      const token = (response.headers["set-cookie"] as unknown as string[])
        .find((cookie) => cookie.startsWith("ficc_at="))!
        .split(";")[0]!
        .slice("ficc_at=".length);
      await ctx.http().get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`).expect(200);
    });
  });

  describe("refresh tokens", () => {
    const refreshCookie = (response: { headers: Record<string, unknown> }) =>
      ((response.headers["set-cookie"] as string[] | undefined) ?? [])
        .find((cookie) => cookie.startsWith("ficc_rt="))!
        .split(";")[0]!;

    it("rotates the refresh token and revokes the whole family when an old one is reused", async () => {
      await createMember(ctx.prisma, { membershipId: "777300" });
      const login = await ctx
        .http()
        .post("/api/v1/auth/login")
        .send({ kind: "member", membershipId: "777300", password: TEST_PASSWORD })
        .expect(200);
      const first = refreshCookie(login);

      const rotated = await ctx
        .http()
        .post("/api/v1/auth/refresh")
        .set("Cookie", first)
        .expect(200);
      const second = refreshCookie(rotated);
      expect(second).not.toBe(first);

      const replay = await ctx.http().post("/api/v1/auth/refresh").set("Cookie", first).expect(401);
      expect(replay.body.code).toBe("REFRESH_REUSED");
      // The legitimate newer token is revoked too.
      await ctx.http().post("/api/v1/auth/refresh").set("Cookie", second).expect(401);
      expect(await ctx.prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    });

    it("logs out by revoking the refresh family and clearing cookies", async () => {
      await createMember(ctx.prisma, { membershipId: "777301" });
      const agent = await ctx.loginMember("777301");
      await agent.post("/api/v1/auth/logout").expect(204);
      expect(await ctx.prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
      await agent.post("/api/v1/auth/refresh").expect(401);
    });
  });
});
