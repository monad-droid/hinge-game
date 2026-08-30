-- Debatable: one row per game, keyed by the short code in the URL.
-- No PII, no IPs, no analytics. Answers are stored as 7-char strings of 0/1.
CREATE TABLE IF NOT EXISTS games (
  code            TEXT PRIMARY KEY,
  pack_id         TEXT NOT NULL,
  created_at      INTEGER NOT NULL, -- unix ms
  expires_at      INTEGER NOT NULL, -- unix ms
  p1_answers      TEXT NOT NULL,
  p1_prediction   INTEGER,          -- NULL when predictions disabled
  p1_submitted_at INTEGER NOT NULL,
  p2_answers      TEXT,
  p2_prediction   INTEGER,
  p2_submitted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_games_expires_at ON games (expires_at);
