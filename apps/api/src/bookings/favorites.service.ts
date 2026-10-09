import { Injectable } from "@nestjs/common";
import type { SlotFavoriteInput, SlotFavoriteItem } from "@ficc/shared";

import { notFound } from "../common/domain.exception";
import { PrismaService } from "../prisma/prisma.service";

/** Court + slot watches; members get SLOT_OPENED when one frees up. */
@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<SlotFavoriteItem[]> {
    const favorites = await this.prisma.slotFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return favorites.map(({ id, courtId, timeSlotId }) => ({ id, courtId, timeSlotId }));
  }

  async add(userId: string, input: SlotFavoriteInput): Promise<SlotFavoriteItem> {
    const [court, slot] = await Promise.all([
      this.prisma.court.findUnique({ where: { id: input.courtId } }),
      this.prisma.timeSlot.findUnique({ where: { id: input.timeSlotId } }),
    ]);
    if (!court || !slot) throw notFound("SLOT_NOT_FOUND", "Quadra ou horário não encontrado.");
    const favorite = await this.prisma.slotFavorite.upsert({
      where: { userId_courtId_timeSlotId: { userId, ...input } },
      create: { userId, ...input },
      update: {},
    });
    return { id: favorite.id, courtId: favorite.courtId, timeSlotId: favorite.timeSlotId };
  }

  async remove(userId: string, input: SlotFavoriteInput): Promise<void> {
    await this.prisma.slotFavorite.deleteMany({ where: { userId, ...input } });
  }
}
