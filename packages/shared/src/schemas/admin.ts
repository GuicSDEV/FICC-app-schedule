import { z } from "zod";

import { isValidMembershipId, normalizeMembershipId } from "../membership";
import { passwordSchema, personNameSchema } from "./auth";
import { emailSchema, idSchema } from "./common";

const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, { message: "validation.invalidColor" })
  .transform((value) => value.toUpperCase());

export const createCoachSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(40),
  color: hexColorSchema,
  photoUrl: z.url({ message: "validation.invalidUrl" }).optional(),
  courtIds: z.array(idSchema).min(1, { message: "validation.pickCourt" }),
});
export type CreateCoachInput = z.infer<typeof createCoachSchema>;

export const updateCoachSchema = z
  .object({
    name: personNameSchema.optional(),
    displayName: z.string().trim().min(2).max(40).optional(),
    color: hexColorSchema.optional(),
    photoUrl: z.url({ message: "validation.invalidUrl" }).nullable().optional(),
    courtIds: z.array(idSchema).min(1, { message: "validation.pickCourt" }).optional(),
    isActive: z.boolean().optional(),
    password: passwordSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "validation.nothingToChange",
  });
export type UpdateCoachInput = z.infer<typeof updateCoachSchema>;

export const importMembershipsSchema = z.object({
  csv: z.string().min(1, { message: "validation.emptyFile" }).max(1_000_000),
});
export type ImportMembershipsInput = z.infer<typeof importMembershipsSchema>;

export interface ParsedMembershipRow {
  membershipId: string;
  holderName?: string;
}

export interface MembershipCsvResult {
  rows: ParsedMembershipRow[];
  /** Lines with an invalid matrícula; `value` is what the file had there. */
  errors: { line: number; value: string }[];
}

/**
 * Parses "matricula,nome" lines (comma or semicolon; header row optional; name optional).
 * Duplicate IDs keep the last name.
 */
export function parseMembershipCsv(csv: string): MembershipCsvResult {
  const rows = new Map<string, ParsedMembershipRow>();
  const errors: MembershipCsvResult["errors"] = [];

  csv.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const [rawId = "", ...rest] = line.split(/[;,]/);
    const membershipId = normalizeMembershipId(rawId);
    if (index === 0 && !/\d/.test(rawId)) return; // header
    if (!isValidMembershipId(membershipId, true)) {
      errors.push({ line: index + 1, value: rawId.trim() });
      return;
    }
    const holderName = rest.join(" ").trim().replace(/^"|"$/g, "") || undefined;
    rows.set(membershipId, { membershipId, ...(holderName ? { holderName } : {}) });
  });

  return { rows: [...rows.values()], errors };
}
