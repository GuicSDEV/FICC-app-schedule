import { Injectable } from "@nestjs/common";
import { type AdminCategoryItem, type CategoryInput } from "@ficc/shared";

import { conflict, notFound } from "../common/domain.exception";
import { isUniqueViolation } from "../common/transactions";
import { PrismaService } from "../prisma/prisma.service";

/** "Classe C" → "CLASSE_C": the stable key the APIs and filters use. */
function keyOf(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "CLASSE";
}

/** The club's ranking classes (Classe A, Feminino…), created and renamed by staff. */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<AdminCategoryItem[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { members: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      sortOrder: row.sortOrder,
      members: row._count.members,
    }));
  }

  async create(input: CategoryInput): Promise<AdminCategoryItem> {
    const existing = await this.prisma.category.findMany({
      select: { key: true, name: true, sortOrder: true },
    });
    if (existing.some((row) => row.name.toLowerCase() === input.name.toLowerCase())) {
      throw conflict("CATEGORY_NAME_TAKEN", "api.categoryNameTaken");
    }
    // A unique key even when two names fold to the same letters ("Sênior" / "Senior").
    const base = keyOf(input.name);
    let key = base;
    for (let n = 2; existing.some((row) => row.key === key); n += 1) key = `${base}_${n}`;
    const created = await this.prisma.category
      .create({
        data: {
          key,
          name: input.name,
          sortOrder: Math.max(0, ...existing.map((row) => row.sortOrder)) + 1,
        },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error))
          throw conflict("CATEGORY_NAME_TAKEN", "api.categoryNameTaken");
        throw error;
      });
    return { ...created, members: 0 };
  }

  async rename(id: string, input: CategoryInput): Promise<AdminCategoryItem> {
    const category = await this.prisma.category.findFirst({
      where: { id },
      include: { _count: { select: { members: true } } },
    });
    if (!category) throw notFound("CATEGORY_NOT_FOUND", "api.unknownCategory");
    const clash = await this.prisma.category.findFirst({
      where: { id: { not: id }, name: { equals: input.name, mode: "insensitive" } },
    });
    if (clash) throw conflict("CATEGORY_NAME_TAKEN", "api.categoryNameTaken");
    const updated = await this.prisma.category.update({
      where: { id },
      data: { name: input.name },
    });
    return {
      id: updated.id,
      key: updated.key,
      name: updated.name,
      sortOrder: updated.sortOrder,
      members: category._count.members,
    };
  }

  async remove(id: string): Promise<void> {
    const category = await this.prisma.category.findFirst({ where: { id } });
    if (!category) throw notFound("CATEGORY_NOT_FOUND", "api.unknownCategory");
    await this.prisma.category.delete({ where: { id } });
  }
}
