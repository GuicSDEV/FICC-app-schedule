import type { NotificationItem } from "@ficc/shared";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { useClub } from "@/components/providers/club-provider";

import { useFormat } from "./use-format";

export type NotificationTone = "ball" | "lesson" | "danger" | "warning" | "neutral";

export interface NotificationCopy {
  title: string;
  body: string;
  href: string | null;
  tone: NotificationTone;
}

/** Text for each notification type (in the club's language), built from its payload. */
export function useNotificationCopy() {
  const t = useTranslations("notifications");
  const labels = useTranslations("labels");
  const format = useFormat();
  const club = useClub();

  return useCallback(
    (item: NotificationItem): NotificationCopy => {
      switch (item.type) {
        case "BOOKING_INVITE": {
          const { invitedBy, courtName, date, startTime } = item.payload;
          return {
            title: t("BOOKING_INVITE.title"),
            body: t("BOOKING_INVITE.body", {
              invitedBy,
              court: courtName,
              day: format.day(date),
              time: startTime,
            }),
            href: "/app",
            tone: "ball",
          };
        }
        case "BOOKING_CONFIRMED": {
          const { courtName, date, startTime } = item.payload;
          return {
            title: t("BOOKING_CONFIRMED.title"),
            body: t("BOOKING_CONFIRMED.body", {
              court: courtName,
              day: format.day(date),
              time: startTime,
            }),
            href: "/app",
            tone: "ball",
          };
        }
        case "BOOKING_CANCELLED": {
          const { courtName, date, startTime, reason, byName } = item.payload;
          return {
            title: t("BOOKING_CANCELLED.title"),
            body: t("BOOKING_CANCELLED.body", {
              court: courtName,
              day: format.day(date),
              time: startTime,
              reason: t(`BOOKING_CANCELLED.reasons.${reason}`, { name: byName ?? t("someone") }),
            }),
            href: "/app/courts",
            tone: "danger",
          };
        }
        case "SLOT_OPENED": {
          const { courtName, date, startTime } = item.payload;
          return {
            title: t("SLOT_OPENED.title"),
            body: t("SLOT_OPENED.body", {
              court: courtName,
              day: format.day(date),
              time: startTime,
            }),
            href: `/app/courts?date=${date}`,
            tone: "ball",
          };
        }
        case "LESSON_CANCELLED": {
          const { byName, courtName, date, startTime } = item.payload;
          return {
            title: t("LESSON_CANCELLED.title"),
            body: t("LESSON_CANCELLED.body", {
              byName,
              court: courtName,
              day: format.day(date),
              time: startTime,
            }),
            href: "/coach",
            tone: "lesson",
          };
        }
        case "MATCH_REPORTED":
          return {
            title: t("MATCH_REPORTED.title"),
            body: club
              ? t("MATCH_REPORTED.body", {
                  reportedBy: item.payload.reportedBy,
                  score: item.payload.score,
                  hours: club.settings.matchAutoApproveHours,
                })
              : t("MATCH_REPORTED.bodyNoDeadline", {
                  reportedBy: item.payload.reportedBy,
                  score: item.payload.score,
                }),
            href: `/app/matches/${item.payload.matchId}`,
            tone: "ball",
          };
        case "MATCH_CONFIRMED":
          return {
            title: item.payload.won ? t("MATCH_CONFIRMED.titleWon") : t("MATCH_CONFIRMED.title"),
            body: t("MATCH_CONFIRMED.body", {
              score: item.payload.score,
              elo: item.payload.eloAfter,
              delta: format.delta(item.payload.delta),
            }),
            href: `/app/matches/${item.payload.matchId}`,
            tone: item.payload.won ? "ball" : "neutral",
          };
        case "MATCH_DISPUTED":
          return {
            title: t("MATCH_DISPUTED.title"),
            body: item.payload.comment
              ? t("MATCH_DISPUTED.bodyWithComment", {
                  disputedBy: item.payload.disputedBy,
                  comment: item.payload.comment,
                })
              : t("MATCH_DISPUTED.body", { disputedBy: item.payload.disputedBy }),
            href: `/app/matches/${item.payload.matchId}`,
            tone: "danger",
          };
        case "DISPUTE_RESOLVED":
          return {
            title: t("DISPUTE_RESOLVED.title"),
            body: t(`DISPUTE_RESOLVED.${item.payload.action}`),
            href: `/app/matches/${item.payload.matchId}`,
            tone: "neutral",
          };
        case "COURT_FROZEN":
          return {
            title: t("COURT_FROZEN.title", {
              reason: labels(`freezeReason.${item.payload.reason}`),
            }),
            body: t("COURT_FROZEN.body", { courts: item.payload.courtNames.join(", ") }),
            href: "/app/courts",
            tone: "warning",
          };
        case "COURT_UNFROZEN":
          return {
            title: t("COURT_UNFROZEN.title"),
            body: t("COURT_UNFROZEN.body", { courts: item.payload.courtNames.join(", ") }),
            href: "/app/courts",
            tone: "ball",
          };
        case "GUEST_CHECKED_IN":
          return {
            title: t("GUEST_CHECKED_IN.title"),
            body: t("GUEST_CHECKED_IN.body", { guest: item.payload.guestName }),
            href: "/app/guests",
            tone: "neutral",
          };
      }
    },
    [t, labels, format, club],
  );
}
