import { z } from "zod";

import { freezeReasonSchema, surfaceSchema } from "../enums";
import { idSchema, isoDateTimeSchema, optionalText } from "./common";

/** One court, every court of a surface, or the whole club. */
export const freezeTargetSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("COURT"), courtId: idSchema }),
  z.object({ scope: z.literal("SURFACE"), surface: surfaceSchema }),
  z.object({ scope: z.literal("ALL") }),
]);
export type FreezeTarget = z.infer<typeof freezeTargetSchema>;

export const createFreezeSchema = z
  .object({
    target: freezeTargetSchema,
    reason: freezeReasonSchema,
    startsAt: isoDateTimeSchema,
    /** Open-ended (until lifted) when omitted. */
    endsAt: isoDateTimeSchema.optional(),
    note: optionalText(300),
  })
  .refine((value) => !value.endsAt || Date.parse(value.endsAt) > Date.parse(value.startsAt), {
    message: "O fim precisa ser depois do início",
    path: ["endsAt"],
  });
export type CreateFreezeInput = z.infer<typeof createFreezeSchema>;

/** Bulk-cancel bookings and lessons hit by a freeze. */
export const cancelAffectedSchema = z
  .object({
    bookingIds: z.array(idSchema).default([]),
    lessonIds: z.array(idSchema).default([]),
  })
  .refine((value) => value.bookingIds.length + value.lessonIds.length > 0, {
    message: "Selecione ao menos uma reserva ou aula",
  });
export type CancelAffectedInput = z.infer<typeof cancelAffectedSchema>;
export type CancelAffectedRequest = z.input<typeof cancelAffectedSchema>;
