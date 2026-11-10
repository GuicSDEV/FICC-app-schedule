-- CreateEnum
CREATE TYPE "FriendRankingScope" AS ENUM ('AMONG_MEMBERS', 'ALL_MATCHES');

-- CreateEnum
CREATE TYPE "FriendRankingPeriod" AS ENUM ('MONTHLY', 'SINCE_START');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'FRIEND_RANKING_ADDED';

-- CreateTable
CREATE TABLE "FriendRanking" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL DEFAULT current_setting('app.club_id'::text, true),
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "FriendRankingScope" NOT NULL,
    "period" "FriendRankingPeriod" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FriendRanking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FriendRankingMember" (
    "rankingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FriendRankingMember_pkey" PRIMARY KEY ("rankingId","userId")
);

-- CreateIndex
CREATE INDEX "FriendRanking_ownerId_idx" ON "FriendRanking"("ownerId");

-- CreateIndex
CREATE INDEX "FriendRankingMember_userId_idx" ON "FriendRankingMember"("userId");

-- AddForeignKey
ALTER TABLE "FriendRanking" ADD CONSTRAINT "FriendRanking_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendRanking" ADD CONSTRAINT "FriendRanking_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendRankingMember" ADD CONSTRAINT "FriendRankingMember_rankingId_fkey" FOREIGN KEY ("rankingId") REFERENCES "FriendRanking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendRankingMember" ADD CONSTRAINT "FriendRankingMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "FriendRanking" ADD CONSTRAINT "FriendRanking_name_length" CHECK (char_length("name") BETWEEN 2 AND 40);
