import { z } from "zod";

import { isoDateSchema } from "../dates";
import { categorySchema, matchTypeSchema, surfaceSchema } from "../enums";
import { matchScoreSchema } from "../score";
import { idSchema, optionalText } from "./common";

const TEAM_SIZE = { SINGLES: 1, DOUBLES: 2 } as const;

/**
 * Any player of the match reports it. Sets are from side A's point of view. The surface comes
 * from the booking or court when given, otherwise it must be set explicitly.
 */
export const reportMatchSchema = z
  .object({
    type: matchTypeSchema,
    sideA: z.array(idSchema).min(1).max(2),
    sideB: z.array(idSchema).min(1).max(2),
    score: matchScoreSchema,
    playedOn: isoDateSchema,
    surface: surfaceSchema.optional(),
    courtId: idSchema.optional(),
    bookingId: idSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const size = TEAM_SIZE[value.type];
    if (value.sideA.length !== size || value.sideB.length !== size) {
      ctx.addIssue({
        code: "custom",
        path: ["sideA"],
        message:
          value.type === "SINGLES" ? "Simples: 1 jogador por lado" : "Duplas: 2 jogadores por lado",
      });
    }
    const all = [...value.sideA, ...value.sideB];
    if (new Set(all).size !== all.length) {
      ctx.addIssue({
        code: "custom",
        path: ["sideB"],
        message: "Um jogador não pode estar nos dois lados",
      });
    }
    if (!value.surface && !value.courtId && !value.bookingId) {
      ctx.addIssue({ code: "custom", path: ["surface"], message: "Informe a superfície" });
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
  z.object({ action: z.literal("EDIT"), score: matchScoreSchema, note: optionalText(300) }),
  z.object({ action: z.literal("VOID"), note: optionalText(300) }),
]);
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;
export type ResolveDisputeRequest = z.input<typeof resolveDisputeSchema>;

export const leaderboardQuerySchema = z.object({ category: categorySchema.optional() });
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

export const h2hQuerySchema = z
  .object({ a: idSchema, b: idSchema })
  .refine((value) => value.a !== value.b, {
    message: "Escolha dois jogadores diferentes",
    path: ["b"],
  });
export type H2HQuery = z.infer<typeof h2hQuerySchema>;
