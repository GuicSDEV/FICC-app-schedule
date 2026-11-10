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

export const FRIEND_RANKING_SCOPES = ["AMONG_MEMBERS", "ALL_MATCHES"] as const;
export type FriendRankingScope = (typeof FRIEND_RANKING_SCOPES)[number];
export const FRIEND_RANKING_PERIODS = ["MONTHLY", "SINCE_START"] as const;
export type FriendRankingPeriod = (typeof FRIEND_RANKING_PERIODS)[number];
/** Most members a private ranking takes (the owner included). */
export const FRIEND_RANKING_MAX_MEMBERS = 30;

/** A private ranking among friends. */
export const createFriendRankingSchema = z.object({
  name: z.string().trim().min(2).max(40),
  scope: z.enum(FRIEND_RANKING_SCOPES),
  period: z.enum(FRIEND_RANKING_PERIODS),
  /** Friends added with it (the owner is in it already). */
  memberIds: z.array(z.string().min(1)).max(FRIEND_RANKING_MAX_MEMBERS - 1),
});
export type CreateFriendRankingInput = z.infer<typeof createFriendRankingSchema>;

export const updateFriendRankingSchema = z.object({
  name: z.string().trim().min(2).max(40),
  scope: z.enum(FRIEND_RANKING_SCOPES),
  period: z.enum(FRIEND_RANKING_PERIODS),
});
export type UpdateFriendRankingInput = z.infer<typeof updateFriendRankingSchema>;

export const addFriendRankingMembersSchema = z.object({
  userIds: z
    .array(z.string().min(1))
    .min(1)
    .max(FRIEND_RANKING_MAX_MEMBERS - 1),
});
export type AddFriendRankingMembersInput = z.infer<typeof addFriendRankingMembersSchema>;

/** Which month to show for a monthly ranking ("YYYY-MM"; this month when absent). */
export const friendRankingQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});
export type FriendRankingQuery = z.infer<typeof friendRankingQuerySchema>;
