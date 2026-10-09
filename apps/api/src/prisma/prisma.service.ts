import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient, tenantExtension } from "@ficc/db";

import { Env } from "../config/env";
import { tenantOrUndefined } from "../tenancy/tenant-context";

/**
 * The raw client. Only the tenancy layer (the Club registry) and health checks use it; every
 * service works with {@link PrismaService}, which is scoped to the current club.
 * Prisma connects lazily on the first query, so the API still boots (and the health endpoint
 * reports it) when the database is down.
 */
@Injectable()
export class PrismaBaseService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super({ datasourceUrl: config.get("DATABASE_URL", { infer: true }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/** Builds the club-scoped client: every query on a club-owned model gets the current clubId. */
export function createTenantClient(base: PrismaClient) {
  return base.$extends(tenantExtension(() => tenantOrUndefined()?.clubId));
}

export type TenantPrismaClient = ReturnType<typeof createTenantClient>;

/**
 * Injection token and type for the club-scoped client (see createTenantClient). Declared as an
 * abstract class merged with the client's type so services inject it like any provider.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class PrismaService {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface PrismaService extends TenantPrismaClient {}
