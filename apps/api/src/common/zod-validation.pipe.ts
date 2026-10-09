import { HttpStatus, PipeTransform } from "@nestjs/common";
import { DEFAULT_LOCALE, translateIssue } from "@ficc/shared";
import type { ZodError, ZodType } from "zod";

import { tenantOrUndefined } from "../tenancy/tenant-context";
import { DomainException } from "./domain.exception";

/** 400 VALIDATION_FAILED with every issue translated into the club's locale. */
export function validationException(error: ZodError): DomainException {
  const locale = tenantOrUndefined()?.locale ?? DEFAULT_LOCALE;
  const issues = error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: translateIssue(issue, locale),
  }));
  const first = issues[0]?.message;
  return new DomainException(
    HttpStatus.BAD_REQUEST,
    "VALIDATION_FAILED",
    first ? { text: first } : "api.invalidData",
    issues,
  );
}

/** Validates and transforms a body or query with a shared Zod schema. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    throw validationException(result.error);
  }
}
