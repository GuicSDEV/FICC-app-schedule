import { z } from "zod";

import { isoDateSchema } from "../dates";
import { courtModeSchema, permissionSchema } from "../enums";
import { passwordSchema, personNameSchema } from "./auth";
import { emailSchema, idSchema, isoDateTimeSchema, optionalText } from "./common";

const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "validation.invalidTime" });

/** Staff override one date: close the club or some courts, change the grid or the mode. */
export const scheduleExceptionSchema = z.object({
  date: isoDateSchema,
  closed: z.boolean().default(false),
  /** Start times used that day (null = the weekday grid). */
  slotTimes: z.array(timeOfDaySchema).max(48).nullable().default(null),
  mode: courtModeSchema.nullable().default(null),
  closedCourtIds: z.array(idSchema).max(64).default([]),
  note: z.string().trim().max(120).nullable().default(null),
});
export type ScheduleExceptionInput = z.infer<typeof scheduleExceptionSchema>;
export type ScheduleExceptionRequest = z.input<typeof scheduleExceptionSchema>;

export const exceptionRangeQuerySchema = z.object({ from: isoDateSchema, to: isoDateSchema });

/** Free play: check in to a court (the player and up to three partners). */
export const checkInSchema = z.object({
  courtId: idSchema,
  partnerIds: z.array(idSchema).max(3).default([]),
});
export type CheckInInput = z.infer<typeof checkInSchema>;
export type CheckInRequest = z.input<typeof checkInSchema>;

/** Staff decide a self sign-up; a rejection needs a reason the person will read. */
export const signupDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("APPROVE") }),
  z.object({
    decision: z.literal("REJECT"),
    reason: z
      .string()
      .trim()
      .min(3, { message: "validation.reasonRequired" })
      .max(300, { message: "validation.tooLong" }),
  }),
]);
export type SignupDecisionInput = z.infer<typeof signupDecisionSchema>;

/** Mark a booking player as a no-show (staff, or a co-player of the booking). */
export const noShowSchema = z.object({
  userId: idSchema,
  note: optionalText(300),
});
export type NoShowInput = z.infer<typeof noShowSchema>;

/** Club news board ("Mural") post. Photos are image URLs. */
export const newsPostSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, { message: "validation.tooShort" })
    .max(120, { message: "validation.tooLong" }),
  body: z.string().trim().min(1, { message: "validation.required" }).max(5000),
  photoUrls: z
    .array(z.url({ message: "validation.invalidUrl" }))
    .max(6)
    .default([]),
  eventDate: isoDateSchema.nullable().default(null),
  pinned: z.boolean().default(false),
  /** Push a notification to every active member. */
  notify: z.boolean().default(true),
});
export type NewsPostInput = z.infer<typeof newsPostSchema>;
export type NewsPostRequest = z.input<typeof newsPostSchema>;

export const updateNewsPostSchema = newsPostSchema.partial().omit({ notify: true });
export type UpdateNewsPostInput = z.infer<typeof updateNewsPostSchema>;

/** A staff role: a name and the permissions it grants. */
export const staffRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: "validation.tooShort" })
    .max(40, { message: "validation.tooLong" }),
  description: z.string().trim().max(200).default(""),
  permissions: z.array(permissionSchema).max(32),
});
export type StaffRoleInput = z.infer<typeof staffRoleSchema>;
export type StaffRoleRequest = z.input<typeof staffRoleSchema>;

/** New staff account (admin area login by email) with its roles. */
export const createStaffSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
  roleIds: z.array(idSchema).min(1, { message: "validation.pickRole" }).max(10),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

/** Roles of an existing staff member (admin or coach). */
export const staffRolesSchema = z.object({ roleIds: z.array(idSchema).max(10) });
export type StaffRolesInput = z.infer<typeof staffRolesSchema>;

export const auditQuerySchema = z.object({
  actorId: idSchema.optional(),
  before: isoDateTimeSchema.optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;
