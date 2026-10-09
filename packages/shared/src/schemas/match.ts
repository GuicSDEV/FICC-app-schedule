import { z } from "zod";

import { isoDateSchema } from "../dates";
import { categoryKeySchema, matchFormatSchema, sportSchema, surfaceSchema } from "../enums";
import { setScoreSchema } from "../score";
import { idSchema, optionalText } from "./common";

/**
 * Sets as sent by the apps. Whether they form a valid result depends on the sport, so the API
 * checks them with `sportRules(match.sport).scoreSchema` once it knows the court or booking.
 */
export const reportedSetsSchema = z.array(setScoreSchema).min(1).max(5);

/** Players per side; the same for every sport supported today (see SportRules.teamSize). */
const TEAM_SIZE = { SINGLES: 1, DOUBLES: 2 } as const;

/**
 * Any player of the match reports it. Sets are from side A's point of view. The surface comes
 * from the booking or court when given, otherwise it must be set explicitly.
 */
export const reportMatchSchema = z
  .object({
    format: matchFormatSchema,
    sideA: z.array(idSchema).min(1).max(2),
    sideB: z.array(idSchema).min(1).max(2),
    score: reportedSetsSchema,
    playedOn: isoDateSchema,
    surface: surfaceSchema.optional(),
    courtId: idSchema.optional(),
    bookingId: idSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const size = TEAM_SIZE[value.format];
    if (value.sideA.length !== size || value.sideB.length !== size) {
      ctx.addIssue({
        code: "custom",
        path: ["sideA"],
        message: value.format === "SINGLES" ? "validation.singlesSides" : "validation.doublesSides",
      });
    }
    const all = [...value.sideA, ...value.sideB];
    if (new Set(all).size !== all.length) {
      ctx.addIssue({
        code: "custom",
        path: ["sideB"],
        message: "validation.playerOnBothSides",
      });
    }
    if (!value.surface && !value.courtId && !value.bookingId) {
      ctx.addIssue({ code: "custom", path: ["surface"], message: "validation.surfaceRequired" });
    }
  });
export type ReportMatchInput = z.infer<typeof reportMatchSchema>;
export type ReportMatchRequest = z.input<typeof reportMatchSchema>;

/** Approving needs no body; the schema keeps the DTO explicit. */
export const approveMatchSchema = z.object({}).strict();
export type ApproveMatchInput = z.infer<typeof approveMatchSchema>;

export const disputeMatchSchema = z.object({ comment: optionalText(500) });
export type DisputeMatchInput = z.infer<typeof disputeMatchSchema>;

/** Admin resolution of a disputed match. */
export const resolveDisputeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ACCEPT"), note: optionalText(300) }),
  z.object({ action: z.literal("EDIT"), score: reportedSetsSchema, note: optionalText(300) }),
  z.object({ action: z.literal("VOID"), note: optionalText(300) }),
]);
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;
export type ResolveDisputeRequest = z.input<typeof resolveDisputeSchema>;

/** Leaderboard of one sport (the club's main sport by default), optionally one category. */
export const leaderboardQuerySchema = z.object({
  category: categoryKeySchema.optional(),
  sport: sportSchema.optional(),
});
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

export const h2hQuerySchema = z
  .object({ a: idSchema, b: idSchema })
  .refine((value) => value.a !== value.b, {
    message: "validation.differentPlayers",
    path: ["b"],
  });
export type H2HQuery = z.infer<typeof h2hQuerySchema>;
