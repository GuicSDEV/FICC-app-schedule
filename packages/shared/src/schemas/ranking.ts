import { z } from "zod";

import { isoDateSchema } from "../dates";

const seasonName = z.string().trim().min(2).max(60);

/** Closes the current season (if any) and starts a new one; endDate = last day, optional. */
export const startSeasonSchema = z.object({
  name: seasonName,
  endDate: isoDateSchema.nullable().optional(),
});
export type StartSeasonInput = z.infer<typeof startSeasonSchema>;

/** Renames the open season or changes its last day. */
export const updateSeasonSchema = z.object({
  name: seasonName,
  endDate: isoDateSchema.nullable(),
});
export type UpdateSeasonInput = z.infer<typeof updateSeasonSchema>;

/** A ranking class (category) the admin creates or renames. */
export const categoryInputSchema = z.object({ name: z.string().trim().min(2).max(40) });
export type CategoryInput = z.infer<typeof categoryInputSchema>;

/** The classes a member belongs to (category keys). */
export const memberCategoriesSchema = z.object({ keys: z.array(z.string().min(1)).max(20) });
export type MemberCategoriesInput = z.infer<typeof memberCategoriesSchema>;
