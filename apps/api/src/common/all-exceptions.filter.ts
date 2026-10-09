import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@ficc/db";
import type { ApiErrorBody, MessageKey } from "@ficc/shared";
import type { Response } from "express";

import { localize } from "./domain.exception";

/** Every error leaves the API as `{ statusCode, code, message, details? }`. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    if (body.statusCode >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ApiErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      if (typeof raw === "object" && raw !== null && "code" in raw) {
        return raw as ApiErrorBody;
      }
      const fallback = DEFAULT_MESSAGES[status];
      return {
        statusCode: status,
        code: HttpStatus[status] ?? "ERROR",
        message: fallback ? localize(fallback) : exception.message,
      };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002") {
        return {
          statusCode: 409,
          code: "CONFLICT",
          message: localize("api.conflict"),
        };
      }
      if (exception.code === "P2025") {
        return { statusCode: 404, code: "NOT_FOUND", message: localize("api.recordNotFound") };
      }
    }
    return {
      statusCode: 500,
      code: "INTERNAL_ERROR",
      message: localize("api.internal"),
    };
  }
}

const DEFAULT_MESSAGES: Record<number, MessageKey> = {
  400: "api.badRequest",
  401: "api.loginRequired",
  403: "api.forbidden",
  404: "api.notFound",
  429: "api.tooManyRequests",
};
