import type { BookingDetail } from "@ficc/shared";
import { Clock3, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";

const STUB_WIDTH = "6rem";

/** Status line for a booking from the viewer's point of view. */
export function BookingStatusBadge({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("ticket");
  if (booking.status === "CANCELLED") return <Badge tone="danger">{t("cancelled")}</Badge>;
  if (booking.status === "CONFIRMED") return <Badge tone="ballSoft">{t("confirmed")}</Badge>;
  const waiting = booking.players.filter((player) => player.status === "PENDING").length;
  return <Badge tone="warning">{t("waiting", { count: waiting })}</Badge>;
}

/**
 * A booking as a ticket: a stub in the court's surface color, a perforated edge and the details.
 * Used on the dashboard, in the booking-confirmed moment and in invites.
 */
export function TicketCard({
  booking,
  footer,
  status = true,
  className,
}: {
  booking: BookingDetail;
  footer?: ReactNode;
  /** Show the status badge (hidden inside invites, which explain themselves). */
  status?: boolean;
  className?: string;
}) {
  const t = useTranslations();
  const format = useFormat();
  const surface = booking.court.surface;
  return (
    <div
      className={cn(
        "relative flex overflow-hidden rounded-lg border border-border bg-card shadow-card",
        className,
      )}
    >
      <div
        style={{ width: STUB_WIDTH }}
        className={cn(
          "grain relative flex shrink-0 flex-col items-center justify-center gap-0.5 py-4 text-white",
          surface === "HARTRU" ? "bg-hartru" : "bg-saibro",
        )}
      >
        <span className="text-caption font-medium tracking-[0.14em] uppercase opacity-85">
          {t("common.court")}
        </span>
        <span className="font-display text-display leading-none font-bold">
          {booking.court.name.replace(/^Q/, "")}
        </span>
        <span className="text-caption font-medium opacity-90">
          {t(`labels.surface.${surface}`)}
        </span>
      </div>

      {/* Perforation: two notches and a dashed edge between stub and body. */}
      <span
        aria-hidden
        className="absolute -top-2.5 size-5 rounded-full border border-border bg-background"
        style={{ left: `calc(${STUB_WIDTH} - 0.625rem)` }}
      />
      <span
        aria-hidden
        className="absolute -bottom-2.5 size-5 rounded-full border border-border bg-background"
        style={{ left: `calc(${STUB_WIDTH} - 0.625rem)` }}
      />

      <div className="min-w-0 flex-1 border-l-2 border-dashed border-border-strong">
        <div className="space-y-3 p-4">
          <div className="min-w-0">
            <p className="truncate font-display text-title leading-tight font-semibold">
              {format.dayTitle(booking.date)}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-small whitespace-nowrap text-muted-foreground">
              <Clock3 aria-hidden className="size-3.5 shrink-0" />
              <span className="num">
                {booking.slot.startTime}–{booking.slot.endTime}
              </span>
              <span aria-hidden>·</span>
              <Users aria-hidden className="size-3.5 shrink-0" />
              {booking.type === "SINGLES" ? t("common.singles") : t("common.doubles")}
            </p>
          </div>
          {status ? (
            <div className="flex">
              <BookingStatusBadge booking={booking} />
            </div>
          ) : null}
          <ul className="flex flex-wrap gap-x-3 gap-y-2">
            {booking.players.map((player) => (
              <li
                key={player.user.id}
                className={cn(
                  "flex min-w-0 items-center gap-1.5",
                  player.status === "PENDING" && "opacity-60",
                )}
              >
                <Avatar name={player.user.name} src={player.user.photoUrl} size="xs" />
                <span className="max-w-[9rem] truncate text-small">
                  {player.user.name.split(" ")[0]}
                </span>
                {player.status === "PENDING" ? (
                  <span className="sr-only">{t("ticket.pendingPlayer")}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        {footer ? <div className="px-4 pb-4">{footer}</div> : null}
      </div>
    </div>
  );
}
