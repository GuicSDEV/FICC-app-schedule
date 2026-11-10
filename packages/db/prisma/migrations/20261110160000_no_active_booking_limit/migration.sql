-- Clubs no longer limit future bookings by default (the daily limit and the booking opening pace
-- members). Drop the stored limit so existing clubs follow the new default (no limit).
UPDATE "ClubSettings" SET "values" = "values" - 'maxActiveBookings';
