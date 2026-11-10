import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { Role } from "@ficc/db";
import {
  type AdminCategoryItem,
  type CategoryInput,
  categoryInputSchema,
  type SeasonSummary,
  type StartSeasonInput,
  startSeasonSchema,
  type UpdateSeasonInput,
  updateSeasonSchema,
} from "@ficc/shared";

import { RequirePermissions, Roles } from "../common/auth.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CategoriesService } from "./categories.service";
import { SeasonsService } from "./seasons.service";

/** The ladder's seasons and classes (categories), managed by staff with RANKING_MANAGE. */
@Controller("admin/ranking")
@Roles(Role.ADMIN)
@RequirePermissions("RANKING_MANAGE")
export class AdminRankingController {
  constructor(
    private readonly seasons: SeasonsService,
    private readonly categories: CategoriesService,
  ) {}

  /** Ends the open season (final table saved, ratings reset) and starts a new one. */
  @Post("seasons")
  startSeason(
    @Body(new ZodValidationPipe(startSeasonSchema)) body: StartSeasonInput,
  ): Promise<SeasonSummary> {
    return this.seasons.start(body);
  }

  @Patch("seasons/:id")
  updateSeason(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSeasonSchema)) body: UpdateSeasonInput,
  ): Promise<SeasonSummary> {
    return this.seasons.update(id, body);
  }

  @Get("categories")
  listCategories(): Promise<AdminCategoryItem[]> {
    return this.categories.list();
  }

  @Post("categories")
  createCategory(
    @Body(new ZodValidationPipe(categoryInputSchema)) body: CategoryInput,
  ): Promise<AdminCategoryItem> {
    return this.categories.create(body);
  }

  @Patch("categories/:id")
  renameCategory(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(categoryInputSchema)) body: CategoryInput,
  ): Promise<AdminCategoryItem> {
    return this.categories.rename(id, body);
  }

  /** Members simply leave the class; their matches and ratings stay. */
  @Delete("categories/:id")
  @HttpCode(204)
  deleteCategory(@Param("id") id: string): Promise<void> {
    return this.categories.remove(id);
  }
}
