import { type NotificationItem, translate } from "@ficc/shared";

import { tenantOrUndefined } from "../tenancy/tenant-context";

/** What a notification says on the phone, and the screen it opens. */
export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** The text, in the club's language; null for notifications that stay in the app. */
export function pushMessage(item: NotificationItem): PushMessage | null {
  const tenant = tenantOrUndefined();
  const locale = tenant?.locale;
  const day = (date: string) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      timeZone: "UTC",
    })
      .format(new Date(`${date}T12:00:00Z`))
      .replace(".", "");
  const text = (key: string, params: Record<string, string | number>) => ({
    title: translate(`push.${key}.title`, {}, locale),
    body: translate(`push.${key}.body`, params, locale),
  });
  const tag = `${item.type}-${item.id}`;
  switch (item.type) {
    case "BOOKING_INVITE": {
      const { invitedBy, courtName, date, startTime } = item.payload;
      return {
        ...text(item.type, { invitedBy, court: courtName, day: day(date), time: startTime }),
        url: "/app",
        tag,
      };
    }
    case "BOOKING_CONFIRMED":
    case "BOOKING_CANCELLED": {
      const { courtName, date, startTime } = item.payload;
      return {
        ...text(item.type, { court: courtName, day: day(date), time: startTime }),
        url: "/app",
        tag,
      };
    }
    case "BOOKING_PLAYER_LEFT": {
      const { playerName, courtName, date, startTime } = item.payload;
      return {
        ...text(item.type, {
          name: playerName,
          court: courtName,
          day: day(date),
          time: startTime,
        }),
        url: "/app",
        tag,
      };
    }
    case "MATCH_REPORTED": {
      const { reportedBy, score, matchId } = item.payload;
      return { ...text(item.type, { reportedBy, score }), url: `/app/matches/${matchId}`, tag };
    }
    case "COURT_AVAILABLE":
      return {
        ...text(item.type, { court: item.payload.courtName }),
        url: "/app/courts-now",
        tag,
      };
    case "FRIEND_RANKING_ADDED": {
      const { addedBy, rankingName, rankingId } = item.payload;
      return {
        ...text(item.type, { name: addedBy, ranking: rankingName }),
        url: `/app/ranking/friends/${rankingId}`,
        tag,
      };
    }
    default:
      return null;
  }
}
