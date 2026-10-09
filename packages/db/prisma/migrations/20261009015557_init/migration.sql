-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MEMBER', 'COACH', 'ADMIN', 'GATE');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('CLASS_A', 'CLASS_B', 'CLASS_C', 'WOMENS', 'SENIORS');

-- CreateEnum
CREATE TYPE "Surface" AS ENUM ('HARTRU', 'SAIBRO');

-- CreateEnum
CREATE TYPE "CourtStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LessonAuditAction" AS ENUM ('CREATED', 'UPDATED', 'CANCELLED', 'RESTORED', 'SERIES_CREATED', 'SERIES_UPDATED', 'SERIES_ENDED');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('SINGLES', 'DOUBLES');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingPlayerStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED');

-- CreateEnum
CREATE TYPE "BookingCancelReason" AS ENUM ('DECLINED', 'EXPIRED', 'CANCELLED_BY_PLAYER', 'COURT_FROZEN', 'CANCELLED_BY_ADMIN');

-- CreateEnum
CREATE TYPE "FreezeReason" AS ENUM ('RAIN', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "FreezeScope" AS ENUM ('COURT', 'SURFACE', 'ALL');

-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('SINGLES', 'DOUBLES');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DISPUTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "MatchConfirmation" AS ENUM ('OPPONENT_APPROVED', 'AUTO_APPROVED', 'ADMIN_RESOLVED');

-- CreateEnum
CREATE TYPE "TeamSide" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "GuestDocumentType" AS ENUM ('CPF', 'RG');

-- CreateEnum
CREATE TYPE "GuestPassStatus" AS ENUM ('ACTIVE', 'USED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GateScanMethod" AS ENUM ('QR', 'MANUAL');

-- CreateEnum
CREATE TYPE "GateScanResult" AS ENUM ('ACCEPTED', 'INVALID_TOKEN', 'WRONG_DATE', 'ALREADY_USED', 'PASS_CANCELLED', 'DOCUMENT_BLOCKED', 'HOST_SUSPENDED', 'NOT_FOUND');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_INVITE', 'BOOKING_CONFIRMED', 'BOOKING_CANCELLED', 'SLOT_OPENED', 'LESSON_CANCELLED', 'MATCH_REPORTED', 'MATCH_CONFIRMED', 'MATCH_DISPUTED', 'DISPUTE_RESOLVED', 'COURT_FROZEN', 'COURT_UNFROZEN', 'GUEST_CHECKED_IN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "membershipId" TEXT,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "photoUrl" TEXT,
    "categories" "Category"[],
    "elo" INTEGER NOT NULL DEFAULT 1200,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "guestPassesSuspendedAt" TIMESTAMPTZ(3),
    "guestPassesSuspendedReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidMembershipId" (
    "membershipId" TEXT NOT NULL,
    "holderName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidMembershipId_pkey" PRIMARY KEY ("membershipId")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coach" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "photoUrl" TEXT,
    "color" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Coach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachCourt" (
    "coachId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,

    CONSTRAINT "CoachCourt_pkey" PRIMARY KEY ("coachId","courtId")
);

-- CreateTable
CREATE TABLE "Court" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "surface" "Surface" NOT NULL,
    "status" "CourtStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Court_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeSlot" (
    "id" TEXT NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 75,
    "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TimeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotOccupancy" (
    "courtId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "timeSlotId" TEXT NOT NULL,
    "bookingId" TEXT,
    "lessonId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotOccupancy_pkey" PRIMARY KEY ("courtId","date","timeSlotId")
);

-- CreateTable
CREATE TABLE "LessonSeries" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "timeSlotId" TEXT NOT NULL,
    "weekdays" "Weekday"[],
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "studentNames" TEXT,
    "note" TEXT,
    "generatedUntil" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LessonSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT,
    "coachId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "timeSlotId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "LessonStatus" NOT NULL DEFAULT 'SCHEDULED',
    "studentNames" TEXT,
    "note" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonAuditLog" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT,
    "seriesId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" "LessonAuditAction" NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "type" "BookingType" NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "courtId" TEXT NOT NULL,
    "timeSlotId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" "BookingCancelReason",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingPlayer" (
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BookingPlayerStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMPTZ(3),

    CONSTRAINT "BookingPlayer_pkey" PRIMARY KEY ("bookingId","userId")
);

-- CreateTable
CREATE TABLE "SlotFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "timeSlotId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourtFreeze" (
    "id" TEXT NOT NULL,
    "reason" "FreezeReason" NOT NULL,
    "scope" "FreezeScope" NOT NULL,
    "surface" "Surface",
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3),
    "liftedAt" TIMESTAMPTZ(3),
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "liftedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourtFreeze_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourtFreezeCourt" (
    "freezeId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,

    CONSTRAINT "CourtFreezeCourt_pkey" PRIMARY KEY ("freezeId","courtId")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "type" "MatchType" NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "playedOn" DATE NOT NULL,
    "surface" "Surface" NOT NULL,
    "courtId" TEXT,
    "bookingId" TEXT,
    "winnerSide" "TeamSide" NOT NULL,
    "reportedById" TEXT NOT NULL,
    "reportedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvalDeadline" TIMESTAMPTZ(3) NOT NULL,
    "respondedById" TEXT,
    "respondedAt" TIMESTAMPTZ(3),
    "disputeComment" TEXT,
    "confirmation" "MatchConfirmation",
    "confirmedAt" TIMESTAMPTZ(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchPlayer" (
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "side" "TeamSide" NOT NULL,

    CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("matchId","userId")
);

-- CreateTable
CREATE TABLE "MatchSet" (
    "matchId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "sideAGames" INTEGER NOT NULL,
    "sideBGames" INTEGER NOT NULL,
    "isMatchTiebreak" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MatchSet_pkey" PRIMARY KEY ("matchId","setNumber")
);

-- CreateTable
CREATE TABLE "EloHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "before" INTEGER NOT NULL,
    "after" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EloHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestPass" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "documentType" "GuestDocumentType" NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "visitDate" DATE NOT NULL,
    "bookingId" TEXT,
    "status" "GuestPassStatus" NOT NULL DEFAULT 'ACTIVE',
    "usedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestBlock" (
    "id" TEXT NOT NULL,
    "documentType" "GuestDocumentType" NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "reason" TEXT,
    "blockedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" TIMESTAMPTZ(3),
    "liftedById" TEXT,

    CONSTRAINT "GuestBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GateScanLog" (
    "id" TEXT NOT NULL,
    "guestPassId" TEXT,
    "scannedById" TEXT NOT NULL,
    "method" "GateScanMethod" NOT NULL,
    "result" "GateScanResult" NOT NULL,
    "scannedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GateScanLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_membershipId_key" ON "User"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_elo_idx" ON "User"("role", "elo");

-- CreateIndex
CREATE INDEX "User_categories_idx" ON "User" USING GIN ("categories");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Coach_userId_key" ON "Coach"("userId");

-- CreateIndex
CREATE INDEX "CoachCourt_courtId_idx" ON "CoachCourt"("courtId");

-- CreateIndex
CREATE UNIQUE INDEX "Court_name_key" ON "Court"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TimeSlot_startTime_key" ON "TimeSlot"("startTime");

-- CreateIndex
CREATE UNIQUE INDEX "SlotOccupancy_bookingId_key" ON "SlotOccupancy"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotOccupancy_lessonId_key" ON "SlotOccupancy"("lessonId");

-- CreateIndex
CREATE INDEX "SlotOccupancy_date_idx" ON "SlotOccupancy"("date");

-- CreateIndex
CREATE INDEX "LessonSeries_coachId_idx" ON "LessonSeries"("coachId");

-- CreateIndex
CREATE INDEX "LessonSeries_courtId_timeSlotId_idx" ON "LessonSeries"("courtId", "timeSlotId");

-- CreateIndex
CREATE INDEX "Lesson_date_courtId_idx" ON "Lesson"("date", "courtId");

-- CreateIndex
CREATE INDEX "Lesson_coachId_date_idx" ON "Lesson"("coachId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_seriesId_date_key" ON "Lesson"("seriesId", "date");

-- CreateIndex
CREATE INDEX "LessonAuditLog_lessonId_idx" ON "LessonAuditLog"("lessonId");

-- CreateIndex
CREATE INDEX "LessonAuditLog_seriesId_idx" ON "LessonAuditLog"("seriesId");

-- CreateIndex
CREATE INDEX "LessonAuditLog_actorId_idx" ON "LessonAuditLog"("actorId");

-- CreateIndex
CREATE INDEX "LessonAuditLog_createdAt_idx" ON "LessonAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Booking_date_courtId_idx" ON "Booking"("date", "courtId");

-- CreateIndex
CREATE INDEX "Booking_status_expiresAt_idx" ON "Booking"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Booking_createdById_idx" ON "Booking"("createdById");

-- CreateIndex
CREATE INDEX "BookingPlayer_userId_status_idx" ON "BookingPlayer"("userId", "status");

-- CreateIndex
CREATE INDEX "SlotFavorite_courtId_timeSlotId_idx" ON "SlotFavorite"("courtId", "timeSlotId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotFavorite_userId_courtId_timeSlotId_key" ON "SlotFavorite"("userId", "courtId", "timeSlotId");

-- CreateIndex
CREATE INDEX "CourtFreeze_startsAt_idx" ON "CourtFreeze"("startsAt");

-- CreateIndex
CREATE INDEX "CourtFreeze_liftedAt_endsAt_idx" ON "CourtFreeze"("liftedAt", "endsAt");

-- CreateIndex
CREATE INDEX "CourtFreezeCourt_courtId_idx" ON "CourtFreezeCourt"("courtId");

-- CreateIndex
CREATE INDEX "Match_status_approvalDeadline_idx" ON "Match"("status", "approvalDeadline");

-- CreateIndex
CREATE INDEX "Match_playedOn_idx" ON "Match"("playedOn");

-- CreateIndex
CREATE INDEX "Match_bookingId_idx" ON "Match"("bookingId");

-- CreateIndex
CREATE INDEX "MatchPlayer_userId_idx" ON "MatchPlayer"("userId");

-- CreateIndex
CREATE INDEX "EloHistory_userId_createdAt_idx" ON "EloHistory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EloHistory_matchId_idx" ON "EloHistory"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "EloHistory_userId_matchId_key" ON "EloHistory"("userId", "matchId");

-- CreateIndex
CREATE INDEX "GuestPass_hostId_visitDate_idx" ON "GuestPass"("hostId", "visitDate");

-- CreateIndex
CREATE INDEX "GuestPass_documentType_documentNumber_idx" ON "GuestPass"("documentType", "documentNumber");

-- CreateIndex
CREATE INDEX "GuestPass_visitDate_status_idx" ON "GuestPass"("visitDate", "status");

-- CreateIndex
CREATE INDEX "GuestBlock_documentType_documentNumber_idx" ON "GuestBlock"("documentType", "documentNumber");

-- CreateIndex
CREATE INDEX "GateScanLog_guestPassId_idx" ON "GateScanLog"("guestPassId");

-- CreateIndex
CREATE INDEX "GateScanLog_scannedAt_idx" ON "GateScanLog"("scannedAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "ValidMembershipId"("membershipId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coach" ADD CONSTRAINT "Coach_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachCourt" ADD CONSTRAINT "CoachCourt_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachCourt" ADD CONSTRAINT "CoachCourt_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotOccupancy" ADD CONSTRAINT "SlotOccupancy_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotOccupancy" ADD CONSTRAINT "SlotOccupancy_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "TimeSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotOccupancy" ADD CONSTRAINT "SlotOccupancy_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotOccupancy" ADD CONSTRAINT "SlotOccupancy_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonSeries" ADD CONSTRAINT "LessonSeries_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonSeries" ADD CONSTRAINT "LessonSeries_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonSeries" ADD CONSTRAINT "LessonSeries_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "TimeSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "LessonSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "TimeSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonAuditLog" ADD CONSTRAINT "LessonAuditLog_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonAuditLog" ADD CONSTRAINT "LessonAuditLog_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "LessonSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonAuditLog" ADD CONSTRAINT "LessonAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "TimeSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPlayer" ADD CONSTRAINT "BookingPlayer_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPlayer" ADD CONSTRAINT "BookingPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotFavorite" ADD CONSTRAINT "SlotFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotFavorite" ADD CONSTRAINT "SlotFavorite_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotFavorite" ADD CONSTRAINT "SlotFavorite_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "TimeSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtFreeze" ADD CONSTRAINT "CourtFreeze_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtFreeze" ADD CONSTRAINT "CourtFreeze_liftedById_fkey" FOREIGN KEY ("liftedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtFreezeCourt" ADD CONSTRAINT "CourtFreezeCourt_freezeId_fkey" FOREIGN KEY ("freezeId") REFERENCES "CourtFreeze"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtFreezeCourt" ADD CONSTRAINT "CourtFreezeCourt_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSet" ADD CONSTRAINT "MatchSet_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EloHistory" ADD CONSTRAINT "EloHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EloHistory" ADD CONSTRAINT "EloHistory_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestPass" ADD CONSTRAINT "GuestPass_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestPass" ADD CONSTRAINT "GuestPass_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestBlock" ADD CONSTRAINT "GuestBlock_blockedById_fkey" FOREIGN KEY ("blockedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestBlock" ADD CONSTRAINT "GuestBlock_liftedById_fkey" FOREIGN KEY ("liftedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateScanLog" ADD CONSTRAINT "GateScanLog_guestPassId_fkey" FOREIGN KEY ("guestPassId") REFERENCES "GuestPass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateScanLog" ADD CONSTRAINT "GateScanLog_scannedById_fkey" FOREIGN KEY ("scannedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── CHECK constraints (not expressible in schema.prisma) ───────────────────

-- Members log in with their matrícula; every account needs some login.
ALTER TABLE "User" ADD CONSTRAINT "User_member_has_membership_id"
  CHECK ("role" <> 'MEMBER' OR "membershipId" IS NOT NULL);
ALTER TABLE "User" ADD CONSTRAINT "User_has_login"
  CHECK ("membershipId" IS NOT NULL OR "email" IS NOT NULL);

-- Slot grid entries are valid "HH:mm" times with a positive duration.
ALTER TABLE "TimeSlot" ADD CONSTRAINT "TimeSlot_start_time_format"
  CHECK ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "TimeSlot" ADD CONSTRAINT "TimeSlot_duration_positive"
  CHECK ("durationMinutes" > 0);

-- A slot occupancy belongs to exactly one booking or one lesson.
ALTER TABLE "SlotOccupancy" ADD CONSTRAINT "SlotOccupancy_single_owner"
  CHECK (num_nonnulls("bookingId", "lessonId") = 1);

-- A series repeats on at least one weekday and never ends before it starts.
ALTER TABLE "LessonSeries" ADD CONSTRAINT "LessonSeries_has_weekdays"
  CHECK (cardinality("weekdays") > 0);
ALTER TABLE "LessonSeries" ADD CONSTRAINT "LessonSeries_date_range"
  CHECK ("endDate" IS NULL OR "endDate" >= "startDate");

-- Surface freezes name their surface; other scopes do not. Time ranges are forward.
ALTER TABLE "CourtFreeze" ADD CONSTRAINT "CourtFreeze_surface_matches_scope"
  CHECK (("scope" = 'SURFACE') = ("surface" IS NOT NULL));
ALTER TABLE "CourtFreeze" ADD CONSTRAINT "CourtFreeze_time_range"
  CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");

-- Best of 3 with non-negative scores.
ALTER TABLE "MatchSet" ADD CONSTRAINT "MatchSet_set_number_range"
  CHECK ("setNumber" BETWEEN 1 AND 3);
ALTER TABLE "MatchSet" ADD CONSTRAINT "MatchSet_scores_non_negative"
  CHECK ("sideAGames" >= 0 AND "sideBGames" >= 0);

-- Rating rows are internally consistent.
ALTER TABLE "EloHistory" ADD CONSTRAINT "EloHistory_after_is_before_plus_delta"
  CHECK ("after" = "before" + "delta");
