import type { INestApplicationContext } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import type { Server, ServerOptions } from "socket.io";

import type { Env } from "../config/env";

/**
 * Socket.IO with CORS restricted to the web origin (cookies need credentials) and the Redis
 * adapter, so events emitted by any API instance reach sockets connected to every other one.
 */
export class SocketIoAdapter extends IoAdapter {
  private readonly log = new Logger(SocketIoAdapter.name);
  private redisClients: Redis[] = [];

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const config = this.app.get<ConfigService<Env, true>>(ConfigService);
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: config.get("WEB_ORIGIN", { infer: true }), credentials: true },
    }) as Server;

    const url = config.get("REDIS_URL", { infer: true });
    const pub = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
    const sub = pub.duplicate();
    for (const client of [pub, sub]) {
      client.on("error", (error: Error) => this.log.warn(`Redis: ${error.message}`));
    }
    this.redisClients = [pub, sub];
    server.adapter(createAdapter(pub, sub));
    return server;
  }

  override async close(server: Parameters<IoAdapter["close"]>[0]): Promise<void> {
    await super.close(server);
    await Promise.all(this.redisClients.map((client) => client.quit().catch(() => undefined)));
  }
}
