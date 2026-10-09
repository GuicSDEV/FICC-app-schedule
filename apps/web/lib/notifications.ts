import { FREEZE_REASON_LABELS, type NotificationItem } from "@ficc/shared";

import { formatDay, formatDelta } from "./format";

export type NotificationTone = "ball" | "lesson" | "danger" | "warning" | "neutral";

export interface NotificationCopy {
  title: string;
  body: string;
  href: string | null;
  tone: NotificationTone;
}

/** pt-BR text for each notification type, built from its payload. */
export function describeNotification(item: NotificationItem): NotificationCopy {
  switch (item.type) {
    case "BOOKING_INVITE":
      return {
        title: "Convite para jogar",
        body: `${item.payload.invitedBy} reservou a ${item.payload.courtName} em ${formatDay(item.payload.date)}, ${item.payload.startTime}. Confirme sua presença.`,
        href: "/app",
        tone: "ball",
      };
    case "BOOKING_CONFIRMED":
      return {
        title: "Reserva confirmada",
        body: `${item.payload.courtName} · ${formatDay(item.payload.date)}, ${item.payload.startTime}. Todos confirmaram.`,
        href: "/app",
        tone: "ball",
      };
    case "BOOKING_CANCELLED": {
      const reasons = {
        DECLINED: `${item.payload.byName ?? "Um jogador"} recusou o convite`,
        EXPIRED: "Nem todos confirmaram em 2 horas",
        CANCELLED_BY_PLAYER: `${item.payload.byName ?? "Um jogador"} cancelou`,
        COURT_FROZEN: "A quadra foi interditada",
        CANCELLED_BY_ADMIN: "Cancelada pela administração",
      } as const;
      return {
        title: "Reserva cancelada",
        body: `${item.payload.courtName} · ${formatDay(item.payload.date)}, ${item.payload.startTime}. ${reasons[item.payload.reason]}.`,
        href: "/app/courts",
        tone: "danger",
      };
    }
    case "SLOT_OPENED":
      return {
        title: "Horário liberado",
        body: `A ${item.payload.courtName} às ${item.payload.startTime} em ${formatDay(item.payload.date)} ficou livre.`,
        href: `/app/courts?date=${item.payload.date}`,
        tone: "ball",
      };
    case "LESSON_CANCELLED":
      return {
        title: "Aula cancelada",
        body: `${item.payload.byName} cancelou sua aula na ${item.payload.courtName}, ${formatDay(item.payload.date)} às ${item.payload.startTime}.`,
        href: "/coach",
        tone: "lesson",
      };
    case "MATCH_REPORTED":
      return {
        title: "Resultado para aprovar",
        body: `${item.payload.reportedBy} lançou ${item.payload.score}. Aprove ou conteste em até 48 h.`,
        href: `/app/matches/${item.payload.matchId}`,
        tone: "ball",
      };
    case "MATCH_CONFIRMED":
      return {
        title: item.payload.won ? "Vitória confirmada" : "Resultado confirmado",
        body: `${item.payload.score} · Elo ${item.payload.eloAfter} (${formatDelta(item.payload.delta)}).`,
        href: `/app/matches/${item.payload.matchId}`,
        tone: item.payload.won ? "ball" : "neutral",
      };
    case "MATCH_DISPUTED":
      return {
        title: "Resultado contestado",
        body: `${item.payload.disputedBy} contestou o placar${item.payload.comment ? `: “${item.payload.comment}”` : "."}`,
        href: `/app/matches/${item.payload.matchId}`,
        tone: "danger",
      };
    case "DISPUTE_RESOLVED":
      return {
        title: "Disputa resolvida",
        body:
          item.payload.action === "VOID"
            ? "A administração anulou a partida."
            : item.payload.action === "EDIT"
              ? "A administração corrigiu o placar e o Elo foi atualizado."
              : "A administração manteve o placar lançado.",
        href: `/app/matches/${item.payload.matchId}`,
        tone: "neutral",
      };
    case "COURT_FROZEN":
      return {
        title: `${FREEZE_REASON_LABELS[item.payload.reason]}: quadras interditadas`,
        body: `${item.payload.courtNames.join(", ")} fora de uso. Sua reserva ou aula pode ser afetada.`,
        href: "/app/courts",
        tone: "warning",
      };
    case "COURT_UNFROZEN":
      return {
        title: "Quadras liberadas",
        body: `${item.payload.courtNames.join(", ")} voltaram a funcionar.`,
        href: "/app/courts",
        tone: "ball",
      };
    case "GUEST_CHECKED_IN":
      return {
        title: "Convidado chegou",
        body: `${item.payload.guestName} entrou no clube.`,
        href: "/app/guests",
        tone: "neutral",
      };
  }
}
