import { Module } from "@nestjs/common";

import { MembersController } from "./users.controller";

@Module({ controllers: [MembersController] })
export class UsersModule {}
