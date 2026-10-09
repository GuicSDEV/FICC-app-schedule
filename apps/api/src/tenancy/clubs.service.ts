import { Injectable } from "@nestjs/common";
import type { Club, ClubSettings as ClubSettingsRow } from "@ficc/db";
import {
  type CategoryItem,
  type ClubInfo,
  clubSettingsSchema,
  DEFAULT_CLUB_SETTINGS,
  DEFAULT_LOCALE,
  isLocale,
  type Sport,
} from "@ficc/shared";

import { Clock } from "../common/clock";
import { notFound } from "../common/domain.exception";
import { PrismaBaseService } from "../prisma/prisma.service";
import { PrismaService } from "../prisma/prisma.service";
import type { Tenant } from "./tenant-context";

/** Club rows change rarely; a short cache keeps tenant resolution off the hot path. */
const CACHE_TTL_MS = 30_000;

type ClubWithSettings = Club & { settings: ClubSettingsRow | null };

/**
 * Loads clubs (unscoped: the Club table is the tenant registry itself) and turns them into the
 * Tenant every request runs with.
 */
@Injectable()
export class ClubsService {
  private readonly cache = new Map<string, { tenant: Tenant; expiresAt: number }>();

  constructor(
    private readonly base: PrismaBaseService,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** The active club with this slug, as a tenant; throws CLUB_NOT_FOUND otherwise. */
  async tenantBySlug(slug: string): Promise<Tenant> {
    return this.cached(`slug:${slug}`, () =>
      this.base.club.findFirst({ where: { slug, isActive: true }, include: { settings: true } }),
    );
  }

  async tenantById(clubId: string): Promise<Tenant> {
    return this.cached(`id:${clubId}`, () =>
      this.base.club.findFirst({
        where: { id: clubId, isActive: true },
        include: { settings: true },
      }),
    );
  }

  /** Every active club (jobs run once per club). */
  async activeClubs(): Promise<{ id: string; slug: string }[]> {
    return this.base.club.findMany({
      where: { isActive: true },
      select: { id: true, slug: true },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Drops cached clubs (after settings change, and between tests). */
  invalidate(): void {
    this.cache.clear();
  }

  /** GET /club for the current tenant. */
  async info(current: Tenant): Promise<ClubInfo> {
    const [club, sports] = await Promise.all([
      this.base.club.findUniqueOrThrow({ where: { id: current.clubId } }),
      this.prisma.court.findMany({ distinct: ["sport"], select: { sport: true } }),
    ]);
    return {
      id: club.id,
      slug: club.slug,
      name: club.name,
      timezone: club.timezone,
      locale: current.locale,
      logoUrl: club.logoUrl,
      primaryColor: club.primaryColor,
      accentColor: club.accentColor,
      sports: sports.map((entry) => entry.sport as Sport),
      settings: current.settings,
    };
  }

  async categories(): Promise<CategoryItem[]> {
    const rows = await this.prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
    return rows.map((row) => ({ key: row.key, name: row.name, sortOrder: row.sortOrder }));
  }

  private async cached(key: string, load: () => Promise<ClubWithSettings | null>): Promise<Tenant> {
    const now = this.clock.now().getTime();
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > now) return hit.tenant;
    const club = await load();
    if (!club) throw notFound("CLUB_NOT_FOUND", "api.clubNotFound");
    const tenant = this.toTenant(club);
    this.cache.set(key, { tenant, expiresAt: now + CACHE_TTL_MS });
    return tenant;
  }

  private toTenant(club: ClubWithSettings): Tenant {
    // Stored values win; settings added later fall back to the defaults.
    const settings = clubSettingsSchema.parse({
      ...DEFAULT_CLUB_SETTINGS,
      ...((club.settings?.values as Record<string, unknown> | undefined) ?? {}),
    });
    return {
      clubId: club.id,
      slug: club.slug,
      name: club.name,
      timeZone: club.timezone,
      locale: isLocale(club.locale) ? club.locale : DEFAULT_LOCALE,
      settings,
    };
  }
}
