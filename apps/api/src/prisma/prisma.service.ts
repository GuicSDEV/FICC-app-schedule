import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@ficc/db";

import { Env } from "../config/env";

/**
 * Prisma connects lazily on the first query, so the API still boots (and the
 * health endpoint reports it) when the database is down.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super({ datasourceUrl: config.get("DATABASE_URL", { infer: true }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
