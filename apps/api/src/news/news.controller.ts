import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { Role } from "@ficc/db";
import {
  type NewsPostInput,
  type NewsPostItem,
  newsPostSchema,
  type UpdateNewsPostInput,
  updateNewsPostSchema,
} from "@ficc/shared";

import {
  CurrentUser,
  type RequestUser,
  RequirePermissions,
  Roles,
  SkipAudit,
} from "../common/auth.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { NewsService } from "./news.service";

@Controller("news")
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser): Promise<NewsPostItem[]> {
    return this.news.list(user);
  }

  @Post()
  @Roles(Role.ADMIN)
  @RequirePermissions("NEWS_MANAGE")
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(newsPostSchema)) body: NewsPostInput,
  ): Promise<NewsPostItem> {
    return this.news.create(user, body);
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  @RequirePermissions("NEWS_MANAGE")
  update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateNewsPostSchema)) body: UpdateNewsPostInput,
  ): Promise<NewsPostItem> {
    return this.news.update(user, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @Roles(Role.ADMIN)
  @RequirePermissions("NEWS_MANAGE")
  remove(@Param("id") id: string): Promise<void> {
    return this.news.remove(id);
  }

  @Post(":id/react")
  @SkipAudit()
  @HttpCode(200)
  react(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<NewsPostItem> {
    return this.news.react(user, id);
  }

  @Post(":id/read")
  @SkipAudit()
  @HttpCode(204)
  read(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<void> {
    return this.news.markRead(user, id);
  }
}
