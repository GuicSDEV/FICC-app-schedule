import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { Role } from "@ficc/db";
import {
  type Announcement,
  type AnnouncementInput,
  announcementSchema,
  type AutoScheduleInput,
  type AutoScheduleResult,
  autoScheduleSchema,
  type CircuitDetail,
  type CircuitInput,
  circuitSchema,
  type CircuitSummary,
  type CreateTournamentInput,
  createTournamentSchema,
  type DrawSwapInput,
  drawSwapSchema,
  type DrawView,
  type EntrySummary,
  isoDateSchema,
  type ManageEntryInput,
  manageEntrySchema,
  type MyTournamentItem,
  type OrderOfPlay,
  type OrganizerEntryInput,
  organizerEntrySchema,
  type OrganizersInput,
  organizersSchema,
  type PendingResults,
  type PlayerTitle,
  type PublicTournament,
  type PublishScheduleInput,
  publishScheduleSchema,
  type RegisterEntryInput,
  registerEntrySchema,
  type ScheduleBoard,
  type ScheduleMatchInput,
  scheduleMatchSchema,
  type TournamentCategoryInput,
  tournamentCategorySchema,
  type TournamentDetail,
  type TournamentListQuery,
  tournamentListQuerySchema,
  type TournamentOutcomeInput,
  tournamentOutcomeSchema,
  type TournamentResultInput,
  tournamentResultSchema,
  type TournamentStatusChangeInput,
  tournamentStatusChangeSchema,
  type TournamentSummary,
  type UpdateCircuitInput,
  updateCircuitSchema,
  type UpdateEntryInput,
  updateEntrySchema,
  type UpdateTournamentInput,
  updateTournamentSchema,
} from "@ficc/shared";
import { z } from "zod";

import { CurrentUser, Public, type RequestUser, Roles } from "../common/auth.decorators";
import { notFound } from "../common/domain.exception";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { ClubsService } from "../tenancy/clubs.service";
import { tenant } from "../tenancy/tenant-context";
import { CircuitsService } from "./circuits.service";
import { DrawService } from "./draw.service";
import { EntriesService } from "./entries.service";
import { OrderOfPlayService } from "./order-of-play.service";
import { ResultsService } from "./results.service";
import { TournamentsService } from "./tournaments.service";

const boardQuerySchema = z.object({ date: isoDateSchema });

/** Tournaments for members (players and organizers) and admins. */
@Controller("tournaments")
@Roles(Role.MEMBER, Role.ADMIN)
export class TournamentsController {
  constructor(
    private readonly tournaments: TournamentsService,
    private readonly entries: EntriesService,
    private readonly draw: DrawService,
    private readonly orderOfPlay: OrderOfPlayService,
    private readonly results: ResultsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(tournamentListQuerySchema)) query: TournamentListQuery,
  ): Promise<TournamentSummary[]> {
    return this.tournaments.list(user, query);
  }

  @Get("mine")
  mine(@CurrentUser() user: RequestUser): Promise<MyTournamentItem[]> {
    return this.tournaments.mine(user);
  }

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createTournamentSchema)) body: CreateTournamentInput,
  ): Promise<TournamentDetail> {
    return this.tournaments.create(user, body);
  }

  @Get(":id")
  detail(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<TournamentDetail> {
    return this.tournaments.detail(user, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTournamentSchema)) body: UpdateTournamentInput,
  ): Promise<TournamentDetail> {
    return this.tournaments.update(user, id, body);
  }

  @Post(":id/status")
  @HttpCode(200)
  status(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(tournamentStatusChangeSchema)) body: TournamentStatusChangeInput,
  ): Promise<TournamentDetail> {
    return this.tournaments.setStatus(user, id, body.status);
  }

  @Put(":id/organizers")
  organizers(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(organizersSchema)) body: OrganizersInput,
  ): Promise<TournamentDetail> {
    return this.tournaments.setOrganizers(user, id, body.userIds);
  }

  @Post(":id/duplicate")
  duplicate(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<TournamentDetail> {
    return this.tournaments.duplicate(user, id);
  }

  @Post(":id/categories")
  addCategory(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(tournamentCategorySchema)) body: TournamentCategoryInput,
  ): Promise<TournamentDetail> {
    return this.tournaments.addCategory(user, id, body);
  }

  @Patch(":id/categories/:categoryId")
  updateCategory(
    @CurrentUser() user: RequestUser,
    @Param("categoryId") categoryId: string,
    @Body(new ZodValidationPipe(tournamentCategorySchema)) body: TournamentCategoryInput,
  ): Promise<TournamentDetail> {
    return this.tournaments.updateCategory(user, categoryId, body);
  }

  @Delete(":id/categories/:categoryId")
  deleteCategory(
    @CurrentUser() user: RequestUser,
    @Param("categoryId") categoryId: string,
  ): Promise<TournamentDetail> {
    return this.tournaments.deleteCategory(user, categoryId);
  }

  @Post(":id/categories/:categoryId/entries")
  register(
    @CurrentUser() user: RequestUser,
    @Param("categoryId") categoryId: string,
    @Body(new ZodValidationPipe(registerEntrySchema)) body: RegisterEntryInput,
  ): Promise<EntrySummary> {
    return this.entries.register(user, categoryId, body);
  }

  @Post(":id/categories/:categoryId/entries/manual")
  addEntry(
    @CurrentUser() user: RequestUser,
    @Param("categoryId") categoryId: string,
    @Body(new ZodValidationPipe(organizerEntrySchema)) body: OrganizerEntryInput,
  ): Promise<EntrySummary> {
    return this.entries.add(user, categoryId, body);
  }

  @Get(":id/entries")
  listEntries(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<EntrySummary[]> {
    return this.entries.list(user, id);
  }

  @Get(":id/entries.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="inscricoes.csv"')
  csv(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<string> {
    return this.entries.csv(user, id);
  }

  @Get(":id/draws/:categoryId")
  drawView(
    @CurrentUser() user: RequestUser,
    @Param("categoryId") categoryId: string,
  ): Promise<DrawView> {
    return this.draw.view(user, categoryId);
  }

  @Post(":id/draws/:categoryId/generate")
  @HttpCode(200)
  generate(
    @CurrentUser() user: RequestUser,
    @Param("categoryId") categoryId: string,
  ): Promise<DrawView> {
    return this.draw.generate(user, categoryId);
  }

  @Post(":id/draws/:categoryId/swap")
  @HttpCode(200)
  swap(
    @CurrentUser() user: RequestUser,
    @Param("categoryId") categoryId: string,
    @Body(new ZodValidationPipe(drawSwapSchema)) body: DrawSwapInput,
  ): Promise<DrawView> {
    return this.draw.swap(user, categoryId, body.entryA, body.entryB);
  }

  @Post(":id/draws/:categoryId/publish")
  @HttpCode(200)
  publish(
    @CurrentUser() user: RequestUser,
    @Param("categoryId") categoryId: string,
  ): Promise<DrawView> {
    return this.draw.publish(user, categoryId);
  }

  @Get(":id/order-of-play")
  order(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<OrderOfPlay[]> {
    return this.orderOfPlay.orderOfPlay(user, id);
  }

  @Post(":id/order-of-play/publish")
  @HttpCode(204)
  publishDay(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(publishScheduleSchema)) body: PublishScheduleInput,
  ): Promise<void> {
    return this.orderOfPlay.publish(user, id, body.date);
  }

  @Get(":id/schedule-board")
  board(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Query(new ZodValidationPipe(boardQuerySchema)) query: { date: string },
  ): Promise<ScheduleBoard> {
    return this.orderOfPlay.board(user, id, query.date);
  }

  @Post(":id/auto-schedule")
  @HttpCode(200)
  autoSchedule(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(autoScheduleSchema)) body: AutoScheduleInput,
  ): Promise<AutoScheduleResult> {
    return this.orderOfPlay.autoSchedule(user, id, body);
  }

  @Post(":id/reschedule-frozen")
  @HttpCode(200)
  rescheduleFrozen(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(autoScheduleSchema)) body: AutoScheduleInput,
  ): Promise<AutoScheduleResult & { moved: number }> {
    return this.orderOfPlay.rescheduleFrozen(user, id, body);
  }

  @Get(":id/pending-results")
  pending(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<PendingResults> {
    return this.results.pending(user, id);
  }

  @Get(":id/announcements")
  announcements(@Param("id") id: string): Promise<Announcement[]> {
    return this.tournaments.announcements(id);
  }

  @Post(":id/announcements")
  announce(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(announcementSchema)) body: AnnouncementInput,
  ): Promise<Announcement[]> {
    return this.tournaments.announce(user, id, body);
  }
}

@Controller("tournament-entries")
@Roles(Role.MEMBER, Role.ADMIN)
export class TournamentEntriesController {
  constructor(private readonly entries: EntriesService) {}

  @Post(":id/accept")
  @HttpCode(200)
  accept(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<EntrySummary> {
    return this.entries.accept(user, id);
  }

  @Post(":id/decline")
  @HttpCode(204)
  decline(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<void> {
    return this.entries.decline(user, id);
  }

  @Post(":id/withdraw")
  @HttpCode(204)
  withdraw(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<void> {
    return this.entries.withdraw(user, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateEntrySchema)) body: UpdateEntryInput,
  ): Promise<EntrySummary> {
    return this.entries.update(user, id, body);
  }

  @Patch(":id/manage")
  manage(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(manageEntrySchema)) body: ManageEntryInput,
  ): Promise<EntrySummary> {
    return this.entries.manage(user, id, body);
  }
}

@Controller("tournament-matches")
@Roles(Role.MEMBER, Role.ADMIN)
export class TournamentMatchesController {
  constructor(
    private readonly orderOfPlay: OrderOfPlayService,
    private readonly results: ResultsService,
  ) {}

  @Post(":id/schedule")
  @HttpCode(204)
  schedule(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(scheduleMatchSchema)) body: ScheduleMatchInput,
  ): Promise<void> {
    return this.orderOfPlay.schedule(user, id, body);
  }

  @Delete(":id/schedule")
  @HttpCode(204)
  unschedule(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<void> {
    return this.orderOfPlay.unschedule(user, id);
  }

  @Post(":id/result")
  @HttpCode(204)
  report(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(tournamentResultSchema)) body: TournamentResultInput,
  ): Promise<void> {
    return this.results.report(
      user,
      id,
      body.sets.map((set) => ({ a: set.a, b: set.b, tiebreak: set.tiebreak })),
    );
  }

  @Post(":id/confirm")
  @HttpCode(204)
  confirm(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<void> {
    return this.results.confirm(user, id);
  }

  @Post(":id/outcome")
  @HttpCode(204)
  outcome(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(tournamentOutcomeSchema)) body: TournamentOutcomeInput,
  ): Promise<void> {
    return this.results.setOutcome(user, id, body);
  }
}

@Controller("circuits")
@Roles(Role.MEMBER, Role.ADMIN)
export class CircuitsController {
  constructor(private readonly circuits: CircuitsService) {}

  @Get()
  list(): Promise<CircuitSummary[]> {
    return this.circuits.list();
  }

  @Get(":id")
  detail(@Param("id") id: string): Promise<CircuitDetail> {
    return this.circuits.detail(id);
  }

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(circuitSchema)) body: CircuitInput,
  ): Promise<CircuitDetail> {
    return this.circuits.create(user, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCircuitSchema)) body: UpdateCircuitInput,
  ): Promise<CircuitDetail> {
    return this.circuits.update(user, id, body);
  }
}

@Controller("players")
export class PlayerTitlesController {
  constructor(private readonly tournaments: TournamentsService) {}

  /** Hall of fame: tournament titles and finals of a player. */
  @Get(":id/titles")
  titles(@Param("id") id: string): Promise<PlayerTitle[]> {
    return this.tournaments.titles(id);
  }
}

/** Read-only tournament page for anyone with the link (no login), e.g. shared on WhatsApp. */
@Controller("public/tournaments")
@Public()
export class PublicTournamentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clubs: ClubsService,
    private readonly tournaments: TournamentsService,
    private readonly draw: DrawService,
    private readonly orderOfPlay: OrderOfPlayService,
  ) {}

  @Get(":publicId")
  async show(@Param("publicId") publicId: string): Promise<PublicTournament> {
    const row = await this.prisma.tournament.findUnique({ where: { publicId } });
    if (!row || row.status === "DRAFT")
      throw notFound("TOURNAMENT_NOT_FOUND", "api.tournamentNotFound");
    const detail = await this.tournaments.detail(undefined, row.id);
    const { myEntries: _mine, canManage: _manage, organizers: _organizers, ...tournament } = detail;
    const draws: DrawView[] = [];
    for (const category of detail.categories.filter((entry) => entry.drawPublished)) {
      draws.push(await this.draw.view(undefined, category.id, false));
    }
    const club = await this.clubs.info(tenant());
    return {
      clubName: club.name,
      tournament,
      draws,
      schedule: await this.orderOfPlay.orderOfPlay(undefined, row.id, false),
    };
  }
}
