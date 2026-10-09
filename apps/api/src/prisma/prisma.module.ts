import { Global, Module } from "@nestjs/common";

import { createTenantClient, PrismaBaseService, PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [
    PrismaBaseService,
    {
      provide: PrismaService,
      inject: [PrismaBaseService],
      useFactory: (base: PrismaBaseService) => createTenantClient(base),
    },
  ],
  exports: [PrismaBaseService, PrismaService],
})
export class PrismaModule {}
