import { z } from "zod";

import { isoDateSchema } from "../dates";
import {
  drawFormatSchema,
  entryStatusSchema,
  matchFormatSchema,
  matchOutcomeSchema,
  paymentStatusSchema,
  scoreFormatSchema,
  seedingMethodSchema,
  tournamentStatusSchema,
} from "../enums";
import { pointsTableSchema } from "../tournaments/points";
import { idSchema, isoDateTimeSchema, optionalText } from "./common";
import { reportedSetsSchema } from "./match";

const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "validation.invalidTime" });
const urlSchema = z.url({ message: "validation.invalidUrl" });

const tournamentFields = {
  name: z
    .string()
    .trim()
    .min(3, { message: "validation.tooShort" })
    .max(80, { message: "validation.tooLong" }),
  /** Rules and information, in simple Markdown (paragraphs, **bold**, *italic*, lists, links). */
  description: z.string().trim().max(10_000, { message: "validation.tooLong" }).default(""),
  coverImageUrl: urlSchema.nullable().default(null),
  sponsorLogos: z.array(urlSchema).max(8).default([]),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  location: z.string().trim().max(120).default(""),
  /** Courts the order of play may use (all when empty). */
  courtIds: z.array(idSchema).max(32).default([]),
  registrationOpensAt: isoDateTimeSchema.nullable().default(null),
  registrationClosesAt: isoDateTimeSchema.nullable().default(null),
  /** Guests and external players (name + phone) may be entered. */
  allowGuests: z.boolean().default(false),
  /** Informative fee (no payment gateway); null when free. */
  feeAmountCents: z.number().int().min(0).max(10_000_000).nullable().default(null),
  requiresApproval: z.boolean().default(false),
  /** Minimum rest between two matches of the same player in the order of play. */
  restMinutes: z.number().int().min(0).max(480).default(60),
  circuitId: idSchema.nullable().default(null),
};

const datesInOrder = (value: { startDate?: string; endDate?: string }) =>
  !value.startDate || !value.endDate || value.endDate >= value.startDate;

export const createTournamentSchema = z
  .object(tournamentFields)
  .refine(datesInOrder, { message: "validation.invalidRange", path: ["endDate"] });
export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type CreateTournamentRequest = z.input<typeof createTournamentSchema>;

export const updateTournamentSchema = z
  .object(
    Object.fromEntries(
      Object.entries(tournamentFields).map(([key, schema]) => [
        key,
        (schema as z.ZodType).optional(),
      ]),
    ) as { [K in keyof typeof tournamentFields]: z.ZodOptional<(typeof tournamentFields)[K]> },
  )
  .refine(datesInOrder, { message: "validation.invalidRange", path: ["endDate"] });
export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;
export type UpdateTournamentRequest = z.input<typeof updateTournamentSchema>;

export const tournamentStatusChangeSchema = z.object({ status: tournamentStatusSchema });
export type TournamentStatusChangeInput = z.infer<typeof tournamentStatusChangeSchema>;

export const organizersSchema = z.object({ userIds: z.array(idSchema).max(10) });
export type OrganizersInput = z.infer<typeof organizersSchema>;

export const tournamentCategorySchema = z
  .object({
    name: z.string().trim().min(1, { message: "validation.required" }).max(60),
    entryType: matchFormatSchema,
    drawFormat: drawFormatSchema,
    groupSize: z.number().int().min(3).max(8).default(4),
    advancePerGroup: z.number().int().min(1).max(4).default(2),
    maxEntries: z.number().int().min(2).max(128),
    scoreFormat: scoreFormatSchema.default("BEST_OF_3_MATCH_TIEBREAK"),
    /** Confirmed results move the Elo ladder (members only). */
    countsForElo: z.boolean().default(false),
    seeding: seedingMethodSchema.default("ELO"),
    circuitCategoryId: idSchema.nullable().default(null),
  })
  .refine((value) => value.advancePerGroup < value.groupSize, {
    message: "validation.advanceBelowGroupSize",
    path: ["advancePerGroup"],
  });
export type TournamentCategoryInput = z.infer<typeof tournamentCategorySchema>;
export type TournamentCategoryRequest = z.input<typeof tournamentCategorySchema>;

export const timeRestrictionsSchema = z.object({
  weekdayNotBefore: timeOfDaySchema.nullable().default(null),
  weekendNotBefore: timeOfDaySchema.nullable().default(null),
  unavailableDates: z.array(isoDateSchema).max(60).default([]),
});
export type TimeRestrictionsInput = z.infer<typeof timeRestrictionsSchema>;

const guestPlayerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, { message: "validation.fullNameRequired" })
    .max(100)
    .refine((name) => name.split(/\s+/).length >= 2, { message: "validation.firstAndLastName" }),
  phone: z
    .string()
    .trim()
    .transform((value) => value.replace(/[^\d+]/g, ""))
    .refine((value) => /^\+?\d{10,14}$/.test(value), { message: "validation.invalidPhone" }),
});

/** A member registers in a category; doubles add a partner (member, or guest when allowed). */
export const registerEntrySchema = z
  .object({
    partnerId: idSchema.optional(),
    partnerGuest: guestPlayerSchema.optional(),
    restrictions: timeRestrictionsSchema.default({
      weekdayNotBefore: null,
      weekendNotBefore: null,
      unavailableDates: [],
    }),
    note: optionalText(300),
  })
  .refine((value) => !(value.partnerId && value.partnerGuest), {
    message: "validation.onePartner",
    path: ["partnerId"],
  });
export type RegisterEntryInput = z.infer<typeof registerEntrySchema>;
export type RegisterEntryRequest = z.input<typeof registerEntrySchema>;

export const updateEntrySchema = z.object({
  restrictions: timeRestrictionsSchema.optional(),
  note: z.string().trim().max(300).nullable().optional(),
});
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;

/** Organizer adds an entry: members by id or external players by name + phone. */
export const organizerEntrySchema = z.object({
  players: z
    .array(z.union([z.object({ userId: idSchema }), guestPlayerSchema]))
    .min(1)
    .max(2),
  paymentStatus: paymentStatusSchema.default("UNPAID"),
  restrictions: timeRestrictionsSchema.default({
    weekdayNotBefore: null,
    weekendNotBefore: null,
    unavailableDates: [],
  }),
  note: optionalText(300),
});
export type OrganizerEntryInput = z.infer<typeof organizerEntrySchema>;
export type OrganizerEntryRequest = z.input<typeof organizerEntrySchema>;

export const manageEntrySchema = z
  .object({
    status: entryStatusSchema.optional(),
    paymentStatus: paymentStatusSchema.optional(),
    categoryId: idSchema.optional(),
    /** Manual seed (1 = top); null clears it. */
    seed: z.number().int().min(1).max(128).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "validation.nothingToChange",
  });
export type ManageEntryInput = z.infer<typeof manageEntrySchema>;

/** Swap two entries' places in a draft draw (knockout positions or groups). */
export const drawSwapSchema = z
  .object({ entryA: idSchema, entryB: idSchema })
  .refine((value) => value.entryA !== value.entryB, {
    message: "validation.differentPlayers",
    path: ["entryB"],
  });
export type DrawSwapInput = z.infer<typeof drawSwapSchema>;

export const scheduleMatchSchema = z.object({
  date: isoDateSchema,
  courtId: idSchema,
  timeSlotId: idSchema,
});
export type ScheduleMatchInput = z.infer<typeof scheduleMatchSchema>;

export const autoScheduleSchema = z.object({
  dates: z.array(isoDateSchema).min(1).max(14),
  categoryIds: z.array(idSchema).optional(),
});
export type AutoScheduleInput = z.infer<typeof autoScheduleSchema>;

export const publishScheduleSchema = z.object({ date: isoDateSchema });
export type PublishScheduleInput = z.infer<typeof publishScheduleSchema>;

export const tournamentResultSchema = z.object({ sets: reportedSetsSchema });
export type TournamentResultInput = z.infer<typeof tournamentResultSchema>;
export type TournamentResultRequest = z.input<typeof tournamentResultSchema>;

/** Organizer decides a match without (or with part of) a score. */
export const tournamentOutcomeSchema = z.object({
  outcome: matchOutcomeSchema.exclude(["PLAYED", "BYE"]),
  winnerEntryId: idSchema,
  /** Score played before a retirement (side A first), optional. */
  sets: z.array(reportedSetsSchema.element).max(5).optional(),
});
export type TournamentOutcomeInput = z.infer<typeof tournamentOutcomeSchema>;
export type TournamentOutcomeRequest = z.input<typeof tournamentOutcomeSchema>;

export const announcementSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, { message: "validation.required" })
    .max(1000, { message: "validation.tooLong" }),
  categoryId: idSchema.optional(),
});
export type AnnouncementInput = z.infer<typeof announcementSchema>;

export const circuitSchema = z.object({
  name: z.string().trim().min(3, { message: "validation.tooShort" }).max(80),
  season: z.string().trim().min(2).max(20),
  pointsTable: pointsTableSchema,
  categories: z.array(z.string().trim().min(1).max(60)).min(1).max(12),
});
export type CircuitInput = z.infer<typeof circuitSchema>;

export const updateCircuitSchema = z.object({
  name: z.string().trim().min(3).max(80).optional(),
  season: z.string().trim().min(2).max(20).optional(),
  pointsTable: pointsTableSchema.optional(),
  /** Category names to add (existing ones are kept). */
  addCategories: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
});
export type UpdateCircuitInput = z.infer<typeof updateCircuitSchema>;

export const tournamentListQuerySchema = z.object({
  status: z.enum(["UPCOMING", "OPEN", "IN_PROGRESS", "FINISHED"]).optional(),
});
export type TournamentListQuery = z.infer<typeof tournamentListQuerySchema>;
