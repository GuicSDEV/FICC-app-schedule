import { HttpStatus, PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

import { DomainException } from "./domain.exception";

/** Validates and transforms a body or query with a shared Zod schema. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      "VALIDATION_FAILED",
      issues[0]?.message ?? "Dados inválidos",
      issues,
    );
  }
}
