import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { AdminGuestsController, GateController, GuestPassesController } from "./guests.controller";
import { GuestsService } from "./guests.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [GuestPassesController, GateController, AdminGuestsController],
  providers: [GuestsService],
})
export class GuestsModule {}
