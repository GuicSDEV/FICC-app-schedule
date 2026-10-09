import {
  DEFAULT_LOCALE as SHARED_DEFAULT_LOCALE,
  type Locale,
  ptBR as sharedPtBR,
} from "@ficc/shared";

import webPtBR from "../messages/pt-BR.json";

/**
 * Every UI string: the web app's own messages plus the shared catalogue (API errors, validation
 * and enum labels from @ficc/shared), so both speak with one voice. pt-BR is the only locale
 * today; a new one adds a JSON file here and a catalogue in @ficc/shared.
 */
export const MESSAGES = {
  "pt-BR": { ...webPtBR, ...sharedPtBR },
} as const satisfies Record<Locale, unknown>;

export type Messages = (typeof MESSAGES)[typeof SHARED_DEFAULT_LOCALE];

export const DEFAULT_LOCALE: Locale = SHARED_DEFAULT_LOCALE;
