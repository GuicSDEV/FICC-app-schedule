import { z } from "zod";

import { isoDateSchema } from "../dates";
import { bookingTypeSchema, surfaceSchema } from "../enums";
import { idSchema } from "./common";

/** Other players besides the creator: 1 for singles (2 total), 3 for doubles (4 total). */
export const OTHER_PLAYERS_BY_TYPE = { SINGLES: 1, DOUBLES: 3 } as const;

export const createBookingSchema = z
  .object({
    courtId: idSchema,
    timeSlotId: idSchema,
    date: isoDateSchema,
    type: bookingTypeSchema,
    /** User ids of the other players; the creator is added automatically. */
    playerIds: z.array(idSchema).max(3),
  })
  .superRefine((value, ctx) => {
    const expected = OTHER_PLAYERS_BY_TYPE[value.type];
    if (value.playerIds.length !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["playerIds"],
        message:
          value.type === "SINGLES" ? "validation.singlesPlayers" : "validation.doublesPlayers",
      });
    }
    if (new Set(value.playerIds).size !== value.playerIds.length) {
      ctx.addIssue({ code: "custom", path: ["playerIds"], message: "validation.repeatedPlayer" });
    }
  });
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/** A court + date + slot a member taps to keep while booking it. */
export const slotHoldSchema = z.object({
  courtId: idSchema,
  timeSlotId: idSchema,
  date: isoDateSchema,
});
export type SlotHoldInput = z.infer<typeof slotHoldSchema>;

/** Maximum length of the note on a "looking for a partner" request. */
export const PARTNER_NOTE_MAX = 140;

/** A member with no partner asks others to play at a date and time (any free court). */
export const createPartnerRequestSchema = z.object({
  date: isoDateSchema,
  timeSlotId: idSchema,
  type: bookingTypeSchema,
  note: z.string().trim().max(PARTNER_NOTE_MAX).optional(),
});
export type CreatePartnerRequestInput = z.infer<typeof createPartnerRequestSchema>;

export const partnerRequestsQuerySchema = z.object({ date: isoDateSchema });
export type PartnerRequestsQuery = z.infer<typeof partnerRequestsQuerySchema>;

export const scheduleQuerySchema = z.object({
  date: isoDateSchema,
  surface: surfaceSchema.optional(),
});
export type ScheduleQuery = z.infer<typeof scheduleQuerySchema>;

export const slotFavoriteSchema = z.object({ courtId: idSchema, timeSlotId: idSchema });
export type SlotFavoriteInput = z.infer<typeof slotFavoriteSchema>;

export const memberSearchQuerySchema = z.object({
  q: z.string().trim().min(1, { message: "validation.searchRequired" }).max(60),
});
export type MemberSearchQuery = z.infer<typeof memberSearchQuerySchema>;
