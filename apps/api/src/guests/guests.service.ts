import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, TokenExpiredError } from "@nestjs/jwt";
import {
  BookingPlayerStatus,
  BookingStatus,
  GateScanMethod,
  GateScanResult,
  type GuestDocumentType,
  GuestPassStatus,
  Prisma,
  Role,
} from "@ficc/db";
import {
  addDays,
  type AdminGuestPassItem,
  clubToday,
  type CreateGuestPassInput,
  type DocumentGuestStats,
  endOfClubDay,
  formatDocument,
  fromDbDate,
  type GatePassView,
  type GateScanLogItem,
  type GateScanResponse,
  type GuestBlockInput,
  type GuestBlockItem,
  type GuestPassItem,
  type HostGuestStats,
  maskDocument,
  toDbDate,
} from "@ficc/shared";

import type { RequestUser } from "../common/auth.decorators";
import { Clock } from "../common/clock";
import { conflict, forbidden, localize, notFound, unprocessable } from "../common/domain.exception";
import { playerSelect, toPlayerSummary } from "../common/mappers";
import type { Env } from "../config/env";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { clubSettings, clubTimeZone, tenant } from "../tenancy/tenant-context";
import { DocumentCryptoService } from "./document-crypto.service";

const TOKEN_TYPE = "guest_pass";

interface GuestTokenPayload {
  sub: string;
  typ: typeof TOKEN_TYPE;
  /** Club of the pass; a QR from another club is invalid here. */
  cid: string;
  iat: number;
  exp: number;
}

/** Columns that hold a guest's personal data, cleared by anonymization. */
const ERASED_DOCUMENT = {
  documentNumber: null,
  documentCipher: null,
  documentHash: null,
} as const;

const passInclude = {
  booking: {
    include: { court: { select: { name: true } }, timeSlot: { select: { startTime: true } } },
  },
  host: {
    select: {
      id: true,
      name: true,
      membershipId: true,
      photoUrl: true,
      guestPassesSuspendedAt: true,
    },
  },
} satisfies Prisma.GuestPassInclude;

type PassWithRelations = Prisma.GuestPassGetPayload<{ include: typeof passInclude }>;

/**
 * Guest day passes. No monthly quota: accountability comes from history (passes per member and
 * per document, blocks and suspensions). The QR holds a signed token, never personal data.
 */
@Injectable()
export class GuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly notifications: NotificationsService,
    private readonly documents: DocumentCryptoService,
  ) {}

  // ── Members ────────────────────────────────────────────────────────────────

  async create(hostId: string, input: CreateGuestPassInput): Promise<GuestPassItem> {
    const today = clubToday(this.clock.now(), clubTimeZone());
    const host = await this.prisma.user.findUniqueOrThrow({ where: { id: hostId } });
    if (host.guestPassesSuspendedAt) {
      throw forbidden("GUEST_PRIVILEGES_SUSPENDED", "api.guestPrivilegesSuspended");
    }
    if (input.visitDate < today) throw unprocessable("VISIT_IN_PAST", "api.visitInPast");
    const { guestPassMaxDaysAhead } = clubSettings();
    if (input.visitDate > addDays(today, guestPassMaxDaysAhead)) {
      throw unprocessable("VISIT_TOO_FAR", {
        key: "api.visitTooFar",
        params: { days: guestPassMaxDaysAhead },
      });
    }
    if (await this.isBlocked(input.documentType, input.documentNumber)) {
      throw unprocessable("DOCUMENT_BLOCKED", "api.documentBlocked");
    }
    if (input.bookingId) {
      const booking = await this.prisma.booking.findFirst({
        where: {
          id: input.bookingId,
          date: toDbDate(input.visitDate),
          status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
          players: { some: { userId: hostId, status: { not: BookingPlayerStatus.DECLINED } } },
        },
      });
      if (!booking) throw unprocessable("INVALID_BOOKING", "api.guestBookingInvalid");
    }

    const pass = await this.prisma.guestPass.create({
      data: {
        hostId,
        guestName: input.guestName,
        documentType: input.documentType,
        ...this.documents.seal(input.documentType, input.documentNumber),
        visitDate: toDbDate(input.visitDate),
        bookingId: input.bookingId ?? null,
      },
      include: passInclude,
    });
    return this.toItem(pass);
  }

  async mine(hostId: string): Promise<GuestPassItem[]> {
    const today = clubToday(this.clock.now(), clubTimeZone());
    const passes = await this.prisma.guestPass.findMany({
      where: { hostId, visitDate: { gte: toDbDate(addDays(today, -30)) } },
      include: passInclude,
      orderBy: [{ visitDate: "desc" }, { createdAt: "desc" }],
    });
    return passes.map((pass) => this.toItem(pass));
  }

  async cancel(hostId: string, passId: string): Promise<GuestPassItem> {
    const updated = await this.prisma.guestPass.updateMany({
      where: { id: passId, hostId, status: GuestPassStatus.ACTIVE },
      data: { status: GuestPassStatus.CANCELLED, cancelledAt: this.clock.now() },
    });
    const pass = await this.prisma.guestPass.findFirst({
      where: { id: passId, hostId },
      include: passInclude,
    });
    if (!pass) throw notFound("PASS_NOT_FOUND", "api.passNotFound");
    if (updated.count === 0) throw conflict("PASS_NOT_ACTIVE", "api.passNotActive");
    return this.toItem(pass);
  }

  // ── Gate ───────────────────────────────────────────────────────────────────

  /** Validates a scanned QR: signature, date, single use, blocklist and host privileges. */
  async scan(gate: RequestUser, token: string): Promise<GateScanResponse> {
    const now = this.clock.now();
    let passId: string | null = null;
    try {
      const payload = this.jwt.verify<GuestTokenPayload>(token, {
        secret: this.config.get("GUEST_PASS_SECRET", { infer: true }),
        clockTimestamp: Math.floor(now.getTime() / 1000),
      });
      if (payload.typ !== TOKEN_TYPE || payload.cid !== tenant().clubId) {
        return this.logScan(gate, null, GateScanMethod.QR, GateScanResult.INVALID_TOKEN);
      }
      passId = payload.sub;
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        // Signature was valid (jsonwebtoken checks it before expiry), so the id can be trusted.
        const decoded = this.jwt.decode<GuestTokenPayload | null>(token);
        return this.logScan(
          gate,
          decoded?.sub ?? null,
          GateScanMethod.QR,
          GateScanResult.WRONG_DATE,
        );
      }
      return this.logScan(gate, null, GateScanMethod.QR, GateScanResult.INVALID_TOKEN);
    }
    return this.checkIn(gate, passId, GateScanMethod.QR);
  }

  /**
   * Manual fallback: today's passes whose document contains the typed digits. Documents are
   * encrypted, so the day's passes (a few dozen at most) are decrypted and filtered here.
   */
  async searchToday(document: string): Promise<GatePassView[]> {
    const today = clubToday(this.clock.now(), clubTimeZone());
    const passes = await this.prisma.guestPass.findMany({
      where: { visitDate: toDbDate(today), anonymizedAt: null },
      include: passInclude,
      orderBy: { guestName: "asc" },
    });
    return passes
      .filter((pass) => this.documents.reveal(pass)?.includes(document))
      .slice(0, 20)
      .map((pass) => this.toGateView(pass));
  }

  /** Applies every gate rule and flips ACTIVE → USED atomically (single entry). */
  async checkIn(
    gate: RequestUser,
    passId: string,
    method: GateScanMethod,
  ): Promise<GateScanResponse> {
    const today = clubToday(this.clock.now(), clubTimeZone());
    const pass = await this.prisma.guestPass.findUnique({
      where: { id: passId },
      include: passInclude,
    });
    if (!pass) return this.logScan(gate, null, method, GateScanResult.NOT_FOUND);

    let result: GateScanResult;
    if (pass.status === GuestPassStatus.CANCELLED) result = GateScanResult.PASS_CANCELLED;
    else if (pass.status === GuestPassStatus.USED) result = GateScanResult.ALREADY_USED;
    else if (fromDbDate(pass.visitDate) !== today) result = GateScanResult.WRONG_DATE;
    else if (await this.isPassBlocked(pass)) result = GateScanResult.DOCUMENT_BLOCKED;
    else if (pass.host.guestPassesSuspendedAt) result = GateScanResult.HOST_SUSPENDED;
    else {
      const usedAt = this.clock.now();
      const claimed = await this.prisma.guestPass.updateMany({
        where: { id: pass.id, status: GuestPassStatus.ACTIVE },
        data: { status: GuestPassStatus.USED, usedAt },
      });
      result = claimed.count === 1 ? GateScanResult.ACCEPTED : GateScanResult.ALREADY_USED;
    }

    const response = await this.logScan(gate, pass.id, method, result);
    if (result === GateScanResult.ACCEPTED) {
      await this.notifications.notify(pass.hostId, "GUEST_CHECKED_IN", {
        guestPassId: pass.id,
        // A pass checked in today is never anonymized (that happens after the visit).
        guestName: pass.guestName ?? "",
        at: response.scannedAt,
      });
    }
    return response;
  }

  async recentScans(limit = 30): Promise<GateScanLogItem[]> {
    const logs = await this.prisma.gateScanLog.findMany({
      include: {
        guestPass: { select: { guestName: true, host: { select: { name: true } } } },
        scannedBy: { select: { name: true } },
      },
      orderBy: { scannedAt: "desc" },
      take: limit,
    });
    return logs.map((log) => ({
      id: log.id,
      result: log.result,
      method: log.method,
      scannedAt: log.scannedAt.toISOString(),
      guestName: log.guestPass?.guestName ?? null,
      hostName: log.guestPass?.host.name ?? null,
      scannedBy: log.scannedBy.name,
    }));
  }

  // ── Admin ──────────────────────────────────────────────────────────────────

  async hostStats(): Promise<HostGuestStats[]> {
    const hosts = await this.prisma.user.findMany({
      where: { role: Role.MEMBER, guestPasses: { some: {} } },
      select: {
        ...playerSelect(),
        guestPassesSuspendedAt: true,
        guestPassesSuspendedReason: true,
        guestPasses: { select: { status: true, visitDate: true } },
      },
    });
    return hosts
      .map((host) => {
        const visits = host.guestPasses.filter((pass) => pass.status === GuestPassStatus.USED);
        return {
          host: toPlayerSummary(host),
          passes: host.guestPasses.length,
          visits: visits.length,
          lastVisit: lastDate(visits.map((pass) => pass.visitDate)),
          suspended: host.guestPassesSuspendedAt !== null,
          suspendedReason: host.guestPassesSuspendedReason,
        };
      })
      .sort((a, b) => b.passes - a.passes || a.host.name.localeCompare(b.host.name));
  }

  /** Visits per guest document (grouped by its keyed hash; anonymized passes are left out). */
  async documentStats(): Promise<DocumentGuestStats[]> {
    const [passes, blocks] = await Promise.all([
      this.prisma.guestPass.findMany({
        where: { anonymizedAt: null },
        include: { host: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.guestBlock.findMany({ where: { liftedAt: null } }),
    ]);
    const blocked = new Set(blocks.map((block) => this.lookupKey(block)));
    const groups = new Map<string, typeof passes>();
    for (const pass of passes) {
      const key = this.lookupKey(pass);
      if (key) groups.set(key, [...(groups.get(key) ?? []), pass]);
    }
    return [...groups.entries()]
      .map(([key, group]) => {
        const latest = group[0]!;
        const visits = group.filter((pass) => pass.status === GuestPassStatus.USED);
        return {
          documentType: latest.documentType,
          documentMasked: maskDocument(latest.documentType, this.documents.reveal(latest) ?? ""),
          guestName: latest.guestName ?? "",
          passes: group.length,
          visits: visits.length,
          hosts: [...new Set(group.map((pass) => pass.host.name))].sort(),
          lastVisit: lastDate(visits.map((pass) => pass.visitDate)),
          blocked: blocked.has(key),
          samplePassId: latest.id,
        };
      })
      .sort((a, b) => b.visits - a.visits || b.passes - a.passes);
  }

  async adminPasses(filter: {
    hostId?: string;
    documentOf?: string;
  }): Promise<AdminGuestPassItem[]> {
    let documentFilter: Prisma.GuestPassWhereInput = {};
    if (filter.documentOf) {
      const sample = await this.prisma.guestPass.findUnique({ where: { id: filter.documentOf } });
      const number = sample ? this.documents.reveal(sample) : null;
      if (!sample || !number) throw notFound("PASS_NOT_FOUND", "api.passNotFound");
      const documentHash = this.documents.hash(sample.documentType, number);
      // Legacy rows (not yet encrypted) still match on the plaintext column.
      documentFilter = {
        documentType: sample.documentType,
        OR: [{ documentHash }, { documentNumber: number }],
      };
    }
    const passes = await this.prisma.guestPass.findMany({
      where: { ...(filter.hostId ? { hostId: filter.hostId } : {}), ...documentFilter },
      include: passInclude,
      orderBy: [{ visitDate: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    return passes.map((pass) => {
      const { token: _token, ...item } = this.toItem(pass);
      return {
        ...item,
        host: { id: pass.host.id, name: pass.host.name, membershipId: pass.host.membershipId },
      };
    });
  }

  async blocks(): Promise<GuestBlockItem[]> {
    const blocks = await this.prisma.guestBlock.findMany({
      where: { liftedAt: null },
      include: { blockedBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return blocks.map((block) => this.toBlockItem(block));
  }

  async block(admin: RequestUser, input: GuestBlockInput): Promise<GuestBlockItem> {
    if (await this.isBlocked(input.documentType, input.documentNumber)) {
      throw conflict("ALREADY_BLOCKED", "api.alreadyBlocked");
    }
    const block = await this.prisma.guestBlock.create({
      data: {
        documentType: input.documentType,
        ...this.documents.seal(input.documentType, input.documentNumber),
        reason: input.reason ?? null,
        blockedById: admin.id,
      },
      include: { blockedBy: { select: { name: true } } },
    });
    return this.toBlockItem(block);
  }

  /** Blocks the document of an existing pass, without the admin ever seeing the number. */
  async blockFromPass(
    admin: RequestUser,
    passId: string,
    reason?: string,
  ): Promise<GuestBlockItem> {
    const pass = await this.prisma.guestPass.findUnique({ where: { id: passId } });
    const documentNumber = pass ? this.documents.reveal(pass) : null;
    if (!pass || !documentNumber) throw notFound("PASS_NOT_FOUND", "api.passNotFound");
    return this.block(admin, { documentType: pass.documentType, documentNumber, reason });
  }

  async liftBlock(admin: RequestUser, blockId: string): Promise<void> {
    const result = await this.prisma.guestBlock.updateMany({
      where: { id: blockId, liftedAt: null },
      data: { liftedAt: this.clock.now(), liftedById: admin.id },
    });
    if (result.count === 0) throw notFound("BLOCK_NOT_FOUND", "api.blockNotFound");
  }

  async setSuspension(memberId: string, reason: string | null): Promise<void> {
    const member = await this.prisma.user.findUnique({ where: { id: memberId } });
    if (!member || member.role !== Role.MEMBER)
      throw notFound("MEMBER_NOT_FOUND", "api.memberNotFound");
    await this.prisma.user.update({
      where: { id: memberId },
      data: reason
        ? { guestPassesSuspendedAt: this.clock.now(), guestPassesSuspendedReason: reason }
        : { guestPassesSuspendedAt: null, guestPassesSuspendedReason: null },
    });
  }

  // ── LGPD jobs ──────────────────────────────────────────────────────────────

  /**
   * Erases guest names and documents once the club's retention period after the visit has
   * passed (and lifted blocks after the same period). Idempotent: already anonymized rows are
   * skipped.
   */
  async anonymizeExpired(): Promise<{ passes: number; blocks: number }> {
    const now = this.clock.now();
    const days = clubSettings().guestDataRetentionDays;
    const cutoff = addDays(clubToday(now, clubTimeZone()), -days);
    const passes = await this.prisma.guestPass.updateMany({
      where: { anonymizedAt: null, visitDate: { lt: toDbDate(cutoff) } },
      data: { ...ERASED_DOCUMENT, guestName: null, anonymizedAt: now },
    });
    const blocks = await this.prisma.guestBlock.updateMany({
      where: { anonymizedAt: null, liftedAt: { lt: new Date(now.getTime() - days * 86_400_000) } },
      data: { ...ERASED_DOCUMENT, anonymizedAt: now },
    });
    return { passes: passes.count, blocks: blocks.count };
  }

  /** Moves plaintext documents left from before encryption into ciphertext + hash. Idempotent. */
  async encryptLegacyDocuments(): Promise<number> {
    let moved = 0;
    const passes = await this.prisma.guestPass.findMany({
      where: { documentNumber: { not: null } },
      select: { id: true, documentType: true, documentNumber: true },
    });
    for (const pass of passes) {
      await this.prisma.guestPass.update({
        where: { id: pass.id },
        data: this.documents.seal(pass.documentType, pass.documentNumber!),
      });
      moved += 1;
    }
    const blocks = await this.prisma.guestBlock.findMany({
      where: { documentNumber: { not: null } },
      select: { id: true, documentType: true, documentNumber: true },
    });
    for (const block of blocks) {
      await this.prisma.guestBlock.update({
        where: { id: block.id },
        data: this.documents.seal(block.documentType, block.documentNumber!),
      });
      moved += 1;
    }
    return moved;
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /** Grouping/lookup key of a stored document (its keyed hash), or null once anonymized. */
  private lookupKey(row: {
    documentType: GuestDocumentType;
    documentHash: string | null;
    documentNumber: string | null;
  }): string | null {
    if (row.documentHash) return row.documentHash;
    return row.documentNumber ? this.documents.hash(row.documentType, row.documentNumber) : null;
  }

  private async isBlocked(
    documentType: GuestDocumentType,
    documentNumber: string,
  ): Promise<boolean> {
    const documentHash = this.documents.hash(documentType, documentNumber);
    const count = await this.prisma.guestBlock.count({
      where: { documentType, liftedAt: null, OR: [{ documentHash }, { documentNumber }] },
    });
    return count > 0;
  }

  private async isPassBlocked(pass: PassWithRelations): Promise<boolean> {
    const number = this.documents.reveal(pass);
    return number !== null && this.isBlocked(pass.documentType, number);
  }

  private signToken(pass: { id: string; visitDate: Date }): string {
    const now = Math.floor(this.clock.now().getTime() / 1000);
    const exp = Math.floor(
      endOfClubDay(fromDbDate(pass.visitDate), clubTimeZone()).getTime() / 1000,
    );
    return this.jwt.sign(
      {
        sub: pass.id,
        typ: TOKEN_TYPE,
        cid: tenant().clubId,
        iat: now,
        exp,
      } satisfies GuestTokenPayload,
      {
        secret: this.config.get("GUEST_PASS_SECRET", { infer: true }),
      },
    );
  }

  private toItem(pass: PassWithRelations): GuestPassItem {
    const usable =
      pass.status === GuestPassStatus.ACTIVE &&
      fromDbDate(pass.visitDate) >= clubToday(this.clock.now(), clubTimeZone());
    const document = this.documents.reveal(pass);
    return {
      id: pass.id,
      guestName: pass.guestName,
      documentType: pass.documentType,
      documentMasked: document ? maskDocument(pass.documentType, document) : null,
      anonymized: pass.anonymizedAt !== null,
      visitDate: fromDbDate(pass.visitDate),
      status: pass.status,
      usedAt: pass.usedAt?.toISOString() ?? null,
      booking: pass.booking
        ? {
            id: pass.booking.id,
            courtName: pass.booking.court.name,
            startTime: pass.booking.timeSlot.startTime,
          }
        : null,
      token: usable ? this.signToken(pass) : null,
      createdAt: pass.createdAt.toISOString(),
    };
  }

  private toGateView(pass: PassWithRelations): GatePassView {
    // The gate only sees passes for today, which are never anonymized.
    return {
      id: pass.id,
      guestName: pass.guestName ?? "",
      documentType: pass.documentType,
      document: formatDocument(pass.documentType, this.documents.reveal(pass) ?? ""),
      visitDate: fromDbDate(pass.visitDate),
      status: pass.status,
      usedAt: pass.usedAt?.toISOString() ?? null,
      host: {
        id: pass.host.id,
        name: pass.host.name,
        membershipId: pass.host.membershipId,
        photoUrl: pass.host.photoUrl,
      },
    };
  }

  private toBlockItem(
    block: Prisma.GuestBlockGetPayload<{ include: { blockedBy: { select: { name: true } } } }>,
  ): GuestBlockItem {
    return {
      id: block.id,
      documentType: block.documentType,
      documentMasked: maskDocument(block.documentType, this.documents.reveal(block) ?? ""),
      reason: block.reason,
      blockedBy: block.blockedBy.name,
      createdAt: block.createdAt.toISOString(),
    };
  }

  private async logScan(
    gate: RequestUser,
    passId: string | null,
    method: GateScanMethod,
    result: GateScanResult,
  ): Promise<GateScanResponse> {
    const existing = passId
      ? await this.prisma.guestPass.findUnique({ where: { id: passId }, include: passInclude })
      : null;
    const log = await this.prisma.gateScanLog.create({
      data: {
        guestPassId: existing?.id ?? null,
        scannedById: gate.id,
        method,
        result,
        scannedAt: this.clock.now(),
      },
    });
    return {
      result,
      accepted: result === GateScanResult.ACCEPTED,
      message: localize(`labels.gateScanResult.${result}`),
      scannedAt: log.scannedAt.toISOString(),
      pass: existing ? this.toGateView(existing) : null,
    };
  }
}

function lastDate(dates: Date[]): string | null {
  if (dates.length === 0) return null;
  return fromDbDate(new Date(Math.max(...dates.map((date) => date.getTime()))));
}
