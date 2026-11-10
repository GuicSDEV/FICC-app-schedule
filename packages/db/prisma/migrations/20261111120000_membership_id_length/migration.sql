-- FICC matrículas have 5 digits; older 3- and 4-digit ones get leading zeros ("123" → "00123").
-- Members' accounts follow through the foreign key (ON UPDATE CASCADE).
UPDATE "ClubSettings" s
SET "values" = s."values" || '{"membershipIdLength": 5}'::jsonb
FROM "Club" c
WHERE c."id" = s."clubId" AND c."slug" = 'ficc';

UPDATE "ValidMembershipId" v
SET "membershipId" = lpad(split_part(v."membershipId", '-', 1), 5, '0')
  || CASE WHEN position('-' IN v."membershipId") > 0
       THEN '-' || split_part(v."membershipId", '-', 2) ELSE '' END
FROM "Club" c
WHERE c."id" = v."clubId"
  AND c."slug" = 'ficc'
  AND length(split_part(v."membershipId", '-', 1)) < 5
  AND NOT EXISTS (
    SELECT 1 FROM "ValidMembershipId" o
    WHERE o."clubId" = v."clubId"
      AND o."membershipId" = lpad(split_part(v."membershipId", '-', 1), 5, '0')
        || CASE WHEN position('-' IN v."membershipId") > 0
             THEN '-' || split_part(v."membershipId", '-', 2) ELSE '' END
  );
