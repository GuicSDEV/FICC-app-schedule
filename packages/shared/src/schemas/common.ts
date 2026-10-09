import { z } from "zod";

/** Database ids (cuid). */
export const idSchema = z.string().trim().min(1, { message: "Obrigatório" }).max(64);

/** ISO-8601 instant with offset, e.g. 2026-10-08T18:30:00-03:00. */
export const isoDateTimeSchema = z.iso.datetime({ offset: true, message: "Data e hora inválidas" });

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: `Máximo de ${max} caracteres` })
    .optional()
    .transform((value) => (value ? value : undefined));

/** Trimmed, lower-cased email (normalized before the format check). */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "E-mail inválido" }));
