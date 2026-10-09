-- clubId defaults to the session setting app.club_id, which the API never sets: the default only
-- makes Prisma type clubId as optional in create inputs (the tenant extension always stamps it).
-- A write that escapes the extension gets NULL and fails the NOT NULL constraint.

ALTER TABLE "Booking" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
ALTER TABLE "Category" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
ALTER TABLE "Coach" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
ALTER TABLE "Court" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
ALTER TABLE "CourtFreeze" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
ALTER TABLE "EloHistory" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
ALTER TABLE "GateScanLog" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
ALTER TABLE "GuestBlock" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
ALTER TABLE "GuestPass" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
ALTER TABLE "Lesson" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
ALTER TABLE "LessonAuditLog" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
ALTER TABLE "LessonSeries" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
ALTER TABLE "Match" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
ALTER TABLE "Notification" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
ALTER TABLE "PlayerRating" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
ALTER TABLE "RefreshToken" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
ALTER TABLE "SlotFavorite" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
ALTER TABLE "SlotOccupancy" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
ALTER TABLE "TimeSlot" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
ALTER TABLE "User" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
ALTER TABLE "ValidMembershipId" ALTER COLUMN "clubId" SET DEFAULT current_setting('app.club_id', true);
