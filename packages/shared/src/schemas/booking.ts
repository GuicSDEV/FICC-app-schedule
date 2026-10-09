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
          value.type === "SINGLES"
            ? "Simples: escolha exatamente 1 adversário"
            : "Duplas: escolha exatamente 3 jogadores",
      });
    }
    if (new Set(value.playerIds).size !== value.playerIds.length) {
      ctx.addIssue({ code: "custom", path: ["playerIds"], message: "Jogador repetido" });
    }
  });
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const scheduleQuerySchema = z.object({
  date: isoDateSchema,
  surface: surfaceSchema.optional(),
});
export type ScheduleQuery = z.infer<typeof scheduleQuerySchema>;

export const slotFavoriteSchema = z.object({ courtId: idSchema, timeSlotId: idSchema });
export type SlotFavoriteInput = z.infer<typeof slotFavoriteSchema>;

export const memberSearchQuerySchema = z.object({
  q: z.string().trim().min(1, { message: "Digite um nome ou matrícula" }).max(60),
});
export type MemberSearchQuery = z.infer<typeof memberSearchQuerySchema>;
