import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Business-rule failure with a stable machine code and a pt-BR message the UI can show as-is.
 */
export class DomainException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super({ statusCode: status, code, message, details }, status);
  }
}

export const notFound = (code: string, message: string) =>
  new DomainException(HttpStatus.NOT_FOUND, code, message);
export const conflict = (code: string, message: string, details?: unknown) =>
  new DomainException(HttpStatus.CONFLICT, code, message, details);
export const unprocessable = (code: string, message: string, details?: unknown) =>
  new DomainException(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
export const forbidden = (code: string, message: string) =>
  new DomainException(HttpStatus.FORBIDDEN, code, message);
export const unauthorized = (code: string, message: string) =>
  new DomainException(HttpStatus.UNAUTHORIZED, code, message);
