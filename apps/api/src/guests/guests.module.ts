import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { AdminGuestsController, GateController, GuestPassesController } from "./guests.controller";
import { DocumentCryptoService } from "./document-crypto.service";
import { GuestsService } from "./guests.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [GuestPassesController, GateController, AdminGuestsController],
  providers: [GuestsService, DocumentCryptoService],
  exports: [GuestsService],
})
export class GuestsModule {}
