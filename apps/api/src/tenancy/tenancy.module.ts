import { Global, MiddlewareConsumer, Module, NestModule } from "@nestjs/common";

import { ClubController } from "./club.controller";
import { ClubResolver } from "./club-resolver";
import { ClubsService } from "./clubs.service";
import { TenantMiddleware } from "./tenant.middleware";

@Global()
@Module({
  controllers: [ClubController],
  providers: [ClubResolver, ClubsService, TenantMiddleware],
  exports: [ClubResolver, ClubsService],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Health must answer without a club (and with the database down).
    consumer.apply(TenantMiddleware).exclude("health").forRoutes("*path");
  }
}
