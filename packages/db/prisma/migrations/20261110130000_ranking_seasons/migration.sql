-- CreateTable
CREATE TABLE "RankingSeason" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL DEFAULT current_setting('app.club_id'::text, true),
    "name" TEXT NOT NULL,
    "sport" "Sport" NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankingSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonStanding" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL DEFAULT current_setting('app.club_id'::text, true),
    "seasonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "elo" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,

    CONSTRAINT "SeasonStanding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RankingSeason_closedAt_idx" ON "RankingSeason"("closedAt");

-- CreateIndex
CREATE INDEX "SeasonStanding_seasonId_rank_idx" ON "SeasonStanding"("seasonId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonStanding_seasonId_userId_key" ON "SeasonStanding"("seasonId", "userId");

-- AddForeignKey
ALTER TABLE "RankingSeason" ADD CONSTRAINT "RankingSeason_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonStanding" ADD CONSTRAINT "SeasonStanding_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonStanding" ADD CONSTRAINT "SeasonStanding_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "RankingSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonStanding" ADD CONSTRAINT "SeasonStanding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One open season per club and sport.
CREATE UNIQUE INDEX "RankingSeason_one_open" ON "RankingSeason"("clubId", "sport") WHERE "closedAt" IS NULL;
ALTER TABLE "RankingSeason" ADD CONSTRAINT "RankingSeason_dates_check" CHECK (("endsAt" IS NULL OR "endsAt" > "startsAt") AND ("closedAt" IS NULL OR "closedAt" >= "startsAt"));
