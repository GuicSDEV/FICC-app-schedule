import { z } from "zod";

import { isoDateSchema, weekdayOf } from "../dates";
import { weekdaySchema } from "../enums";
import { idSchema, optionalText } from "./common";

const lessonDetails = {
  studentNames: optionalText(200),
  note: optionalText(300),
};

/** One-off lesson, or the first occurrence of a weekly series when `repeat` is set. */
export const createLessonSchema = z
  .object({
    courtId: idSchema,
    timeSlotId: idSchema,
    date: isoDateSchema,
    /** Admins may create lessons for any coach; coaches always create their own. */
    coachId: idSchema.optional(),
    repeat: z
      .object({
        weekdays: z.array(weekdaySchema).min(1, { message: "Escolha ao menos um dia" }).max(7),
        /** Last date (inclusive); open-ended when omitted. */
        endDate: isoDateSchema.optional(),
      })
      .optional(),
    ...lessonDetails,
  })
  .superRefine((value, ctx) => {
    if (!value.repeat) return;
    if (new Set(value.repeat.weekdays).size !== value.repeat.weekdays.length) {
      ctx.addIssue({ code: "custom", path: ["repeat", "weekdays"], message: "Dia repetido" });
    }
    if (!value.repeat.weekdays.includes(weekdayOf(value.date))) {
      ctx.addIssue({
        code: "custom",
        path: ["repeat", "weekdays"],
        message: "Inclua o dia da semana da primeira aula",
      });
    }
    if (value.repeat.endDate && value.repeat.endDate < value.date) {
      ctx.addIssue({
        code: "custom",
        path: ["repeat", "endDate"],
        message: "A data final não pode ser antes da primeira aula",
      });
    }
  });
export type CreateLessonInput = z.infer<typeof createLessonSchema>;

export const LESSON_CANCEL_SCOPES = ["THIS", "THIS_AND_FUTURE"] as const;
export type LessonCancelScope = (typeof LESSON_CANCEL_SCOPES)[number];

export const cancelLessonSchema = z.object({ scope: z.enum(LESSON_CANCEL_SCOPES) });
export type CancelLessonInput = z.infer<typeof cancelLessonSchema>;

/** Move a lesson (court, slot, date) and/or change its details. */
export const updateLessonSchema = z
  .object({
    courtId: idSchema.optional(),
    timeSlotId: idSchema.optional(),
    date: isoDateSchema.optional(),
    studentNames: z.string().trim().max(200).nullable().optional(),
    note: z.string().trim().max(300).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Nada para alterar",
  });
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;

export const copyWeekSchema = z.object({
  weekStart: isoDateSchema.refine((date) => weekdayOf(date) === "MON", {
    message: "A semana começa na segunda-feira",
  }),
});
export type CopyWeekInput = z.infer<typeof copyWeekSchema>;

export const agendaQuerySchema = z.object({ date: isoDateSchema });
export type AgendaQuery = z.infer<typeof agendaQuerySchema>;
