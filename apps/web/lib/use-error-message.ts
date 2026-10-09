import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { ApiError } from "./api";

/** Text to show for a failed request: the API's (already translated) message, or ours. */
export function useErrorMessage() {
  const t = useTranslations("errors");
  return useCallback(
    (error: unknown, fallback?: string) => {
      if (error instanceof ApiError) {
        if (error.code === "NETWORK_ERROR") return t("network");
        if (error.message) return error.message;
      }
      return fallback ?? t("generic");
    },
    [t],
  );
}
