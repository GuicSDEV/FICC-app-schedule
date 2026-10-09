"use client";

import {
  type FreezeUpdatedEvent,
  type LeaderboardUpdatedEvent,
  type NotificationItem,
  SOCKET_EVENTS,
  type ScheduleUpdatedEvent,
  type TournamentUpdatedEvent,
  type CourtsNowUpdatedEvent,
  type NewsUpdatedEvent,
} from "@ficc/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

import { API_URL, refreshSession } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

import { useSession } from "./session-provider";

interface SocketEvents {
  [SOCKET_EVENTS.scheduleUpdated]: ScheduleUpdatedEvent;
  [SOCKET_EVENTS.notificationCreated]: NotificationItem;
  [SOCKET_EVENTS.leaderboardUpdated]: LeaderboardUpdatedEvent;
  [SOCKET_EVENTS.freezeUpdated]: FreezeUpdatedEvent;
  [SOCKET_EVENTS.tournamentUpdated]: TournamentUpdatedEvent;
  [SOCKET_EVENTS.courtsNowUpdated]: CourtsNowUpdatedEvent;
  [SOCKET_EVENTS.newsUpdated]: NewsUpdatedEvent;
}

type Listener<E extends keyof SocketEvents> = (payload: SocketEvents[E]) => void;

const SocketContext = createContext<Socket | null>(null);

/**
 * Connects to the API once signed in and keeps queries fresh: every server event invalidates the
 * queries it affects. Components that need the payload (to animate a cell, celebrate an Elo
 * change…) subscribe with useSocketEvent.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const client = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);

  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let connection: Socket | null = null;
    // socket.io loads after the first paint: it is not needed to show the page.
    void import("socket.io-client").then(({ io }) => {
      if (cancelled) return;
      connection = io(API_URL, {
        withCredentials: true,
        transports: ["websocket"],
        reconnectionDelayMax: 8000,
      });
      wire(connection);
      setSocket(connection);
    });

    function wire(connection: Socket) {
      connection.on(SOCKET_EVENTS.scheduleUpdated, () => {
        void client.invalidateQueries({ queryKey: queryKeys.schedule() });
        void client.invalidateQueries({ queryKey: queryKeys.coachAgenda() });
        void client.invalidateQueries({ queryKey: queryKeys.coachLessons() });
        void client.invalidateQueries({ queryKey: queryKeys.bookingsMine });
      });
      connection.on(SOCKET_EVENTS.notificationCreated, (notification: NotificationItem) => {
        void client.invalidateQueries({ queryKey: queryKeys.notifications });
        if (notification.type.startsWith("BOOKING") || notification.type === "SLOT_OPENED") {
          void client.invalidateQueries({ queryKey: queryKeys.bookingsMine });
        }
        if (notification.type.startsWith("MATCH") || notification.type === "DISPUTE_RESOLVED") {
          void client.invalidateQueries({ queryKey: queryKeys.matchesMine });
          void client.invalidateQueries({ queryKey: queryKeys.me });
        }
        if (notification.type.startsWith("TOURNAMENT")) {
          void client.invalidateQueries({ queryKey: queryKeys.tournaments.root });
        }
        if (notification.type === "COURT_AVAILABLE") {
          void client.invalidateQueries({ queryKey: queryKeys.freePlay });
        }
        if (notification.type === "BOOKING_SUSPENDED" || notification.type === "MEMBER_APPROVED") {
          void client.invalidateQueries({ queryKey: queryKeys.me });
        }
        if (notification.type === "GUEST_CHECKED_IN") {
          void client.invalidateQueries({ queryKey: queryKeys.guestPasses });
        }
      });
      connection.on(SOCKET_EVENTS.leaderboardUpdated, () => {
        void client.invalidateQueries({ queryKey: queryKeys.leaderboard() });
        void client.invalidateQueries({ queryKey: ["players"] });
        void client.invalidateQueries({ queryKey: ["h2h"] });
      });
      connection.on(SOCKET_EVENTS.tournamentUpdated, (event: TournamentUpdatedEvent) => {
        void client.invalidateQueries({
          queryKey: queryKeys.tournaments.detail(event.tournamentId),
        });
        void client.invalidateQueries({ queryKey: ["tournaments", "list"] });
        void client.invalidateQueries({ queryKey: queryKeys.tournaments.mine });
        if (event.kind === "result")
          void client.invalidateQueries({ queryKey: queryKeys.circuits });
      });
      connection.on(SOCKET_EVENTS.courtsNowUpdated, () => {
        void client.invalidateQueries({ queryKey: queryKeys.freePlay });
      });
      connection.on(SOCKET_EVENTS.newsUpdated, () => {
        void client.invalidateQueries({ queryKey: queryKeys.news });
      });
      connection.on(SOCKET_EVENTS.freezeUpdated, () => {
        void client.invalidateQueries({ queryKey: queryKeys.freezesActive });
        void client.invalidateQueries({ queryKey: queryKeys.schedule() });
        void client.invalidateQueries({ queryKey: queryKeys.admin.freezes });
      });
      // The access cookie lasts 15 minutes; when the server drops us, refresh and reconnect.
      connection.on("disconnect", (reason) => {
        if (reason === "io server disconnect") {
          void refreshSession().then((ok) => ok && connection.connect());
        }
      });
      connection.on("connect_error", () => {
        void refreshSession();
      });
    }

    return () => {
      cancelled = true;
      connection?.removeAllListeners();
      connection?.disconnect();
      setSocket(null);
    };
  }, [userId, client]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

/** Subscribes to one socket event while the component is mounted. */
export function useSocketEvent<E extends keyof SocketEvents>(
  event: E,
  listener: Listener<E>,
): void {
  const socket = useContext(SocketContext);
  const latest = useRef(listener);
  useEffect(() => {
    latest.current = listener;
  });
  useEffect(() => {
    if (!socket) return;
    const handler = (payload: SocketEvents[E]) => latest.current(payload);
    socket.on(event as string, handler);
    return () => {
      socket.off(event as string, handler);
    };
  }, [socket, event]);
}
