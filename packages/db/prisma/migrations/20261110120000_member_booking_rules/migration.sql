-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activeBookingsLimit" INTEGER,
ADD COLUMN     "bookingsPerDayLimit" INTEGER,
ADD COLUMN     "canBookAlone" BOOLEAN NOT NULL DEFAULT false;


ALTER TABLE "User" ADD CONSTRAINT "User_booking_limits_check" CHECK (("bookingsPerDayLimit" IS NULL OR "bookingsPerDayLimit" BETWEEN 1 AND 10) AND ("activeBookingsLimit" IS NULL OR "activeBookingsLimit" BETWEEN 1 AND 20));
