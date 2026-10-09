import { z } from "zod";

import { isoDateSchema } from "../dates";
import { isValidDocument, normalizeDocument } from "../documents";
import { guestDocumentTypeSchema } from "../enums";
import { idSchema, optionalText } from "./common";

const documentFields = {
  documentType: guestDocumentTypeSchema,
  documentNumber: z.string().trim().min(1, { message: "validation.documentRequired" }).max(20),
};

function normalizeAndValidate<T extends { documentType: "CPF" | "RG"; documentNumber: string }>(
  value: T,
  ctx: z.RefinementCtx,
): T {
  const documentNumber = normalizeDocument(value.documentType, value.documentNumber);
  if (!isValidDocument(value.documentType, documentNumber)) {
    ctx.addIssue({
      code: "custom",
      path: ["documentNumber"],
      message: value.documentType === "CPF" ? "validation.invalidCpf" : "validation.invalidRg",
    });
  }
  return { ...value, documentNumber };
}

/** Day pass for one guest on one date (no monthly limit). */
export const createGuestPassSchema = z
  .object({
    guestName: z
      .string()
      .trim()
      .min(3, { message: "validation.fullNameRequired" })
      .max(100)
      .refine((name) => name.split(/\s+/).length >= 2, { message: "validation.firstAndLastName" }),
    ...documentFields,
    visitDate: isoDateSchema,
    /** One of the host's bookings on the visit date. */
    bookingId: idSchema.optional(),
  })
  .transform(normalizeAndValidate);
export type CreateGuestPassInput = z.infer<typeof createGuestPassSchema>;
export type CreateGuestPassRequest = z.input<typeof createGuestPassSchema>;

export const gateScanSchema = z.object({ token: z.string().trim().min(10).max(2048) });
export type GateScanInput = z.infer<typeof gateScanSchema>;

/** Manual fallback at the gate: search today's passes by document (any format). */
export const gateSearchQuerySchema = z.object({
  document: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase().replace(/[^0-9A-Z]/g, ""))
    .refine((value) => value.length >= 3, { message: "validation.searchMin3" }),
});
export type GateSearchQuery = z.infer<typeof gateSearchQuerySchema>;

export const guestBlockSchema = z
  .object({ ...documentFields, reason: optionalText(300) })
  .transform(normalizeAndValidate);
export type GuestBlockInput = z.infer<typeof guestBlockSchema>;

export const guestSuspensionSchema = z.object({
  reason: z.string().trim().min(3, { message: "validation.reasonRequired" }).max(300),
});
export type GuestSuspensionInput = z.infer<typeof guestSuspensionSchema>;

export const adminGuestPassesQuerySchema = z.object({
  hostId: idSchema.optional(),
  /** Pass id whose document to filter by (documents are never sent in clear to admins). */
  documentOf: idSchema.optional(),
});
export type AdminGuestPassesQuery = z.infer<typeof adminGuestPassesQuerySchema>;

export const adminMembersQuerySchema = z.object({ q: z.string().trim().max(60).optional() });
export type AdminMembersQuery = z.infer<typeof adminMembersQuerySchema>;
