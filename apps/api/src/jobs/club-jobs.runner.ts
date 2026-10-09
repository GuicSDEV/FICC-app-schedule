import { Injectable, Logger } from "@nestjs/common";

import { BookingsService } from "../bookings/bookings.service";
import { FreezesService } from "../freezes/freezes.service";
import { GuestsService } from "../guests/guests.service";
import { LessonsService } from "../lessons/lessons.service";
import { MatchesService } from "../matches/matches.service";
import { ClubsService } from "../tenancy/clubs.service";
import { runWithTenant } from "../tenancy/tenant-context";
import type { ClubJobName } from "./club-jobs";

/** Runs a job for every active club, each inside its own tenant context. */
@Injectable()
export class ClubJobsRunner {
  private readonly logger = new Logger(ClubJobsRunner.name);

  constructor(
    private readonly clubs: ClubsService,
    private readonly bookings: BookingsService,
    private readonly matches: MatchesService,
    private readonly lessons: LessonsService,
    private readonly freezes: FreezesService,
    private readonly guests: GuestsService,
  ) {}

  /** Returns a per-club summary; one club failing never stops the others. */
  async run(name: ClubJobName): Promise<Record<string, unknown>> {
    const results: Record<string, unknown> = {};
    for (const club of await this.clubs.activeClubs()) {
      try {
        const tenant = await this.clubs.tenantById(club.id);
        results[club.slug] = await runWithTenant(tenant, () => this.handlers[name]());
      } catch (error) {
        this.logger.error(`${name} failed for ${club.slug}: ${(error as Error).message}`);
        results[club.slug] = { error: (error as Error).message };
      }
    }
    return results;
  }

  private readonly handlers: Record<ClubJobName, () => Promise<unknown>> = {
    "bookings.expire-pending": () => this.bookings.expirePending(),
    "matches.auto-approve": () => this.matches.autoApprove(),
    "lessons.generate": () => this.lessons.generateSeriesOccurrences(),
    "freezes.announce-expired": () => this.freezes.announceExpired(),
    "guests.anonymize-expired": () => this.guests.anonymizeExpired(),
    "guests.encrypt-legacy": () => this.guests.encryptLegacyDocuments(),
  };
}
