import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";

import type { Env } from "./config/env";
import { SocketIoAdapter } from "./realtime/socket-io.adapter";

/** Shared by main.ts and the e2e tests so both run the same HTTP pipeline. */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.enableCors({ origin: config.get("WEB_ORIGIN", { infer: true }), credentials: true });
  app.useWebSocketAdapter(new SocketIoAdapter(app));
}
