-- Finish the Drawing: per-player stroke storage. Points are compact JSON
-- [[x,y,t],...] in the master 0..1 coordinate system. Player 2's component
-- is always the opposite of Player 1's, so only P1's choice is stored.
-- Run once against a database created before this feature:
--   npm run db:migrate-drawing:remote   (production)
--   npm run db:migrate-drawing:local    (local dev)
ALTER TABLE games ADD COLUMN draw_challenge TEXT;
ALTER TABLE games ADD COLUMN p1_draw_component TEXT;
ALTER TABLE games ADD COLUMN p1_draw_points TEXT;
ALTER TABLE games ADD COLUMN p1_draw_mulligan INTEGER;
ALTER TABLE games ADD COLUMN p2_draw_points TEXT;
ALTER TABLE games ADD COLUMN p2_draw_mulligan INTEGER;
