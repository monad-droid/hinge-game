-- Debatable: one row per game, keyed by the short code in the URL.
-- No PII, no IPs, no analytics. Answers are stored as 7-char strings of 0/1.
CREATE TABLE IF NOT EXISTS games (
  code            TEXT PRIMARY KEY,
  pack_id         TEXT NOT NULL,
  created_at      INTEGER NOT NULL, -- unix ms
  expires_at      INTEGER NOT NULL, -- unix ms
  p1_answers      TEXT NOT NULL,
  p1_prediction   INTEGER,          -- NULL when predictions disabled
  p1_flappy       INTEGER,          -- tiebreaker score; NULL = skipped/disabled
  p1_flappy_retry INTEGER,          -- 1 = score came from the zero-pity retry
  p1_submitted_at INTEGER NOT NULL,
  p2_answers      TEXT,
  p2_prediction   INTEGER,
  p2_flappy       INTEGER,
  p2_flappy_retry INTEGER,
  p2_submitted_at INTEGER,
  -- Finish the Drawing: strokes as compact JSON [[x,y,t],...] in master
  -- coordinates. P2's component is always the opposite of P1's.
  draw_challenge    TEXT,
  p1_draw_component TEXT,
  p1_draw_points    TEXT,
  p1_draw_mulligan  INTEGER,
  p2_draw_points    TEXT,
  p2_draw_mulligan  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_games_expires_at ON games (expires_at);

-- Anonymous per-day counter of completed "Save image" actions on the
-- results card. No game codes, no PII — just a date and a count.
CREATE TABLE IF NOT EXISTS card_saves (
  day   TEXT PRIMARY KEY, -- UTC date, e.g. 2026-09-03
  count INTEGER NOT NULL DEFAULT 0
);
