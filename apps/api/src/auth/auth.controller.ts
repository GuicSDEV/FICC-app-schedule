import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  type AuthUser,
  type LoginInput,
  loginSchema,
  type RegisterInput,
  registerSchema,
} from "@ficc/shared";
import type { Request, Response } from "express";

import { CurrentUser, Public, type RequestUser } from "../common/auth.decorators";
import { unauthorized } from "../common/domain.exception";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { Env } from "../config/env";
import { AuthService, type Session } from "./auth.service";
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from "./cookies";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post("register")
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUser> {
    return this.respond(response, await this.auth.register(body, request.headers["user-agent"]));
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUser> {
    return this.respond(response, await this.auth.login(body, request.headers["user-agent"]));
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUser> {
    const token = (request.cookies as Record<string, string>)[REFRESH_COOKIE];
    if (!token) throw unauthorized("REFRESH_MISSING", "Sua sessão expirou. Entre novamente.");
    try {
      return this.respond(response, await this.auth.refresh(token, request.headers["user-agent"]));
    } catch (error) {
      clearAuthCookies(response, this.cookieEnv());
      throw error;
    }
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout((request.cookies as Record<string, string>)[REFRESH_COOKIE]);
    clearAuthCookies(response, this.cookieEnv());
  }

  @Get("me")
  me(@CurrentUser() user: RequestUser): Promise<AuthUser> {
    return this.auth.me(user.id);
  }

  private respond(response: Response, session: Session): AuthUser {
    setAuthCookies(response, this.cookieEnv(), { ...session, role: session.user.role });
    return session.user;
  }

  private cookieEnv() {
    return {
      COOKIE_DOMAIN: this.config.get("COOKIE_DOMAIN", { infer: true }),
      COOKIE_SECURE: this.config.get("COOKIE_SECURE", { infer: true }),
      ACCESS_TOKEN_TTL_MINUTES: this.config.get("ACCESS_TOKEN_TTL_MINUTES", { infer: true }),
      REFRESH_TOKEN_TTL_DAYS: this.config.get("REFRESH_TOKEN_TTL_DAYS", { infer: true }),
    };
  }
}
