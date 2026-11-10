-- Members can delete their account (App Store rule): the row stays for match history, with the
-- personal data cleared and no login, so the login checks only apply to live accounts.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);

ALTER TABLE "User" DROP CONSTRAINT "User_member_has_membership_id";
ALTER TABLE "User" ADD CONSTRAINT "User_member_has_membership_id"
  CHECK ("role" <> 'MEMBER' OR "membershipId" IS NOT NULL OR "deletedAt" IS NOT NULL);

ALTER TABLE "User" DROP CONSTRAINT "User_has_login";
ALTER TABLE "User" ADD CONSTRAINT "User_has_login"
  CHECK ("membershipId" IS NOT NULL OR "email" IS NOT NULL OR "deletedAt" IS NOT NULL);
