-- Marks a flappy score that came from the zero-pity retry (1) rather than
-- the first attempt (NULL/0). Shown as an asterisk in the reveal and on
-- the results card. Run against production BEFORE deploying.
ALTER TABLE games ADD COLUMN p1_flappy_retry INTEGER;
ALTER TABLE games ADD COLUMN p2_flappy_retry INTEGER;
