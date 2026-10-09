import { Role, type User } from "@ficc/db";

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
    await resetDatabase(ctx.prisma);
    await seedClub(ctx.prisma);
    ana = await createMember(ctx.prisma, { name: "Ana Lima" });
    await createStaff(ctx.prisma, Role.GATE, "portaria@ficc.test", "Portaria");
    await createStaff(ctx.prisma, Role.ADMIN, "admin@ficc.test", "Diretoria");
  });

  const createPass = async (overrides: Record<string, unknown> = {}) => {
    const member = await ctx.loginMember(ana.membershipId!);
    const response = await member
      .post("/api/guest-passes")
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
    const { body } = await member.get("/api/guest-passes").expect(200);
    expect(body).toHaveLength(6);
    expect(body[0]).toMatchObject({ documentMasked: "***.982.247-**", status: "ACTIVE" });
    expect(body[0].token).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain("52998224725");
  });

  it("accepts a valid QR once and rejects it when reused", async () => {
    const pass = await createPass();
    const gate = await ctx.loginStaff("portaria@ficc.test");

    const first = await gate.post("/api/gate/scan").send({ token: pass.token }).expect(200);
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

    const reused = await gate.post("/api/gate/scan").send({ token: pass.token }).expect(200);
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
      .post(`/api/admin/guests/blocks/from-pass/${pass.id}`)
      .send({ reason: "Briga na quadra" })
      .expect(201);

    const gate = await ctx.loginStaff("portaria@ficc.test");
    const scan = await gate.post("/api/gate/scan").send({ token: pass.token }).expect(200);
    expect(scan.body).toMatchObject({ result: "DOCUMENT_BLOCKED", accepted: false });

    // New passes for that document are refused up front.
    const member = await ctx.loginMember(ana.membershipId!);
    const refused = await member
      .post("/api/guest-passes")
      .send({
        guestName: "Paulo Souza",
        documentType: "CPF",
        documentNumber: CPF,
        visitDate: TODAY,
      })
      .expect(422);
    expect(refused.body.code).toBe("DOCUMENT_BLOCKED");

    const blocks = await admin.get("/api/admin/guests/blocks").expect(200);
    expect(blocks.body).toEqual([
      expect.objectContaining({ documentMasked: "***.982.247-**", reason: "Briga na quadra" }),
    ]);
    await admin.delete(`/api/admin/guests/blocks/${blocks.body[0].id}`).expect(204);
    expect((await gate.post("/api/gate/scan").send({ token: pass.token })).body.result).toBe(
      "ACCEPTED",
    );
  });

  it("rejects an expired pass (after its visit date) and one for another day", async () => {
    const expired = await createPass();
    const future = await createPass({ visitDate: "2030-03-05" });
    const gate = await ctx.loginStaff("portaria@ficc.test");

    const early = await gate.post("/api/gate/scan").send({ token: future.token }).expect(200);
    expect(early.body).toMatchObject({
      result: "WRONG_DATE",
      accepted: false,
      pass: { guestName: "Paulo Souza" },
    });

    ctx.clock.set("2030-03-05T12:00:00Z"); // next day
    const late = await gate.post("/api/gate/scan").send({ token: expired.token }).expect(200);
    expect(late.body).toMatchObject({ result: "WRONG_DATE", accepted: false });
    expect((await gate.post("/api/gate/scan").send({ token: future.token })).body.result).toBe(
      "ACCEPTED",
    );
  });

  it("rejects forged tokens, cancelled passes and suspended hosts", async () => {
    const gate = await ctx.loginStaff("portaria@ficc.test");
    const pass = await createPass();
    const [header, payload] = pass.token.split(".");
    const forged = await gate
      .post("/api/gate/scan")
      .send({ token: `${header}.${payload}.assinatura-falsa` })
      .expect(200);
    expect(forged.body).toMatchObject({ result: "INVALID_TOKEN", pass: null });

    const member = await ctx.loginMember(ana.membershipId!);
    const cancelled = await createPass();
    await member.post(`/api/guest-passes/${cancelled.id}/cancel`).expect(200);
    expect((await gate.post("/api/gate/scan").send({ token: cancelled.token })).body.result).toBe(
      "PASS_CANCELLED",
    );

    const admin = await ctx.loginStaff("admin@ficc.test");
    await admin
      .post(`/api/admin/guests/suspensions/${ana.id}`)
      .send({ reason: "Convidados sem acompanhamento" })
      .expect(204);
    expect((await gate.post("/api/gate/scan").send({ token: pass.token })).body.result).toBe(
      "HOST_SUSPENDED",
    );
    const suspended = await member
      .post("/api/guest-passes")
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
    const found = await gate.get("/api/gate/passes?document=529.982").expect(200);
    expect(found.body).toEqual([
      expect.objectContaining({ document: "529.982.247-25", status: "ACTIVE" }),
    ]);

    const checked = await gate.post(`/api/gate/passes/${found.body[0].id}/check-in`).expect(200);
    expect(checked.body.result).toBe("ACCEPTED");
    const scans = await gate.get("/api/gate/scans").expect(200);
    expect(scans.body[0]).toMatchObject({
      result: "ACCEPTED",
      method: "MANUAL",
      guestName: "Paulo Souza",
      hostName: "Ana Lima",
    });

    // Members cannot use the gate.
    const member = await ctx.loginMember(ana.membershipId!);
    await member.get("/api/gate/passes?document=529").expect(403);
  });

  it("gives admins guest history per member and per document, masked", async () => {
    const pass = await createPass();
    await createPass({ visitDate: "2030-03-10" });
    const gate = await ctx.loginStaff("portaria@ficc.test");
    await gate.post("/api/gate/scan").send({ token: pass.token }).expect(200);

    const admin = await ctx.loginStaff("admin@ficc.test");
    const hosts = await admin.get("/api/admin/guests/hosts").expect(200);
    expect(hosts.body).toEqual([
      expect.objectContaining({
        host: expect.objectContaining({ name: "Ana Lima" }),
        passes: 2,
        visits: 1,
        lastVisit: TODAY,
      }),
    ]);
    const documents = await admin.get("/api/admin/guests/documents").expect(200);
    expect(documents.body).toEqual([
      expect.objectContaining({
        documentMasked: "***.982.247-**",
        passes: 2,
        visits: 1,
        hosts: ["Ana Lima"],
        blocked: false,
      }),
    ]);
    const passes = await admin.get(`/api/admin/guests/passes?documentOf=${pass.id}`).expect(200);
    expect(passes.body).toHaveLength(2);
    expect(JSON.stringify([hosts.body, documents.body, passes.body])).not.toContain("52998224725");
  });

  it("imports valid matrículas from CSV", async () => {
    const admin = await ctx.loginStaff("admin@ficc.test");
    const result = await admin
      .post("/api/admin/memberships/import")
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
      .post("/api/auth/register")
      .send({ membershipId: "300100", name: "Nova Sócia", password: "senha-forte-1" })
      .expect(201);
  });
});
