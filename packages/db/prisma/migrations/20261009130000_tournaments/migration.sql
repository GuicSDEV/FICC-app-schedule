-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'DRAW_PUBLISHED', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DrawFormat" AS ENUM ('SINGLE_ELIMINATION', 'GROUPS_THEN_KNOCKOUT');

-- CreateEnum
CREATE TYPE "ScoreFormat" AS ENUM ('BEST_OF_3_MATCH_TIEBREAK', 'BEST_OF_3', 'PRO_SET_8');

-- CreateEnum
CREATE TYPE "SeedingMethod" AS ENUM ('ELO', 'CIRCUIT');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('PENDING_PARTNER', 'PENDING_APPROVAL', 'CONFIRMED', 'WAITLISTED', 'WITHDRAWN', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'EXEMPT');

-- CreateEnum
CREATE TYPE "TournamentStage" AS ENUM ('GROUP', 'KNOCKOUT');

-- CreateEnum
CREATE TYPE "MatchOutcome" AS ENUM ('PLAYED', 'WALKOVER', 'RETIRED', 'DISQUALIFIED', 'BYE');

-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('NONE', 'REPORTED', 'CONFIRMED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_ENTRY_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_PARTNER_INVITE';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_DRAW_PUBLISHED';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_MATCH_SCHEDULED';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_MATCH_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_RESULT_REPORTED';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_ADVANCED';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_ELIMINATED';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_CHAMPION';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_ANNOUNCEMENT';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_RESULT_OVERDUE';

-- AlterTable
ALTER TABLE "SlotOccupancy" ADD COLUMN     "tournamentMatchId" TEXT;

-- CreateTable
CREATE TABLE "Circuit" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL DEFAULT current_setting('app.club_id'::text, true),
    "name" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "pointsTable" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Circuit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CircuitCategory" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL DEFAULT current_setting('app.club_id'::text, true),
    "circuitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CircuitCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL DEFAULT current_setting('app.club_id'::text, true),
    "publicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "coverImageUrl" TEXT,
    "sponsorLogos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "courtIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "registrationOpensAt" TIMESTAMPTZ(3),
    "registrationClosesAt" TIMESTAMPTZ(3),
    "allowGuests" BOOLEAN NOT NULL DEFAULT false,
    "feeAmountCents" INTEGER,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "restMinutes" INTEGER NOT NULL DEFAULT 60,
    "circuitId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentOrganizer" (
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TournamentOrganizer_pkey" PRIMARY KEY ("tournamentId","userId")
);

-- CreateTable
CREATE TABLE "TournamentScheduleDay" (
    "tournamentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentScheduleDay_pkey" PRIMARY KEY ("tournamentId","date")
);

-- CreateTable
CREATE TABLE "TournamentCategory" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL DEFAULT current_setting('app.club_id'::text, true),
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entryType" "MatchFormat" NOT NULL,
    "drawFormat" "DrawFormat" NOT NULL,
    "groupSize" INTEGER NOT NULL DEFAULT 4,
    "advancePerGroup" INTEGER NOT NULL DEFAULT 2,
    "maxEntries" INTEGER NOT NULL,
    "scoreFormat" "ScoreFormat" NOT NULL DEFAULT 'BEST_OF_3_MATCH_TIEBREAK',
    "countsForElo" BOOLEAN NOT NULL DEFAULT false,
    "seeding" "SeedingMethod" NOT NULL DEFAULT 'ELO',
    "circuitCategoryId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "drawGeneratedAt" TIMESTAMPTZ(3),
    "drawPublishedAt" TIMESTAMPTZ(3),
    "championEntryId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentEntry" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL DEFAULT current_setting('app.club_id'::text, true),
    "categoryId" TEXT NOT NULL,
    "status" "EntryStatus" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "seed" INTEGER,
    "note" TEXT,
    "restrictions" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TournamentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentEntryPlayer" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "userId" TEXT,
    "guestName" TEXT,
    "guestPhone" TEXT,
    "acceptedAt" TIMESTAMPTZ(3),

    CONSTRAINT "TournamentEntryPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentGroup" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL DEFAULT current_setting('app.club_id'::text, true),
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "TournamentGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentGroupMember" (
    "groupId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "TournamentGroupMember_pkey" PRIMARY KEY ("groupId","entryId")
);

-- CreateTable
CREATE TABLE "TournamentMatch" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL DEFAULT current_setting('app.club_id'::text, true),
    "tournamentId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "stage" "TournamentStage" NOT NULL,
    "groupId" TEXT,
    "round" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "entryAId" TEXT,
    "entryBId" TEXT,
    "nextMatchId" TEXT,
    "nextSide" "TeamSide",
    "winnerEntryId" TEXT,
    "outcome" "MatchOutcome",
    "resultStatus" "ResultStatus" NOT NULL DEFAULT 'NONE',
    "sets" JSONB NOT NULL DEFAULT '[]',
    "reportedById" TEXT,
    "reportedAt" TIMESTAMPTZ(3),
    "approvalDeadline" TIMESTAMPTZ(3),
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMPTZ(3),
    "scheduledDate" DATE,
    "courtId" TEXT,
    "timeSlotId" TEXT,
    "scheduleNotifiedAt" TIMESTAMPTZ(3),
    "overdueAlertedAt" TIMESTAMPTZ(3),
    "ratedMatchId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TournamentMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentAnnouncement" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL DEFAULT current_setting('app.club_id'::text, true),
    "tournamentId" TEXT NOT NULL,
    "categoryId" TEXT,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Circuit_clubId_season_idx" ON "Circuit"("clubId", "season");

-- CreateIndex
CREATE UNIQUE INDEX "CircuitCategory_circuitId_name_key" ON "CircuitCategory"("circuitId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Tournament_publicId_key" ON "Tournament"("publicId");

-- CreateIndex
CREATE INDEX "Tournament_clubId_status_startDate_idx" ON "Tournament"("clubId", "status", "startDate");

-- CreateIndex
CREATE INDEX "TournamentOrganizer_userId_idx" ON "TournamentOrganizer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentCategory_championEntryId_key" ON "TournamentCategory"("championEntryId");

-- CreateIndex
CREATE INDEX "TournamentCategory_tournamentId_idx" ON "TournamentCategory"("tournamentId");

-- CreateIndex
CREATE INDEX "TournamentEntry_categoryId_status_idx" ON "TournamentEntry"("categoryId", "status");

-- CreateIndex
CREATE INDEX "TournamentEntryPlayer_userId_idx" ON "TournamentEntryPlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentEntryPlayer_entryId_position_key" ON "TournamentEntryPlayer"("entryId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentGroup_categoryId_name_key" ON "TournamentGroup"("categoryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentMatch_ratedMatchId_key" ON "TournamentMatch"("ratedMatchId");

-- CreateIndex
CREATE INDEX "TournamentMatch_tournamentId_scheduledDate_idx" ON "TournamentMatch"("tournamentId", "scheduledDate");

-- CreateIndex
CREATE INDEX "TournamentMatch_clubId_resultStatus_scheduledDate_idx" ON "TournamentMatch"("clubId", "resultStatus", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentMatch_categoryId_stage_groupId_round_position_key" ON "TournamentMatch"("categoryId", "stage", "groupId", "round", "position");

-- CreateIndex
CREATE INDEX "TournamentAnnouncement_tournamentId_createdAt_idx" ON "TournamentAnnouncement"("tournamentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SlotOccupancy_tournamentMatchId_key" ON "SlotOccupancy"("tournamentMatchId");

-- AddForeignKey
ALTER TABLE "SlotOccupancy" ADD CONSTRAINT "SlotOccupancy_tournamentMatchId_fkey" FOREIGN KEY ("tournamentMatchId") REFERENCES "TournamentMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Circuit" ADD CONSTRAINT "Circuit_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircuitCategory" ADD CONSTRAINT "CircuitCategory_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircuitCategory" ADD CONSTRAINT "CircuitCategory_circuitId_fkey" FOREIGN KEY ("circuitId") REFERENCES "Circuit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_circuitId_fkey" FOREIGN KEY ("circuitId") REFERENCES "Circuit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentOrganizer" ADD CONSTRAINT "TournamentOrganizer_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentOrganizer" ADD CONSTRAINT "TournamentOrganizer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentScheduleDay" ADD CONSTRAINT "TournamentScheduleDay_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentCategory" ADD CONSTRAINT "TournamentCategory_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentCategory" ADD CONSTRAINT "TournamentCategory_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentCategory" ADD CONSTRAINT "TournamentCategory_circuitCategoryId_fkey" FOREIGN KEY ("circuitCategoryId") REFERENCES "CircuitCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentCategory" ADD CONSTRAINT "TournamentCategory_championEntryId_fkey" FOREIGN KEY ("championEntryId") REFERENCES "TournamentEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TournamentCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEntryPlayer" ADD CONSTRAINT "TournamentEntryPlayer_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "TournamentEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEntryPlayer" ADD CONSTRAINT "TournamentEntryPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentGroup" ADD CONSTRAINT "TournamentGroup_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentGroup" ADD CONSTRAINT "TournamentGroup_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TournamentCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentGroupMember" ADD CONSTRAINT "TournamentGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TournamentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentGroupMember" ADD CONSTRAINT "TournamentGroupMember_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "TournamentEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TournamentCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TournamentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_entryAId_fkey" FOREIGN KEY ("entryAId") REFERENCES "TournamentEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_entryBId_fkey" FOREIGN KEY ("entryBId") REFERENCES "TournamentEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_winnerEntryId_fkey" FOREIGN KEY ("winnerEntryId") REFERENCES "TournamentEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_nextMatchId_fkey" FOREIGN KEY ("nextMatchId") REFERENCES "TournamentMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "TimeSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_ratedMatchId_fkey" FOREIGN KEY ("ratedMatchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentAnnouncement" ADD CONSTRAINT "TournamentAnnouncement_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentAnnouncement" ADD CONSTRAINT "TournamentAnnouncement_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentAnnouncement" ADD CONSTRAINT "TournamentAnnouncement_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TournamentCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentAnnouncement" ADD CONSTRAINT "TournamentAnnouncement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A slot occupancy belongs to exactly one booking, lesson or tournament match.
ALTER TABLE "SlotOccupancy" DROP CONSTRAINT "SlotOccupancy_single_owner";
ALTER TABLE "SlotOccupancy" ADD CONSTRAINT "SlotOccupancy_single_owner"
  CHECK (num_nonnulls("bookingId", "lessonId", "tournamentMatchId") = 1);

-- An entry's player is either a member or a guest / external player.
ALTER TABLE "TournamentEntryPlayer" ADD CONSTRAINT "TournamentEntryPlayer_member_or_guest"
  CHECK (("userId" IS NOT NULL) <> ("guestName" IS NOT NULL));

-- A tournament match is either unscheduled or has date, court and slot.
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_schedule_complete"
  CHECK (num_nonnulls("scheduledDate", "courtId", "timeSlotId") IN (0, 3));

ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_dates_in_order"
  CHECK ("endDate" >= "startDate");
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_rest_minutes"
  CHECK ("restMinutes" >= 0);
ALTER TABLE "TournamentCategory" ADD CONSTRAINT "TournamentCategory_groups"
  CHECK ("groupSize" >= 3 AND "advancePerGroup" >= 1 AND "advancePerGroup" < "groupSize" AND "maxEntries" >= 2);
