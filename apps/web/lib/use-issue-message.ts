import { issueParams, type IssueLike } from "@ficc/shared";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

/**
 * Text for a validation issue from a shared schema: its message is a catalogue key
 * ("validation.tooLong") with values such as the maximum length.
 */
export function useIssueMessage() {
  const t = useTranslations();
  return useCallback(
    (issue: IssueLike | undefined) => {
      if (!issue) return t("validation.invalid");
      const key = issue.message as Parameters<typeof t>[0];
      return t.has(key) ? t(key, issueParams(issue)) : t("validation.invalid");
    },
    [t],
  );
}
