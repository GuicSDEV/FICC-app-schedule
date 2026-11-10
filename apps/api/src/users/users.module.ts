import { Module } from "@nestjs/common";

import { BookingsModule } from "../bookings/bookings.module";
import { AccountController } from "./account.controller";
import { AccountService } from "./account.service";
import { MembersController } from "./users.controller";

@Module({
  imports: [BookingsModule],
  controllers: [MembersController, AccountController],
  providers: [AccountService],
})
export class UsersModule {}
