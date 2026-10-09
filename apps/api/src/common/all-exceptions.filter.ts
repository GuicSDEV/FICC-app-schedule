import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@ficc/db";
import type { ApiErrorBody } from "@ficc/shared";
import type { Response } from "express";

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
      return {
        statusCode: status,
        code: HttpStatus[status] ?? "ERROR",
        message: DEFAULT_MESSAGES[status] ?? exception.message,
      };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002") {
        return {
          statusCode: 409,
          code: "CONFLICT",
          message: "Esse registro já existe ou o horário foi ocupado.",
        };
      }
      if (exception.code === "P2025") {
        return { statusCode: 404, code: "NOT_FOUND", message: "Registro não encontrado." };
      }
    }
    return {
      statusCode: 500,
      code: "INTERNAL_ERROR",
      message: "Algo deu errado. Tente novamente.",
    };
  }
}

const DEFAULT_MESSAGES: Record<number, string> = {
  400: "Requisição inválida.",
  401: "Faça login para continuar.",
  403: "Você não tem permissão para isso.",
  404: "Não encontrado.",
  429: "Muitas tentativas. Aguarde um pouco.",
};
