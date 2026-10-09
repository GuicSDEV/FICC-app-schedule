import { getRequestConfig } from "next-intl/server";

import { DEFAULT_LOCALE, MESSAGES } from "./messages";

/**
 * Server-side next-intl config. URLs carry no locale (v1 serves one club, in its language); the
 * client switches to the club's locale and time zone once GET /club answers (ClubProvider).
 */
export default getRequestConfig(async () => ({
  locale: DEFAULT_LOCALE,
  messages: MESSAGES[DEFAULT_LOCALE],
}));
