-- Adds the flappy tiebreaker score columns to an existing database.
-- Run once against a database created before this feature:
--   npm run db:migrate:remote   (production)
--   npm run db:migrate:local    (local dev)
-- Fresh databases get these columns from schema.sql and don't need this.
ALTER TABLE games ADD COLUMN p1_flappy INTEGER;
ALTER TABLE games ADD COLUMN p2_flappy INTEGER;
