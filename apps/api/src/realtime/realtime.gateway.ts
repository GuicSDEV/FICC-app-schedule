import { Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { parse as parseCookies } from "cookie";
import type { Server, Socket } from "socket.io";

import { ACCESS_COOKIE } from "../auth/cookies";
import { TokensService } from "../auth/tokens.service";
import { RealtimeService } from "./realtime.service";

export const userRoom = (userId: string) => `user:${userId}`;
export const roleRoom = (role: string) => `role:${role}`;

/**
 * Authenticated Socket.IO endpoint. Clients send the access cookie (or `auth.token`) and join
 * their personal room for notifications; schedule, leaderboard and freeze events go to everyone.
 */
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tokens: TokensService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.attach(server);
  }

  handleConnection(client: Socket): void {
    const cookies = parseCookies(client.handshake.headers.cookie ?? "");
    const authToken = (client.handshake.auth as { token?: unknown } | undefined)?.token;
    const token = cookies[ACCESS_COOKIE] ?? (typeof authToken === "string" ? authToken : undefined);
    const payload = token ? this.tokens.verifyAccess(token) : null;
    if (!payload) {
      client.emit("auth.error", { code: "UNAUTHENTICATED" });
      client.disconnect(true);
      return;
    }
    void client.join([userRoom(payload.sub), roleRoom(payload.role)]);
    this.logger.debug(`socket ${client.id} joined as ${payload.sub}`);
  }
}
