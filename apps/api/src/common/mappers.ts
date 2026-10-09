import type { Coach, Court, TimeSlot, User } from "@ficc/db";
import {
  type CoachSummary,
  type CourtSummary,
  type PlayerSummary,
  type SlotSummary,
  slotEndTime,
} from "@ficc/shared";

import { clubSettings } from "../tenancy/tenant-context";

/** Fields `toPlayerSummary` reads (see {@link playerSelect}). */
export type PlayerRow = Pick<User, "id" | "name" | "membershipId" | "photoUrl"> & {
  ratings: { elo: number }[];
  categories: { category: { key: string } }[];
};

/** A player as the apps see them; `elo` is the rating in the club's primary sport. */
export function toPlayerSummary(user: PlayerRow): PlayerSummary {
  return {
    id: user.id,
    name: user.name,
    membershipId: user.membershipId,
    photoUrl: user.photoUrl,
    elo: user.ratings[0]?.elo ?? clubSettings().eloInitialRating,
    categories: user.categories.map((entry) => entry.category.key),
  };
}

export function toCoachSummary(
  coach: Pick<Coach, "id" | "displayName" | "photoUrl" | "color">,
): CoachSummary {
  return {
    id: coach.id,
    displayName: coach.displayName,
    photoUrl: coach.photoUrl,
    color: coach.color,
  };
}

export function toCourtSummary(
  court: Pick<Court, "id" | "name" | "surface" | "sport" | "sortOrder">,
): CourtSummary {
  return {
    id: court.id,
    name: court.name,
    surface: court.surface,
    sport: court.sport,
    sortOrder: court.sortOrder,
  };
}

export function toSlotSummary(
  slot: Pick<TimeSlot, "id" | "startTime" | "durationMinutes" | "sortOrder">,
): SlotSummary {
  return {
    id: slot.id,
    startTime: slot.startTime,
    endTime: slotEndTime(slot),
    durationMinutes: slot.durationMinutes,
    sortOrder: slot.sortOrder,
  };
}

/** Prisma select for the fields `toPlayerSummary` needs (rating in the club's primary sport). */
export function playerSelect() {
  return {
    id: true,
    name: true,
    membershipId: true,
    photoUrl: true,
    ratings: { where: { sport: clubSettings().primarySport }, select: { elo: true } },
    categories: {
      select: { category: { select: { key: true } } },
      orderBy: { category: { sortOrder: "asc" } },
    },
  } as const;
}
