import { HttpException, HttpStatus } from "@nestjs/common";
import { DEFAULT_LOCALE, type MessageRef, translateRef } from "@ficc/shared";

import { tenantOrUndefined } from "../tenancy/tenant-context";

/** Text for a catalogue message in the current club's locale. */
export function localize(message: MessageRef): string {
  return translateRef(message, tenantOrUndefined()?.locale ?? DEFAULT_LOCALE);
}

/** Text that is already in the club's locale (e.g. a translated validation issue). */
export interface LocalizedText {
  text: string;
}

/**
 * Business-rule failure with a stable machine code and a message from the shared catalogue
 * (packages/shared/src/i18n), translated into the club's locale so the UI can show it as-is.
 */
export class DomainException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: MessageRef | LocalizedText,
    readonly details?: unknown,
  ) {
    const text =
      typeof message === "object" && "text" in message ? message.text : localize(message);
    super({ statusCode: status, code, message: text, details }, status);
  }
}

export const notFound = (code: string, message: MessageRef) =>
  new DomainException(HttpStatus.NOT_FOUND, code, message);
export const conflict = (code: string, message: MessageRef, details?: unknown) =>
  new DomainException(HttpStatus.CONFLICT, code, message, details);
export const unprocessable = (code: string, message: MessageRef, details?: unknown) =>
  new DomainException(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
export const forbidden = (code: string, message: MessageRef) =>
  new DomainException(HttpStatus.FORBIDDEN, code, message);
export const unauthorized = (code: string, message: MessageRef) =>
  new DomainException(HttpStatus.UNAUTHORIZED, code, message);
