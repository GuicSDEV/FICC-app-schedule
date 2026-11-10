import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { Role } from "@ficc/db";
import {
  type AddFriendRankingMembersInput,
  addFriendRankingMembersSchema,
  type CreateFriendRankingInput,
  createFriendRankingSchema,
  type FriendRankingDetail,
  type FriendRankingQuery,
  friendRankingQuerySchema,
  type FriendRankingSummary,
  type UpdateFriendRankingInput,
  updateFriendRankingSchema,
} from "@ficc/shared";

import { CurrentUser, type RequestUser, Roles } from "../common/auth.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { FriendRankingsService } from "./friend-rankings.service";

/** Private rankings members create with their friends. */
@Controller("friend-rankings")
@Roles(Role.MEMBER)
export class FriendRankingsController {
  constructor(private readonly rankings: FriendRankingsService) {}

  @Get()
  mine(@CurrentUser() user: RequestUser): Promise<FriendRankingSummary[]> {
    return this.rankings.mine(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createFriendRankingSchema)) body: CreateFriendRankingInput,
  ): Promise<FriendRankingDetail> {
    return this.rankings.create(user.id, body);
  }

  @Get(":id")
  detail(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Query(new ZodValidationPipe(friendRankingQuerySchema)) query: FriendRankingQuery,
  ): Promise<FriendRankingDetail> {
    return this.rankings.detail(user.id, id, query.month);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateFriendRankingSchema)) body: UpdateFriendRankingInput,
  ): Promise<FriendRankingDetail> {
    return this.rankings.update(user.id, id, body);
  }

  @Post(":id/members")
  @HttpCode(200)
  addMembers(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addFriendRankingMembersSchema)) body: AddFriendRankingMembersInput,
  ): Promise<FriendRankingDetail> {
    return this.rankings.addMembers(user.id, id, body);
  }

  /** The owner takes someone out, or a member leaves (their own id). */
  @Delete(":id/members/:userId")
  @HttpCode(204)
  removeMember(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ): Promise<void> {
    return this.rankings.removeMember(user.id, id, userId);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<void> {
    return this.rankings.remove(user.id, id);
  }
}
