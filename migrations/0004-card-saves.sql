-- Anonymous per-day counter of completed "Save image" actions on the
-- results card. No game codes, no PII — just a date and a count.
-- Run against production BEFORE deploying the worker that writes to it.
CREATE TABLE IF NOT EXISTS card_saves (
  day   TEXT PRIMARY KEY, -- UTC date, e.g. 2026-09-03
  count INTEGER NOT NULL DEFAULT 0
);
