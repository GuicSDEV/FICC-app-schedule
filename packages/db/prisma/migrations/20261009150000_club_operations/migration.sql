-- CreateEnum
CREATE TYPE "CourtMode" AS ENUM ('BOOKING', 'FREE_PLAY');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('WAITING', 'OFFERED', 'CLAIMED', 'EXPIRED', 'LEFT');

-- CreateEnum
CREATE TYPE "NoShowKind" AS ENUM ('NO_SHOW', 'LATE_CANCEL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'MEMBER_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'COURT_AVAILABLE';
ALTER TYPE "NotificationType" ADD VALUE 'NEWS_POSTED';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_SUSPENDED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bookingSuspendedUntil" TIMESTAMPTZ(3),
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMPTZ(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "ScheduleException" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL DEFAULT current_setting('app.club_id'::text, true),
    "date" DATE NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "slotTimes" JSONB,
    "mode" "CourtMode",
    "closedCourtIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ScheduleException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourtCheckIn" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL DEFAULT current_setting('app.club_id'::text, true),
    "courtId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),
    "endedReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourtCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourtCheckInPlayer" (
    "checkInId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CourtCheckInPlayer_pkey" PRIMARY KEY ("checkInId","userId")
);

-- CreateTable
CREATE TABLE "CourtQueueEntry" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL DEFAULT current_setting('app.club_id'::text, true),
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'WAITING',
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offeredCourtId" TEXT,
    "offeredAt" TIMESTAMPTZ(3),
    "offerExpiresAt" TIMESTAMPTZ(3),
    "resolvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CourtQueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffRole" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL DEFAULT current_setting('app.club_id'::text, true),
    "key" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StaffRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStaffRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserStaffRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL DEFAULT current_setting('app.club_id'::text, true),
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoShow" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL DEFAULT current_setting('app.club_id'::text, true),
    "userId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" "NoShowKind" NOT NULL,
    "markedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoShow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsPost" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL DEFAULT current_setting('app.club_id'::text, true),
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "eventDate" DATE,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "NewsPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsReaction" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsReaction_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "NewsRead" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsRead_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleException_clubId_date_key" ON "ScheduleException"("clubId", "date");

-- CreateIndex
CREATE INDEX "CourtCheckIn_clubId_endedAt_idx" ON "CourtCheckIn"("clubId", "endedAt");

-- CreateIndex
CREATE INDEX "CourtCheckIn_courtId_endedAt_idx" ON "CourtCheckIn"("courtId", "endedAt");

-- CreateIndex
CREATE INDEX "CourtCheckInPlayer_userId_idx" ON "CourtCheckInPlayer"("userId");

-- CreateIndex
CREATE INDEX "CourtQueueEntry_clubId_date_status_joinedAt_idx" ON "CourtQueueEntry"("clubId", "date", "status", "joinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffRole_clubId_name_key" ON "StaffRole"("clubId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "StaffRole_clubId_key_key" ON "StaffRole"("clubId", "key");

-- CreateIndex
CREATE INDEX "UserStaffRole_roleId_idx" ON "UserStaffRole"("roleId");

-- CreateIndex
CREATE INDEX "AuditLog_clubId_createdAt_idx" ON "AuditLog"("clubId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "NoShow_userId_createdAt_idx" ON "NoShow"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NoShow_bookingId_userId_key" ON "NoShow"("bookingId", "userId");

-- CreateIndex
CREATE INDEX "NewsPost_clubId_deletedAt_pinned_publishedAt_idx" ON "NewsPost"("clubId", "deletedAt", "pinned", "publishedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtCheckIn" ADD CONSTRAINT "CourtCheckIn_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtCheckIn" ADD CONSTRAINT "CourtCheckIn_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtCheckIn" ADD CONSTRAINT "CourtCheckIn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtCheckInPlayer" ADD CONSTRAINT "CourtCheckInPlayer_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "CourtCheckIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtCheckInPlayer" ADD CONSTRAINT "CourtCheckInPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtQueueEntry" ADD CONSTRAINT "CourtQueueEntry_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtQueueEntry" ADD CONSTRAINT "CourtQueueEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtQueueEntry" ADD CONSTRAINT "CourtQueueEntry_offeredCourtId_fkey" FOREIGN KEY ("offeredCourtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRole" ADD CONSTRAINT "StaffRole_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStaffRole" ADD CONSTRAINT "UserStaffRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStaffRole" ADD CONSTRAINT "UserStaffRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "StaffRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoShow" ADD CONSTRAINT "NoShow_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoShow" ADD CONSTRAINT "NoShow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoShow" ADD CONSTRAINT "NoShow_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoShow" ADD CONSTRAINT "NoShow_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsPost" ADD CONSTRAINT "NewsPost_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsPost" ADD CONSTRAINT "NewsPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsReaction" ADD CONSTRAINT "NewsReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "NewsPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsReaction" ADD CONSTRAINT "NewsReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsRead" ADD CONSTRAINT "NewsRead_postId_fkey" FOREIGN KEY ("postId") REFERENCES "NewsPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsRead" ADD CONSTRAINT "NewsRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A court has at most one active check-in, and a member waits in at most one place in line.
CREATE UNIQUE INDEX "CourtCheckIn_one_active_per_court" ON "CourtCheckIn"("courtId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "CourtQueueEntry_one_active_per_user" ON "CourtQueueEntry"("userId", "date")
  WHERE "status" IN ('WAITING', 'OFFERED');

ALTER TABLE "CourtCheckIn" ADD CONSTRAINT "CourtCheckIn_ends_after_start" CHECK ("endsAt" > "startedAt");
ALTER TABLE "CourtQueueEntry" ADD CONSTRAINT "CourtQueueEntry_offer_complete"
  CHECK ("status" <> 'OFFERED' OR num_nonnulls("offeredCourtId", "offeredAt", "offerExpiresAt") = 3);
ALTER TABLE "User" ADD CONSTRAINT "User_rejection_reason"
  CHECK ("status" = 'REJECTED' OR "rejectionReason" IS NULL);

-- Every existing club starts with the default roles; current admins become super admins and
-- coaches get the Professor role (staff edit both afterwards).
INSERT INTO "StaffRole" ("id", "clubId", "key", "name", "description", "permissions", "updatedAt")
SELECT md5(random()::text || c."id" || r.key), c."id", r.key, r.name, r.description, r.permissions, now()
FROM "Club" c
CROSS JOIN (VALUES
  ('SECRETARIA', 'Secretaria', 'Reservas, quadras e chuva, mural, aprovação de sócios e convidados',
    ARRAY['BOOKINGS_MANAGE','COURTS_MANAGE','NEWS_MANAGE','MEMBERS_APPROVE','GUESTS_MANAGE']),
  ('DIRETORIA', 'Diretoria', 'Tudo, menos as configurações da plataforma',
    ARRAY['BOOKINGS_MANAGE','COURTS_MANAGE','NEWS_MANAGE','MEMBERS_APPROVE','MEMBERS_MANAGE','GUESTS_MANAGE','LESSONS_MANAGE','TOURNAMENTS_MANAGE','RANKING_MANAGE','SETTINGS_MANAGE','STAFF_MANAGE']),
  ('PROFESSOR', 'Professor', 'As próprias aulas (no portal do professor); pode organizar torneios',
    ARRAY[]::TEXT[]),
  ('SUPER_ADMIN', 'Super admin', 'Acesso completo, inclusive à plataforma',
    ARRAY['BOOKINGS_MANAGE','COURTS_MANAGE','NEWS_MANAGE','MEMBERS_APPROVE','MEMBERS_MANAGE','GUESTS_MANAGE','LESSONS_MANAGE','TOURNAMENTS_MANAGE','RANKING_MANAGE','SETTINGS_MANAGE','STAFF_MANAGE','PLATFORM_MANAGE'])
) AS r(key, name, description, permissions);

INSERT INTO "UserStaffRole" ("userId", "roleId")
SELECT u."id", sr."id"
FROM "User" u
JOIN "StaffRole" sr ON sr."clubId" = u."clubId"
  AND sr."key" = CASE u."role" WHEN 'ADMIN' THEN 'SUPER_ADMIN' WHEN 'COACH' THEN 'PROFESSOR' END
WHERE u."role" IN ('ADMIN', 'COACH');
