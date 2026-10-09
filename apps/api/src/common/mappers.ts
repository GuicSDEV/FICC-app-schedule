import type { Coach, Court, TimeSlot, User } from "@ficc/db";
import {
  type CoachSummary,
  type CourtSummary,
  type PlayerSummary,
  type SlotSummary,
  slotEndTime,
} from "@ficc/shared";

export function toPlayerSummary(
  user: Pick<User, "id" | "name" | "membershipId" | "photoUrl" | "elo" | "categories">,
): PlayerSummary {
  return {
    id: user.id,
    name: user.name,
    membershipId: user.membershipId,
    photoUrl: user.photoUrl,
    elo: user.elo,
    categories: user.categories,
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
  court: Pick<Court, "id" | "name" | "surface" | "sortOrder">,
): CourtSummary {
  return { id: court.id, name: court.name, surface: court.surface, sortOrder: court.sortOrder };
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

/** Prisma select for the fields `toPlayerSummary` needs. */
export const playerSelect = {
  id: true,
  name: true,
  membershipId: true,
  photoUrl: true,
  elo: true,
  categories: true,
} as const;
