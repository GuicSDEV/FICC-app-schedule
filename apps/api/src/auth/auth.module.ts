import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";

import { AuthController } from "./auth.controller";
import { RateLimitGuard } from "../common/rate-limit.guard";
import { JwtAuthGuard, RolesGuard } from "./auth.guards";
import { AuthService } from "./auth.service";
import { TokensService } from "./tokens.service";

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokensService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [TokensService, AuthService],
})
export class AuthModule {}
