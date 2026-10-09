-- CreateEnum
CREATE TYPE "PartnerRequestStatus" AS ENUM ('OPEN', 'MATCHED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PartnerRequest" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL DEFAULT current_setting('app.club_id'::text, true),
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "timeSlotId" TEXT NOT NULL,
    "type" "BookingType" NOT NULL,
    "note" TEXT,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "PartnerRequestStatus" NOT NULL DEFAULT 'OPEN',
    "bookingId" TEXT,
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerRequest_date_status_idx" ON "PartnerRequest"("date", "status");

-- CreateIndex
CREATE INDEX "PartnerRequest_userId_status_idx" ON "PartnerRequest"("userId", "status");

-- AddForeignKey
ALTER TABLE "PartnerRequest" ADD CONSTRAINT "PartnerRequest_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerRequest" ADD CONSTRAINT "PartnerRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerRequest" ADD CONSTRAINT "PartnerRequest_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "TimeSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerRequest" ADD CONSTRAINT "PartnerRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- One open request per member + date + slot.
CREATE UNIQUE INDEX "PartnerRequest_one_open" ON "PartnerRequest"("clubId", "userId", "date", "timeSlotId") WHERE "status" = 'OPEN';
ALTER TABLE "PartnerRequest" ADD CONSTRAINT "PartnerRequest_note_length" CHECK ("note" IS NULL OR char_length("note") <= 140);
ALTER TABLE "PartnerRequest" ADD CONSTRAINT "PartnerRequest_closed_check" CHECK (("status" = 'OPEN') = ("closedAt" IS NULL));
