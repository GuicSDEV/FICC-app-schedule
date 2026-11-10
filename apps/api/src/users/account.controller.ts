import { Body, Controller, Delete, HttpCode, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type DeleteAccountInput, deleteAccountSchema } from "@ficc/shared";
import type { Response } from "express";

import { clearAuthCookies } from "../auth/cookies";
import { CurrentUser, type RequestUser } from "../common/auth.decorators";
import { RateLimit } from "../common/rate-limit.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { Env } from "../config/env";
import { AccountService } from "./account.service";

/** The signed-in person's own account. */
@Controller("account")
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Deletes the member's account (password confirmed) and signs them out. */
  @Delete()
  @HttpCode(204)
  @RateLimit({ name: "account-delete", limit: 5, windowMs: 15 * 60_000 })
  async delete(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(deleteAccountSchema)) body: DeleteAccountInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.account.delete(user.id, body.password);
    clearAuthCookies(response, {
      COOKIE_DOMAIN: this.config.get("COOKIE_DOMAIN", { infer: true }),
      COOKIE_SECURE: this.config.get("COOKIE_SECURE", { infer: true }),
      ACCESS_TOKEN_TTL_MINUTES: this.config.get("ACCESS_TOKEN_TTL_MINUTES", { infer: true }),
      REFRESH_TOKEN_TTL_DAYS: this.config.get("REFRESH_TOKEN_TTL_DAYS", { infer: true }),
    });
  }
}
