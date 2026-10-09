import { Injectable } from "@nestjs/common";
import {
  addDays,
  clubToday,
  fromDbDate,
  type IsoDate,
  isSlotPast,
  type ScheduleChangeKind,
  type ScheduleCellRef,
} from "@ficc/shared";

import { Clock } from "../common/clock";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { clubSettings, clubTimeZone } from "../tenancy/tenant-context";

export interface SlotCell {
  courtId: string;
  timeSlotId: string;
  date: Date | IsoDate;
}

const toRef = (cell: SlotCell): ScheduleCellRef => ({
  courtId: cell.courtId,
  timeSlotId: cell.timeSlotId,
  date: typeof cell.date === "string" ? cell.date : fromDbDate(cell.date),
});

/** Broadcasts grid changes and tells members watching a freed court + slot that it opened. */
@Injectable()
export class SlotEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  changed(kind: ScheduleChangeKind, cells: readonly SlotCell[]): void {
    const refs = cells.map(toRef);
    this.realtime.scheduleUpdated({
      kind,
      dates: [...new Set(refs.map((ref) => ref.date))],
      cells: refs,
    });
  }

  /** Whole days changed (e.g. a freeze covering every slot of some courts). */
  datesChanged(kind: ScheduleChangeKind, dates: readonly IsoDate[]): void {
    this.realtime.scheduleUpdated({ kind, dates: [...new Set(dates)], cells: [] });
  }

  /**
   * A slot became bookable again. Emits the change and sends SLOT_OPENED to members who favorited
   * that court + slot (except the people who freed it), when the slot is still in the future.
   */
  async released(
    kind: ScheduleChangeKind,
    cells: readonly SlotCell[],
    excludeUserIds: readonly string[] = [],
  ) {
    this.changed(kind, cells);
    const now = this.clock.now();
    // Only near slots: ending a series frees dozens of far-away dates.
    const lastDate = addDays(clubToday(now, clubTimeZone()), clubSettings().slotOpenedNotifyDays);
    for (const ref of cells.map(toRef).filter((cell) => cell.date <= lastDate)) {
      const [court, slot] = await Promise.all([
        this.prisma.court.findUnique({ where: { id: ref.courtId } }),
        this.prisma.timeSlot.findUnique({ where: { id: ref.timeSlotId } }),
      ]);
      if (!court || !slot || isSlotPast(ref.date, slot, now, clubTimeZone())) continue;
      const watchers = await this.prisma.slotFavorite.findMany({
        where: {
          courtId: ref.courtId,
          timeSlotId: ref.timeSlotId,
          userId: { notIn: [...excludeUserIds] },
        },
        select: { userId: true },
      });
      await this.notifications.notify(
        watchers.map((watcher) => watcher.userId),
        "SLOT_OPENED",
        {
          date: ref.date,
          courtId: court.id,
          courtName: court.name,
          timeSlotId: slot.id,
          startTime: slot.startTime,
        },
      );
    }
  }
}
