import { z } from "zod";

/** Database ids (cuid). */
export const idSchema = z.string().trim().min(1, { message: "validation.required" }).max(64);

/** ISO-8601 instant with offset, e.g. 2026-10-08T18:30:00-03:00. */
export const isoDateTimeSchema = z.iso.datetime({
  offset: true,
  message: "validation.invalidDateTime",
});

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: "validation.tooLong" })
    .optional()
    .transform((value) => (value ? value : undefined));

/** Trimmed, lower-cased email (normalized before the format check). */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "validation.invalidEmail" }));

/** A browser's web-push subscription (PushSubscription.toJSON()). */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({ p256dh: z.string().min(10).max(256), auth: z.string().min(8).max(64) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushEndpointSchema = z.object({ endpoint: z.url().max(2048) });
export type PushEndpointInput = z.infer<typeof pushEndpointSchema>;
