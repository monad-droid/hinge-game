-- Per-day counters that survive the 30-day game cleanup, feeding the
-- owner's key-protected /stats dashboard. No game codes, no PII:
-- created/completed are event counts; new_creators counts games whose
-- creating browser self-reported "first game here" (one anonymous bit).
-- Run against production BEFORE deploying.
CREATE TABLE IF NOT EXISTS game_stats (
  day          TEXT PRIMARY KEY, -- UTC date, e.g. 2026-09-04
  created      INTEGER NOT NULL DEFAULT 0,
  completed    INTEGER NOT NULL DEFAULT 0,
  new_creators INTEGER NOT NULL DEFAULT 0
);
