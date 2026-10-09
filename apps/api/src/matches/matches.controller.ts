import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { Role } from "@ficc/db";
import {
  type DisputeMatchInput,
  disputeMatchSchema,
  type MatchDetail,
  type MyMatchesResponse,
  type ReportMatchInput,
  reportMatchSchema,
  type ResolveDisputeInput,
  resolveDisputeSchema,
} from "@ficc/shared";

import { CurrentUser, type RequestUser, Roles } from "../common/auth.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MatchesService } from "./matches.service";

@Controller("matches")
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  @Post()
  @Roles(Role.MEMBER)
  report(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(reportMatchSchema)) body: ReportMatchInput,
  ): Promise<MatchDetail> {
    return this.matches.report(user.id, body);
  }

  @Get("mine")
  @Roles(Role.MEMBER)
  mine(@CurrentUser() user: RequestUser): Promise<MyMatchesResponse> {
    return this.matches.mine(user.id);
  }

  @Get(":id")
  get(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<MatchDetail> {
    return this.matches.get(user, id);
  }

  @Post(":id/approve")
  @HttpCode(200)
  @Roles(Role.MEMBER)
  approve(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<MatchDetail> {
    return this.matches.approve(user.id, id);
  }

  @Post(":id/dispute")
  @HttpCode(200)
  @Roles(Role.MEMBER)
  dispute(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(disputeMatchSchema)) body: DisputeMatchInput,
  ): Promise<MatchDetail> {
    return this.matches.dispute(user.id, id, body.comment);
  }
}

@Controller("admin/disputes")
@Roles(Role.ADMIN)
export class AdminDisputesController {
  constructor(private readonly matches: MatchesService) {}

  @Get()
  list(): Promise<MatchDetail[]> {
    return this.matches.disputes();
  }

  @Post(":id/resolve")
  @HttpCode(200)
  resolve(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(resolveDisputeSchema)) body: ResolveDisputeInput,
  ): Promise<MatchDetail> {
    return this.matches.resolve(user, id, body);
  }
}
