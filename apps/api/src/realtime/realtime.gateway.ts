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
import { ClubResolver } from "../tenancy/club-resolver";
import { ClubsService } from "../tenancy/clubs.service";
import { clubRoom, RealtimeService, roleRoom, userRoom } from "./realtime.service";

/**
 * Authenticated Socket.IO endpoint. Clients send the access cookie (or `auth.token`); the token
 * must belong to the club this connection resolves to. Sockets join their club room (schedule,
 * leaderboard and freeze events) and their personal room (notifications).
 */
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tokens: TokensService,
    private readonly realtime: RealtimeService,
    private readonly resolver: ClubResolver,
    private readonly clubs: ClubsService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.attach(server);
  }

  async handleConnection(client: Socket): Promise<void> {
    const cookies = parseCookies(client.handshake.headers.cookie ?? "");
    const authToken = (client.handshake.auth as { token?: unknown } | undefined)?.token;
    const token = cookies[ACCESS_COOKIE] ?? (typeof authToken === "string" ? authToken : undefined);
    const payload = token ? this.tokens.verifyAccess(token) : null;
    const club = payload
      ? await this.clubs
          .tenantBySlug(
            this.resolver.resolveSlug({
              host: client.handshake.headers.host,
              headers: client.handshake.headers,
            }),
          )
          .catch(() => null)
      : null;
    if (!payload || !club || payload.cid !== club.clubId) {
      client.emit("auth.error", { code: "UNAUTHENTICATED" });
      client.disconnect(true);
      return;
    }
    await client.join([
      clubRoom(club.clubId),
      userRoom(payload.sub),
      roleRoom(club.clubId, payload.role),
    ]);
    this.logger.debug(`socket ${client.id} joined ${club.slug} as ${payload.sub}`);
  }
}
