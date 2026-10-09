import { Injectable } from "@nestjs/common";
import { type ClubInfo, clubSettingsSchema, type UpdateClubSettingsInput } from "@ficc/shared";

import { unprocessable } from "../common/domain.exception";
import { PrismaService } from "../prisma/prisma.service";
import { SlotEventsService } from "../schedule/slot-events.service";
import { ClubsService } from "../tenancy/clubs.service";
import { runWithTenant, tenant } from "../tenancy/tenant-context";

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clubs: ClubsService,
    private readonly slotEvents: SlotEventsService,
  ) {}

  /** Merges the change over the current rules, validates the whole set and stores it. */
  async update(input: UpdateClubSettingsInput): Promise<ClubInfo> {
    const current = tenant();
    const next = clubSettingsSchema.parse({ ...current.settings, ...input });
    const times = [...new Set(Object.values(next.scheduleGrids).flatMap((list) => list ?? []))];
    if (times.length > 0) {
      const known = await this.prisma.timeSlot.findMany({
        where: { startTime: { in: times }, isActive: true },
        select: { startTime: true },
      });
      const missing = times.find((time) => !known.some((slot) => slot.startTime === time));
      if (missing) {
        throw unprocessable("GRID_SLOT_UNKNOWN", {
          key: "api.gridSlotUnknown",
          params: { time: missing },
        });
      }
    }
    await this.prisma.clubSettings.upsert({
      where: { clubId: current.clubId },
      create: { clubId: current.clubId, values: next },
      update: { values: next },
    });
    this.clubs.invalidate();
    const updated = await this.clubs.tenantById(current.clubId);
    if (input.scheduleGrids || input.dayModes || input.bookingOpening !== undefined) {
      // Calendars refetch: grids, modes or the opening rule changed.
      this.slotEvents.datesChanged("plan.changed", []);
    }
    return runWithTenant(updated, () => this.clubs.info(updated));
  }
}
