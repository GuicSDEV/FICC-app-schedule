import { z } from "zod";

import { ptBR } from "./pt-BR";

/** Locales with a catalogue. Clubs choose one in their settings; pt-BR is the only one today. */
export const MESSAGES = { "pt-BR": ptBR } as const;
export type Locale = keyof typeof MESSAGES;
export const DEFAULT_LOCALE: Locale = "pt-BR";
export const LOCALES = Object.keys(MESSAGES) as Locale[];

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every dotted key of the shared catalogue, e.g. "api.bookingNotFound". */
export type MessageKey = Leaves<typeof ptBR>;
export type MessageParams = Record<string, string | number>;
/** A message to show: a key, optionally with ICU-style `{placeholder}` values. */
export type MessageRef = MessageKey | { key: MessageKey; params?: MessageParams };

export function isLocale(value: string): value is Locale {
  return value in MESSAGES;
}

function lookup(locale: Locale, key: string): string | undefined {
  let node: unknown = MESSAGES[locale];
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * Resolves a key in the club's locale and fills `{placeholders}`. Unknown keys come back as-is,
 * so a missing translation is visible but never crashes a request.
 */
export function translate(
  key: string,
  params: MessageParams = {},
  locale: string = DEFAULT_LOCALE,
): string {
  const template =
    lookup(isLocale(locale) ? locale : DEFAULT_LOCALE, key) ?? lookup(DEFAULT_LOCALE, key) ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function translateRef(ref: MessageRef, locale?: string): string {
  return typeof ref === "string"
    ? translate(ref, {}, locale)
    : translate(ref.key, ref.params, locale);
}

/** Minimal issue shape (Zod issues satisfy it) for {@link translateIssue}. */
export interface IssueLike {
  message: string;
  params?: Record<string, unknown>;
  minimum?: unknown;
  maximum?: unknown;
}

/** Placeholder values carried by a validation issue (custom params, min/max bounds). */
export function issueParams(issue: IssueLike): MessageParams {
  const params: MessageParams = {};
  for (const [name, value] of Object.entries(issue.params ?? {})) {
    if (typeof value === "string" || typeof value === "number") params[name] = value;
  }
  if (issue.minimum !== undefined) params.minimum = Number(issue.minimum);
  if (issue.maximum !== undefined) params.maximum = Number(issue.maximum);
  return params;
}

/** pt-BR (or the club's locale) text for a Zod issue from a shared schema. */
export function translateIssue(issue: IssueLike, locale?: string): string {
  return translate(issue.message, issueParams(issue), locale);
}

/**
 * Shared schemas carry message keys instead of text. Checks without an explicit message get a
 * generic key from this map, so no English default ever reaches a user.
 */
z.config({
  customError: (issue) => {
    switch (issue.code) {
      case "invalid_type":
        return issue.input === undefined ? "validation.required" : "validation.invalidType";
      case "too_small":
        if (issue.origin === "string")
          return issue.minimum === 1 ? "validation.required" : "validation.tooShort";
        if (issue.origin === "array" || issue.origin === "set") return "validation.tooFewItems";
        return "validation.numberTooSmall";
      case "too_big":
        if (issue.origin === "string") return "validation.tooLong";
        if (issue.origin === "array" || issue.origin === "set") return "validation.tooManyItems";
        return "validation.numberTooBig";
      case "invalid_format":
        return "validation.invalidFormat";
      case "invalid_value":
        return "validation.invalidOption";
      case "unrecognized_keys":
        return "validation.unknownField";
      default:
        return "validation.invalid";
    }
  },
});

export { ptBR };
