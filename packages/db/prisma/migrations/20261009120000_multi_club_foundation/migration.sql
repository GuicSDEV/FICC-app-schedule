-- Phase 7.5 — multi-club-ready foundation.
--
-- Hand-written from `prisma migrate diff` so existing data survives: every row is moved into
-- the FICC club, ratings move to PlayerRating, categories become a per-club table, Match.type
-- becomes Match.format and a new Match.type (FRIENDLY | RANKED | TOURNAMENT) is added.

-- ─── Enums ──────────────────────────────────────────────────────────────────
CREATE TYPE "Sport" AS ENUM ('TENNIS');
CREATE TYPE "MatchFormat" AS ENUM ('SINGLES', 'DOUBLES');

-- ─── Clubs ──────────────────────────────────────────────────────────────────
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "accentColor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Club_slug_key" ON "Club"("slug");

CREATE TABLE "ClubSettings" (
    "clubId" TEXT NOT NULL,
    "values" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ClubSettings_pkey" PRIMARY KEY ("clubId")
);
ALTER TABLE "ClubSettings" ADD CONSTRAINT "ClubSettings_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FICC, the club every existing row belongs to. Its rules are stored explicitly so later changes
-- to the code defaults never change FICC's behaviour.
INSERT INTO "Club" ("id", "slug", "name", "timezone", "locale", "primaryColor", "accentColor", "updatedAt")
VALUES (gen_random_uuid()::text, 'ficc', 'FICC', 'America/Sao_Paulo', 'pt-BR', '#D7F24A', '#8B7CF6', CURRENT_TIMESTAMP);

INSERT INTO "ClubSettings" ("clubId", "values", "updatedAt")
SELECT "id", '{
  "bookingWindowDays": 14,
  "maxActiveBookings": 2,
  "bookingConfirmationMinutes": 120,
  "matchAutoApproveHours": 48,
  "matchReportMaxDaysAgo": 30,
  "eloKFactor": 32,
  "eloInitialRating": 1200,
  "lessonWindowDays": 56,
  "slotOpenedNotifyDays": 14,
  "defaultSlotDurationMinutes": 75,
  "guestPassMaxDaysAhead": 60,
  "guestDataRetentionDays": 90
}'::jsonb, CURRENT_TIMESTAMP
FROM "Club" WHERE "slug" = 'ficc';

-- ─── clubId on every club-owned table ───────────────────────────────────────
DO $$
DECLARE
  ficc TEXT := (SELECT "id" FROM "Club" WHERE "slug" = 'ficc');
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'User', 'ValidMembershipId', 'RefreshToken', 'Coach', 'Court', 'TimeSlot', 'SlotOccupancy',
    'LessonSeries', 'Lesson', 'LessonAuditLog', 'Booking', 'SlotFavorite', 'CourtFreeze', 'Match',
    'EloHistory', 'GuestPass', 'GuestBlock', 'GateScanLog', 'Notification'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN "clubId" TEXT', tbl);
    EXECUTE format('UPDATE %I SET "clubId" = %L', tbl, ficc);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "clubId" SET NOT NULL', tbl);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE',
      tbl, tbl || '_clubId_fkey'
    );
  END LOOP;
END $$;

-- ─── Membership IDs: unique per club ────────────────────────────────────────
ALTER TABLE "User" DROP CONSTRAINT "User_membershipId_fkey";
DROP INDEX "User_membershipId_key";
DROP INDEX "User_email_key";
ALTER TABLE "ValidMembershipId" ADD COLUMN "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE "ValidMembershipId" DROP CONSTRAINT "ValidMembershipId_pkey";
ALTER TABLE "ValidMembershipId" ADD CONSTRAINT "ValidMembershipId_pkey" PRIMARY KEY ("id");
ALTER TABLE "ValidMembershipId" ALTER COLUMN "id" DROP DEFAULT;
CREATE UNIQUE INDEX "ValidMembershipId_clubId_membershipId_key" ON "ValidMembershipId"("clubId", "membershipId");
CREATE UNIQUE INDEX "User_clubId_membershipId_key" ON "User"("clubId", "membershipId");
CREATE UNIQUE INDEX "User_clubId_email_key" ON "User"("clubId", "email");
ALTER TABLE "User" ADD CONSTRAINT "User_clubId_membershipId_fkey" FOREIGN KEY ("clubId", "membershipId") REFERENCES "ValidMembershipId"("clubId", "membershipId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Courts and slots: names unique per club; courts have a sport ───────────
DROP INDEX "Court_name_key";
CREATE UNIQUE INDEX "Court_clubId_name_key" ON "Court"("clubId", "name");
ALTER TABLE "Court" ADD COLUMN "sport" "Sport" NOT NULL DEFAULT 'TENNIS';
ALTER TABLE "Court" ALTER COLUMN "sport" DROP DEFAULT;
DROP INDEX "TimeSlot_startTime_key";
CREATE UNIQUE INDEX "TimeSlot_clubId_startTime_key" ON "TimeSlot"("clubId", "startTime");

-- ─── Categories: per-club table instead of an enum ──────────────────────────
-- The old enum shares the new table's name; move it aside until the data is copied.
ALTER TYPE "Category" RENAME TO "Category_old";
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Category_clubId_key_key" ON "Category"("clubId", "key");
ALTER TABLE "Category" ADD CONSTRAINT "Category_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Category" ("id", "clubId", "key", "name", "sortOrder")
SELECT gen_random_uuid()::text, c."id", v.key, v.name, v.sort_order
FROM "Club" c
CROSS JOIN (VALUES
  ('CLASS_A', 'Classe A', 1),
  ('CLASS_B', 'Classe B', 2),
  ('CLASS_C', 'Classe C', 3),
  ('WOMENS', 'Feminino', 4),
  ('SENIORS', 'Sênior', 5)
) AS v(key, name, sort_order)
WHERE c."slug" = 'ficc';

CREATE TABLE "UserCategory" (
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    CONSTRAINT "UserCategory_pkey" PRIMARY KEY ("userId","categoryId")
);
CREATE INDEX "UserCategory_categoryId_idx" ON "UserCategory"("categoryId");
ALTER TABLE "UserCategory" ADD CONSTRAINT "UserCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserCategory" ADD CONSTRAINT "UserCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "UserCategory" ("userId", "categoryId")
SELECT u."id", cat."id"
FROM "User" u
CROSS JOIN LATERAL unnest(u."categories") AS member_category(key)
JOIN "Category" cat ON cat."clubId" = u."clubId" AND cat."key" = member_category.key::text;

DROP INDEX "User_categories_idx";
ALTER TABLE "User" DROP COLUMN "categories";
DROP TYPE "Category_old";

-- ─── Ratings: PlayerRating per sport instead of User.elo ────────────────────
CREATE TABLE "PlayerRating" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sport" "Sport" NOT NULL,
    "elo" INTEGER NOT NULL,
    "matches" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PlayerRating_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlayerRating_userId_sport_key" ON "PlayerRating"("userId", "sport");
CREATE INDEX "PlayerRating_clubId_sport_elo_idx" ON "PlayerRating"("clubId", "sport", "elo");
ALTER TABLE "PlayerRating" ADD CONSTRAINT "PlayerRating_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlayerRating" ADD CONSTRAINT "PlayerRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PlayerRating" ("id", "clubId", "userId", "sport", "elo", "matches", "updatedAt")
SELECT gen_random_uuid()::text, u."clubId", u."id", 'TENNIS', u."elo",
       (SELECT count(*) FROM "EloHistory" e WHERE e."userId" = u."id"), CURRENT_TIMESTAMP
FROM "User" u
WHERE u."role" = 'MEMBER';

DROP INDEX "User_role_elo_idx";
ALTER TABLE "User" DROP COLUMN "elo";
CREATE INDEX "User_clubId_role_idx" ON "User"("clubId", "role");

ALTER TABLE "EloHistory" ADD COLUMN "sport" "Sport" NOT NULL DEFAULT 'TENNIS';
ALTER TABLE "EloHistory" ALTER COLUMN "sport" DROP DEFAULT;
DROP INDEX "EloHistory_userId_createdAt_idx";
CREATE INDEX "EloHistory_userId_sport_createdAt_idx" ON "EloHistory"("userId", "sport", "createdAt");

-- ─── Matches: format, type, sport and the tournament link ───────────────────
ALTER TABLE "Match" ADD COLUMN "format" "MatchFormat";
UPDATE "Match" SET "format" = "type"::text::"MatchFormat";
ALTER TABLE "Match" ALTER COLUMN "format" SET NOT NULL;
ALTER TABLE "Match" DROP COLUMN "type";
DROP TYPE "MatchType";
CREATE TYPE "MatchType" AS ENUM ('FRIENDLY', 'RANKED', 'TOURNAMENT');
-- Every match reported so far counted for the ladder.
ALTER TABLE "Match" ADD COLUMN "type" "MatchType" NOT NULL DEFAULT 'RANKED';
ALTER TABLE "Match" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Match" ADD COLUMN "sport" "Sport" NOT NULL DEFAULT 'TENNIS';
ALTER TABLE "Match" ALTER COLUMN "sport" DROP DEFAULT;
ALTER TABLE "Match" ADD COLUMN "tournamentId" TEXT;
DROP INDEX "Match_status_approvalDeadline_idx";
DROP INDEX "Match_playedOn_idx";
CREATE INDEX "Match_clubId_status_approvalDeadline_idx" ON "Match"("clubId", "status", "approvalDeadline");
CREATE INDEX "Match_clubId_playedOn_idx" ON "Match"("clubId", "playedOn");
CREATE INDEX "Match_tournamentId_idx" ON "Match"("tournamentId");

-- Set counts depend on the sport's format; allow up to 5 (tennis still uses at most 3).
ALTER TABLE "MatchSet" DROP CONSTRAINT "MatchSet_set_number_range";
ALTER TABLE "MatchSet" ADD CONSTRAINT "MatchSet_set_number_range" CHECK ("setNumber" BETWEEN 1 AND 5);

-- ─── Guests: encrypted documents and anonymization (LGPD) ───────────────────
-- Existing plaintext numbers stay in "documentNumber" until the API's encrypt-legacy job moves
-- them into "documentCipher"/"documentHash" (it needs DATA_ENCRYPTION_KEY, which SQL does not have).
ALTER TABLE "GuestPass" ADD COLUMN "documentCipher" TEXT,
ADD COLUMN "documentHash" TEXT,
ADD COLUMN "anonymizedAt" TIMESTAMPTZ(3),
ALTER COLUMN "guestName" DROP NOT NULL,
ALTER COLUMN "documentNumber" DROP NOT NULL;
ALTER TABLE "GuestPass" ADD CONSTRAINT "GuestPass_name_until_anonymized"
  CHECK ("anonymizedAt" IS NOT NULL OR "guestName" IS NOT NULL);
DROP INDEX "GuestPass_documentType_documentNumber_idx";
DROP INDEX "GuestPass_visitDate_status_idx";
CREATE INDEX "GuestPass_clubId_documentHash_idx" ON "GuestPass"("clubId", "documentHash");
CREATE INDEX "GuestPass_clubId_visitDate_status_idx" ON "GuestPass"("clubId", "visitDate", "status");

ALTER TABLE "GuestBlock" ADD COLUMN "documentCipher" TEXT,
ADD COLUMN "documentHash" TEXT,
ADD COLUMN "anonymizedAt" TIMESTAMPTZ(3),
ALTER COLUMN "documentNumber" DROP NOT NULL;
DROP INDEX "GuestBlock_documentType_documentNumber_idx";
CREATE INDEX "GuestBlock_clubId_documentHash_idx" ON "GuestBlock"("clubId", "documentHash");
