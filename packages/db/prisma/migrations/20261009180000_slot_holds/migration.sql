-- CreateTable
CREATE TABLE "SlotHold" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL DEFAULT current_setting('app.club_id'::text, true),
    "userId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "timeSlotId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SlotHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlotHold_courtId_date_timeSlotId_createdAt_idx" ON "SlotHold"("courtId", "date", "timeSlotId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SlotHold_clubId_userId_key" ON "SlotHold"("clubId", "userId");

-- AddForeignKey
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "TimeSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- At most one member holds a court + date + slot at a time (waiting members have no expiresAt).
CREATE UNIQUE INDEX "SlotHold_one_holder" ON "SlotHold"("courtId", "date", "timeSlotId") WHERE "expiresAt" IS NOT NULL;

-- A holder's time always ends after it started.
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_expiry_check" CHECK ("expiresAt" IS NULL OR "expiresAt" > "createdAt");
