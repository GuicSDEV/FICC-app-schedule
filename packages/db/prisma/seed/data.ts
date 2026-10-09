// Club data for the development seed. Courts, slots, coaches and the lesson template are the
// real club setup from docs/SPEC.md; members and their skill levels are fictional.

import type { DefaultSlotStartTime } from "@ficc/shared";

import { Category, Role, Surface, Weekday } from "../../src";

export type CourtName = "Q1" | "Q2" | "Q3" | "Q4" | "Q5" | "Q6";

export const COURTS: readonly { name: CourtName; surface: Surface }[] = [
  { name: "Q1", surface: Surface.HARTRU },
  { name: "Q2", surface: Surface.HARTRU },
  { name: "Q3", surface: Surface.HARTRU },
  { name: "Q4", surface: Surface.HARTRU },
  { name: "Q5", surface: Surface.SAIBRO },
  { name: "Q6", surface: Surface.SAIBRO },
];

export const STAFF: readonly { role: Role; name: string; email: string }[] = [
  { role: Role.ADMIN, name: "Administração FICC", email: "admin@ficc.test" },
  { role: Role.GATE, name: "Portaria FICC", email: "portaria@ficc.test" },
];

export type CoachKey = "alan" | "phelipe" | "club";

export interface SeedCoach {
  displayName: string;
  email: string;
  color: string;
  courts: readonly CourtName[];
}

export const COACHES: Record<CoachKey, SeedCoach> = {
  alan: { displayName: "Alan", email: "alan@ficc.test", color: "#8B7CF6", courts: ["Q5"] },
  phelipe: { displayName: "Phelipe", email: "phelipe@ficc.test", color: "#C084FC", courts: ["Q6"] },
  // The spec's generic "Club Coach" account; admins can rename or reassign it.
  club: {
    displayName: "Professor do Clube",
    email: "professor@ficc.test",
    color: "#6366F1",
    courts: ["Q1", "Q6"],
  },
};

/**
 * Default weekly lesson template, Monday to Friday (docs/SPEC.md, "Current typical lesson
 * schedule"). Each entry becomes one LessonSeries; missing courts are free.
 */
export const LESSON_TEMPLATE: Record<DefaultSlotStartTime, Partial<Record<CourtName, CoachKey>>> = {
  "08:30": { Q1: "club", Q5: "alan", Q6: "phelipe" },
  "10:00": { Q1: "club", Q5: "alan", Q6: "phelipe" },
  "14:45": { Q1: "club", Q5: "alan", Q6: "club" },
  "16:00": { Q1: "club", Q5: "alan", Q6: "phelipe" },
  "17:15": { Q6: "phelipe" },
  "18:30": { Q5: "alan", Q6: "phelipe" },
  "19:45": { Q5: "alan", Q6: "phelipe" },
  "21:00": {},
};

export const LESSON_WEEKDAYS: readonly Weekday[] = [
  Weekday.MON,
  Weekday.TUE,
  Weekday.WED,
  Weekday.THU,
  Weekday.FRI,
];

/** Lesson occurrences are generated for this many weeks ahead (the rolling window). */
export const LESSON_WINDOW_WEEKS = 8;

export interface SeedMember {
  membershipId: string;
  name: string;
  categories: readonly Category[];
  /** Hidden playing strength (0–100) used only to simulate match results. */
  skill: number;
}

const { CLASS_A, CLASS_B, CLASS_C, WOMENS, SENIORS } = Category;

export const MEMBERS: readonly SeedMember[] = [
  // Class A
  { membershipId: "104218", name: "Rafael Almeida", categories: [CLASS_A], skill: 92 },
  { membershipId: "104377", name: "Bruno Carvalho", categories: [CLASS_A], skill: 90 },
  { membershipId: "105102", name: "Thiago Ribeiro", categories: [CLASS_A], skill: 86 },
  { membershipId: "105546", name: "Gustavo Martins", categories: [CLASS_A], skill: 84 },
  { membershipId: "106031", name: "Lucas Ferreira", categories: [CLASS_A], skill: 82 },
  { membershipId: "101987", name: "Fernando Cunha", categories: [CLASS_A, SENIORS], skill: 80 },
  { membershipId: "106840", name: "Juliana Costa", categories: [CLASS_A, WOMENS], skill: 83 },
  { membershipId: "107215", name: "Isabela Correia", categories: [CLASS_A, WOMENS], skill: 81 },
  // Class B
  { membershipId: "107698", name: "Felipe Rocha", categories: [CLASS_B], skill: 74 },
  { membershipId: "108122", name: "Diego Souza", categories: [CLASS_B], skill: 73 },
  { membershipId: "108459", name: "Rodrigo Lima", categories: [CLASS_B], skill: 70 },
  { membershipId: "102344", name: "Marcelo Barros", categories: [CLASS_B, SENIORS], skill: 66 },
  { membershipId: "108903", name: "André Teixeira", categories: [CLASS_B], skill: 69 },
  { membershipId: "109276", name: "Eduardo Pires", categories: [CLASS_B], skill: 67 },
  { membershipId: "102761", name: "Roberto Azevedo", categories: [CLASS_B, SENIORS], skill: 65 },
  { membershipId: "109634", name: "Mariana Lopes", categories: [CLASS_B, WOMENS], skill: 68 },
  { membershipId: "110087", name: "Camila Freitas", categories: [CLASS_B, WOMENS], skill: 64 },
  { membershipId: "110452", name: "Fernanda Araújo", categories: [CLASS_B, WOMENS], skill: 62 },
  // Class C
  { membershipId: "110918", name: "Vinícius Moreira", categories: [CLASS_C], skill: 58 },
  { membershipId: "111305", name: "Leonardo Castro", categories: [CLASS_C], skill: 56 },
  { membershipId: "111742", name: "Gabriel Nunes", categories: [CLASS_C], skill: 55 },
  { membershipId: "112166", name: "Mateus Cardoso", categories: [CLASS_C], skill: 53 },
  { membershipId: "103129", name: "Paulo Mendes", categories: [CLASS_C, SENIORS], skill: 50 },
  { membershipId: "103580", name: "Sérgio Duarte", categories: [CLASS_C, SENIORS], skill: 48 },
  { membershipId: "112573", name: "Caio Monteiro", categories: [CLASS_C], skill: 52 },
  { membershipId: "112994", name: "Henrique Vieira", categories: [CLASS_C], skill: 51 },
  { membershipId: "113348", name: "Beatriz Santos", categories: [CLASS_C, WOMENS], skill: 54 },
  { membershipId: "113781", name: "Larissa Gomes", categories: [CLASS_C, WOMENS], skill: 49 },
  {
    membershipId: "103902",
    name: "Patrícia Ramos",
    categories: [CLASS_C, WOMENS, SENIORS],
    skill: 46,
  },
  { membershipId: "114215", name: "Renata Batista", categories: [CLASS_C, WOMENS], skill: 47 },
];

/** Valid IDs nobody has registered with yet, to try the sign-up flow. */
export const UNCLAIMED_MEMBERSHIPS: readonly { membershipId: string; holderName: string }[] = [
  { membershipId: "114650", holderName: "Ana Paula Moura" },
  { membershipId: "115083", holderName: "Ricardo Tavares" },
  { membershipId: "115417", holderName: "Letícia Farias" },
  { membershipId: "115862", holderName: "Daniel Siqueira" },
  { membershipId: "116209", holderName: "Carolina Pacheco" },
  { membershipId: "116634", holderName: "Marcos Antunes" },
  { membershipId: "117051", holderName: "Bianca Rezende" },
  { membershipId: "117498", holderName: "Otávio Fontes" },
  { membershipId: "117823", holderName: "Helena Quintana" },
  { membershipId: "118260", holderName: "Júlio Prado" },
];

/** Singles pairings repeated on purpose so head-to-head pages have history. */
export const RIVALRIES: readonly { players: readonly [string, string]; times: number }[] = [
  { players: ["Rafael Almeida", "Bruno Carvalho"], times: 3 },
  { players: ["Juliana Costa", "Isabela Correia"], times: 2 },
  { players: ["Felipe Rocha", "Diego Souza"], times: 2 },
  { players: ["Marcelo Barros", "Roberto Azevedo"], times: 2 },
];

export const MATCH_COUNTS = { singles: 30, doubles: 10 } as const;

/** Days between consecutive seeded matches (the last one is yesterday). */
export const MATCH_SPACING_DAYS = 3;
