import type { Category, FreezeReason, GateScanResult, Surface, Weekday } from "./enums";

// pt-BR labels shared by the web app, the API and the seed.

export const CATEGORY_LABELS: Record<Category, string> = {
  CLASS_A: "Classe A",
  CLASS_B: "Classe B",
  CLASS_C: "Classe C",
  WOMENS: "Feminino",
  SENIORS: "Sênior",
};

export const SURFACE_LABELS: Record<Surface, string> = {
  HARTRU: "Har-Tru",
  SAIBRO: "Saibro",
};

export const WEEKDAY_LABELS: Record<Weekday, { short: string; long: string }> = {
  MON: { short: "Seg", long: "Segunda" },
  TUE: { short: "Ter", long: "Terça" },
  WED: { short: "Qua", long: "Quarta" },
  THU: { short: "Qui", long: "Quinta" },
  FRI: { short: "Sex", long: "Sexta" },
  SAT: { short: "Sáb", long: "Sábado" },
  SUN: { short: "Dom", long: "Domingo" },
};

export const FREEZE_REASON_LABELS: Record<FreezeReason, string> = {
  RAIN: "Chuva",
  MAINTENANCE: "Manutenção",
};

export const GATE_SCAN_RESULT_LABELS: Record<GateScanResult, string> = {
  ACCEPTED: "Entrada liberada",
  INVALID_TOKEN: "QR inválido",
  WRONG_DATE: "Passe fora da data",
  ALREADY_USED: "Passe já utilizado",
  PASS_CANCELLED: "Passe cancelado",
  DOCUMENT_BLOCKED: "Documento bloqueado",
  HOST_SUSPENDED: "Sócio sem permissão de convidados",
  NOT_FOUND: "Passe não encontrado",
};
