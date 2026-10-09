import { Role, type User } from "@ficc/db";

import { GuestsService } from "../src/guests/guests.service";
import { createTestApp, type TestContext } from "./support/app";
import { createMember, createStaff, resetDatabase, seedClub } from "./support/fixtures";

// Fake clock: Monday 2030-03-04 09:00 club time.
const TODAY = "2030-03-04";
const CPF = "529.982.247-25";

describe("Guest passes and the gate", () => {
  let ctx: TestContext;
  let ana: User;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  beforeEach(async () => {
    ctx.clock.reset();
    await resetDatabase(ctx);
    await seedClub(ctx);
    ana = await createMember(ctx.prisma, { name: "Ana Lima" });
    await createStaff(ctx.prisma, Role.GATE, "portaria@ficc.test", "Portaria");
    await createStaff(ctx.prisma, Role.ADMIN, "admin@ficc.test", "Diretoria");
  });

  const createPass = async (overrides: Record<string, unknown> = {}) => {
    const member = await ctx.loginMember(ana.membershipId!);
    const response = await member
      .post("/api/v1/guest-passes")
      .send({
        guestName: "Paulo Souza",
        documentType: "CPF",
        documentNumber: CPF,
        visitDate: TODAY,
        ...overrides,
      })
      .expect(201);
    return response.body as { id: string; token: string; documentMasked: string };
  };

  it("creates passes without a monthly limit and masks the document", async () => {
    for (let index = 0; index < 6; index += 1) await createPass();
    const member = await ctx.loginMember(ana.membershipId!);
    const { body } = await member.get("/api/v1/guest-passes").expect(200);
    expect(body).toHaveLength(6);
    expect(body[0]).toMatchObject({ documentMasked: "***.982.247-**", status: "ACTIVE" });
    expect(body[0].token).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain("52998224725");
  });

  it("accepts a valid QR once and rejects it when reused", async () => {
    const pass = await createPass();
    const gate = await ctx.loginStaff("portaria@ficc.test");

    const first = await gate.post("/api/v1/gate/scan").send({ token: pass.token }).expect(200);
    expect(first.body).toMatchObject({
      result: "ACCEPTED",
      accepted: true,
      pass: { guestName: "Paulo Souza", document: "529.982.247-25", host: { name: "Ana Lima" } },
    });
    expect(
      await ctx.prisma.notification.findFirst({
        where: { userId: ana.id, type: "GUEST_CHECKED_IN" },
      }),
    ).not.toBeNull();

    const reused = await gate.post("/api/v1/gate/scan").send({ token: pass.token }).expect(200);
    expect(reused.body).toMatchObject({
      result: "ALREADY_USED",
      accepted: false,
      message: "Passe já utilizado",
    });
    expect(await ctx.prisma.gateScanLog.count({ where: { guestPassId: pass.id } })).toBe(2);
  });

  it("rejects a pass whose document is blocked", async () => {
    const pass = await createPass();
    const admin = await ctx.loginStaff("admin@ficc.test");
    await admin
      .post(`/api/v1/admin/guests/blocks/from-pass/${pass.id}`)
      .send({ reason: "Briga na quadra" })
      .expect(201);

    const gate = await ctx.loginStaff("portaria@ficc.test");
    const scan = await gate.post("/api/v1/gate/scan").send({ token: pass.token }).expect(200);
    expect(scan.body).toMatchObject({ result: "DOCUMENT_BLOCKED", accepted: false });

    // New passes for that document are refused up front.
    const member = await ctx.loginMember(ana.membershipId!);
    const refused = await member
      .post("/api/v1/guest-passes")
      .send({
        guestName: "Paulo Souza",
        documentType: "CPF",
        documentNumber: CPF,
        visitDate: TODAY,
      })
      .expect(422);
    expect(refused.body.code).toBe("DOCUMENT_BLOCKED");

    const blocks = await admin.get("/api/v1/admin/guests/blocks").expect(200);
    expect(blocks.body).toEqual([
      expect.objectContaining({ documentMasked: "***.982.247-**", reason: "Briga na quadra" }),
    ]);
    await admin.delete(`/api/v1/admin/guests/blocks/${blocks.body[0].id}`).expect(204);
    expect((await gate.post("/api/v1/gate/scan").send({ token: pass.token })).body.result).toBe(
      "ACCEPTED",
    );
  });

  it("rejects an expired pass (after its visit date) and one for another day", async () => {
    const expired = await createPass();
    const future = await createPass({ visitDate: "2030-03-05" });
    const gate = await ctx.loginStaff("portaria@ficc.test");

    const early = await gate.post("/api/v1/gate/scan").send({ token: future.token }).expect(200);
    expect(early.body).toMatchObject({
      result: "WRONG_DATE",
      accepted: false,
      pass: { guestName: "Paulo Souza" },
    });

    ctx.clock.set("2030-03-05T12:00:00Z"); // next day
    const late = await gate.post("/api/v1/gate/scan").send({ token: expired.token }).expect(200);
    expect(late.body).toMatchObject({ result: "WRONG_DATE", accepted: false });
    expect((await gate.post("/api/v1/gate/scan").send({ token: future.token })).body.result).toBe(
      "ACCEPTED",
    );
  });

  it("rejects forged tokens, cancelled passes and suspended hosts", async () => {
    const gate = await ctx.loginStaff("portaria@ficc.test");
    const pass = await createPass();
    const [header, payload] = pass.token.split(".");
    const forged = await gate
      .post("/api/v1/gate/scan")
      .send({ token: `${header}.${payload}.assinatura-falsa` })
      .expect(200);
    expect(forged.body).toMatchObject({ result: "INVALID_TOKEN", pass: null });

    const member = await ctx.loginMember(ana.membershipId!);
    const cancelled = await createPass();
    await member.post(`/api/v1/guest-passes/${cancelled.id}/cancel`).expect(200);
    expect(
      (await gate.post("/api/v1/gate/scan").send({ token: cancelled.token })).body.result,
    ).toBe("PASS_CANCELLED");

    const admin = await ctx.loginStaff("admin@ficc.test");
    await admin
      .post(`/api/v1/admin/guests/suspensions/${ana.id}`)
      .send({ reason: "Convidados sem acompanhamento" })
      .expect(204);
    expect((await gate.post("/api/v1/gate/scan").send({ token: pass.token })).body.result).toBe(
      "HOST_SUSPENDED",
    );
    const suspended = await member
      .post("/api/v1/guest-passes")
      .send({
        guestName: "Outra Pessoa",
        documentType: "RG",
        documentNumber: "12.345.678-9",
        visitDate: TODAY,
      })
      .expect(403);
    expect(suspended.body.code).toBe("GUEST_PRIVILEGES_SUSPENDED");
  });

  it("supports manual search and check-in at the gate, and lists the scan history", async () => {
    await createPass();
    const gate = await ctx.loginStaff("portaria@ficc.test");
    const found = await gate.get("/api/v1/gate/passes?document=529.982").expect(200);
    expect(found.body).toEqual([
      expect.objectContaining({ document: "529.982.247-25", status: "ACTIVE" }),
    ]);

    const checked = await gate.post(`/api/v1/gate/passes/${found.body[0].id}/check-in`).expect(200);
    expect(checked.body.result).toBe("ACCEPTED");
    const scans = await gate.get("/api/v1/gate/scans").expect(200);
    expect(scans.body[0]).toMatchObject({
      result: "ACCEPTED",
      method: "MANUAL",
      guestName: "Paulo Souza",
      hostName: "Ana Lima",
    });

    // Members cannot use the gate.
    const member = await ctx.loginMember(ana.membershipId!);
    await member.get("/api/v1/gate/passes?document=529").expect(403);
  });

  it("gives admins guest history per member and per document, masked", async () => {
    const pass = await createPass();
    await createPass({ visitDate: "2030-03-10" });
    const gate = await ctx.loginStaff("portaria@ficc.test");
    await gate.post("/api/v1/gate/scan").send({ token: pass.token }).expect(200);

    const admin = await ctx.loginStaff("admin@ficc.test");
    const hosts = await admin.get("/api/v1/admin/guests/hosts").expect(200);
    expect(hosts.body).toEqual([
      expect.objectContaining({
        host: expect.objectContaining({ name: "Ana Lima" }),
        passes: 2,
        visits: 1,
        lastVisit: TODAY,
      }),
    ]);
    const documents = await admin.get("/api/v1/admin/guests/documents").expect(200);
    expect(documents.body).toEqual([
      expect.objectContaining({
        documentMasked: "***.982.247-**",
        passes: 2,
        visits: 1,
        hosts: ["Ana Lima"],
        blocked: false,
      }),
    ]);
    const passes = await admin.get(`/api/v1/admin/guests/passes?documentOf=${pass.id}`).expect(200);
    expect(passes.body).toHaveLength(2);
    expect(JSON.stringify([hosts.body, documents.body, passes.body])).not.toContain("52998224725");
  });

  it("imports valid matrículas from CSV", async () => {
    const admin = await ctx.loginStaff("admin@ficc.test");
    const result = await admin
      .post("/api/v1/admin/memberships/import")
      .send({
        csv: `matricula;nome\n300.100;Nova Sócia\n${ana.membershipId};Ana Lima\nxx;Inválido`,
      })
      .expect(201);
    expect(result.body).toEqual({
      created: 1,
      updated: 1,
      errors: [{ line: 4, message: 'Matrícula inválida: "xx"' }],
    });
    await ctx
      .http()
      .post("/api/v1/auth/register")
      .send({ membershipId: "300100", name: "Nova Sócia", password: "senha-forte-1" })
      .expect(201);
  });

  describe("LGPD", () => {
    it("stores guest documents encrypted, never as plaintext", async () => {
      const pass = await createPass();
      const row = await ctx.base.guestPass.findUniqueOrThrow({ where: { id: pass.id } });
      expect(row.documentNumber).toBeNull();
      expect(row.documentCipher).toMatch(/^v1:/);
      expect(row.documentCipher).not.toContain("52998224725");
      expect(row.documentHash).toMatch(/^[0-9a-f]{64}$/);

      // The gate still finds it by digits and shows it in full; blocks match the same document.
      const gate = await ctx.loginStaff("portaria@ficc.test");
      const search = await gate.get("/api/v1/gate/passes?document=982247").expect(200);
      expect(search.body).toMatchObject([{ id: pass.id, document: CPF }]);
      const admin = await ctx.loginStaff("admin@ficc.test");
      await admin.post(`/api/v1/admin/guests/blocks/from-pass/${pass.id}`).send({}).expect(201);
      const block = await ctx.base.guestBlock.findFirstOrThrow();
      expect(block.documentNumber).toBeNull();
      expect(block.documentHash).toBe(row.documentHash);
      const scan = await gate.post("/api/v1/gate/scan").send({ token: pass.token }).expect(200);
      expect(scan.body.result).toBe("DOCUMENT_BLOCKED");
    });

    it("anonymizes guest data after the club's retention period", async () => {
      const pass = await createPass();
      const guests = ctx.app.get(GuestsService);
      // 90 days after the visit the data is kept; one day later it is erased.
      ctx.clock.advance(90 * 86_400_000);
      expect(await ctx.inClub(() => guests.anonymizeExpired())).toEqual({ passes: 0, blocks: 0 });
      ctx.clock.advance(86_400_000);
      expect(await ctx.inClub(() => guests.anonymizeExpired())).toEqual({ passes: 1, blocks: 0 });
      expect(await ctx.inClub(() => guests.anonymizeExpired())).toEqual({ passes: 0, blocks: 0 });

      const row = await ctx.base.guestPass.findUniqueOrThrow({ where: { id: pass.id } });
      expect(row).toMatchObject({
        guestName: null,
        documentNumber: null,
        documentCipher: null,
        documentHash: null,
      });
      expect(row.anonymizedAt).not.toBeNull();

      const admin = await ctx.loginStaff("admin@ficc.test");
      const passes = await admin.get(`/api/v1/admin/guests/passes?hostId=${ana.id}`).expect(200);
      expect(passes.body).toMatchObject([
        { id: pass.id, guestName: null, documentMasked: null, anonymized: true },
      ]);
      expect((await admin.get("/api/v1/admin/guests/documents").expect(200)).body).toEqual([]);
    });

    it("uses the retention period from the club's settings", async () => {
      const pass = await createPass();
      await ctx.base.clubSettings.update({
        where: { clubId: ctx.currentClubId() },
        data: { values: { guestDataRetentionDays: 10 } },
      });
      ctx.invalidateClubs();
      ctx.clock.advance(11 * 86_400_000);
      const guests = ctx.app.get(GuestsService);
      expect(await ctx.inClub(() => guests.anonymizeExpired())).toEqual({ passes: 1, blocks: 0 });
      expect(
        (await ctx.base.guestPass.findUniqueOrThrow({ where: { id: pass.id } })).guestName,
      ).toBeNull();
    });

    it("encrypts documents stored before encryption existed", async () => {
      const legacy = await ctx.prisma.guestPass.create({
        data: {
          hostId: ana.id,
          guestName: "Legado da Silva",
          documentType: "CPF",
          documentNumber: "52998224725",
          visitDate: new Date(`${TODAY}T00:00:00.000Z`),
        },
      });
      const gate = await ctx.loginStaff("portaria@ficc.test");
      // Readable before the job runs…
      expect((await gate.get("/api/v1/gate/passes?document=982247").expect(200)).body).toHaveLength(
        1,
      );
      const guests = ctx.app.get(GuestsService);
      expect(await ctx.inClub(() => guests.encryptLegacyDocuments())).toBe(1);
      expect(await ctx.inClub(() => guests.encryptLegacyDocuments())).toBe(0);
      const row = await ctx.base.guestPass.findUniqueOrThrow({ where: { id: legacy.id } });
      expect(row.documentNumber).toBeNull();
      expect(row.documentCipher).toMatch(/^v1:/);
      // …and after.
      expect(
        (await gate.get("/api/v1/gate/passes?document=982247").expect(200)).body,
      ).toMatchObject([{ id: legacy.id, document: CPF }]);
    });
  });
});
