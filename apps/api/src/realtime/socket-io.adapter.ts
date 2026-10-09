import type { INestApplicationContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { Server, ServerOptions } from "socket.io";

import type { Env } from "../config/env";

/** Socket.IO with CORS restricted to the web origin (cookies need credentials). */
export class SocketIoAdapter extends IoAdapter {
  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const config = this.app.get<ConfigService<Env, true>>(ConfigService);
    return super.createIOServer(port, {
      ...options,
      cors: { origin: config.get("WEB_ORIGIN", { infer: true }), credentials: true },
    }) as Server;
  }
}
