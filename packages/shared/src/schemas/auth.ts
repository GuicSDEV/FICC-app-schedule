import { z } from "zod";

import { isValidMembershipId, normalizeMembershipId } from "../membership";
import { emailSchema } from "./common";

export const membershipIdSchema = z
  .string()
  .transform(normalizeMembershipId)
  .refine(isValidMembershipId, { message: "Matrícula inválida" });

export const passwordSchema = z
  .string()
  .min(8, { message: "A senha precisa de pelo menos 8 caracteres" })
  .max(128, { message: "Senha muito longa" });

export const personNameSchema = z
  .string()
  .trim()
  .min(3, { message: "Informe o nome completo" })
  .max(80, { message: "Nome muito longo" });

/** Member sign-up: the matrícula must be on the club's list of valid IDs. */
export const registerSchema = z.object({
  membershipId: membershipIdSchema,
  name: personNameSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

/** Members log in with their matrícula; coaches, admins and gate staff with their email. */
export const loginSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("member"),
    membershipId: membershipIdSchema,
    password: z.string().min(1, { message: "Informe a senha" }),
  }),
  z.object({
    kind: z.literal("staff"),
    email: emailSchema,
    password: z.string().min(1, { message: "Informe a senha" }),
  }),
]);
export type LoginInput = z.infer<typeof loginSchema>;
