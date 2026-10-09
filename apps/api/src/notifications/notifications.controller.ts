import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import type { NotificationsResponse } from "@ficc/shared";

import { CurrentUser, type RequestUser } from "../common/auth.decorators";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser): Promise<NotificationsResponse> {
    return this.notifications.list(user.id);
  }

  @Post("read-all")
  @HttpCode(204)
  readAll(@CurrentUser() user: RequestUser): Promise<void> {
    return this.notifications.markAllRead(user.id);
  }

  @Post(":id/read")
  @HttpCode(204)
  read(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<void> {
    return this.notifications.markRead(user.id, id);
  }
}
