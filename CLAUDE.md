# CLAUDE.md — Debatable

## What this is

**Debatable** (debatable.lol) — an async two-player opinion-diff game for
dating-app matches. Player 1 answers 7 binary opinion questions, plays two
optional bonus rounds (a one-attempt flappy game and a collaborative
one-stroke drawing), and sends a short link (`/g/XK42P`). Player 2 answers
the same questions blind, plays the same bonus rounds, and both get a paced
reveal: agreement score, per-question SAME SIDE / DISPUTE DETECTED cards,
flappy comparison, combined team drawing with ONE team score, joke verdict,
and a screenshot-ready share card. Disagreements are jokes, never
compatibility claims.

**Stack**: Cloudflare Workers (Hono router) + Cloudflare **D1** (SQLite —
NOT KV) + Vite/vanilla-TypeScript SPA served by the same Worker.
Deploy: `git pull && npm run deploy` from the owner's machine (wrangler,
account already linked). Custom domain debatable.lol is attached in the
Cloudflare dashboard; `debatable.drulestead.workers.dev` exists but is
never shared publicly. **If a change adds DB columns, run its migration
against production BEFORE deploying** (this bit us three times).

## Architecture

```
index.html            SPA shell (Vite entry; OG/link-preview meta)
schema.sql            Full D1 schema for FRESH databases
migrations/           0002-flappy.sql, 0003-drawing.sql, 0004-card-saves.sql
                      (ALTERs/CREATEs for existing DBs)
wrangler.jsonc        Worker + assets (run_worker_first: true) + D1 + daily cron
shared/               Imported by BOTH worker and frontend
  config.ts           Flags: ENABLE_PREDICTIONS=false, ENABLE_MINIGAME=true,
                      ENABLE_DRAWING=false, CURRENT_PACK_ID="original-v3", BUILT_BY
  packs.ts            Question packs. Players see ONE list (CURRENT_PACK_ID);
                      old packs stay frozen so old games render correctly
  drawing.ts          Drawing challenges (house_v1), stroke geometry,
                      deterministic Chamfer team scoring, stroke sanitization
  verdicts.ts         Verdict banks (questions, flappy flavor, drawing bands)
  types.ts            API request/response types
worker/index.ts       Hono API + asset serving w/ cache headers + cron cleanup
src/
  main.ts             Router (/, /g/:code), role/flow orchestration
  quiz.ts             Question flow → flappy → drawing gate → submit pipeline
  flappy.ts           Flappy tiebreaker (canvas, pixel sprites, pause-on-blur)
  draw.ts             Drawing round: opt-in gate → rules ack → one-stroke canvas
  reveal.ts           Staged reveal incl. drawing tease/animation/compare + card
  card.ts             Share-card PNG (canvas)
  screens.ts          Landing, share/waiting (15s visible-tab polling), intros
  storage.ts          localStorage: per-code role memory + resumable drafts
  api.ts, ui.ts, styles.css
tests/drawing.test.ts 11 tests: scoring bands, assignment, sanitization
                      (npm test → node --experimental-strip-types)
```

**Data model** (D1, one row per game in `games`, PK = 5-char code from an
unambiguous alphabet): pack_id, created_at, expires_at, then per player:
answers ("0110100" string), prediction (unused while predictions off),
flappy score (NULL = skipped), submitted_at; drawing: draw_challenge,
p1_draw_component ("roof"|"house"), p1/p2_draw_points (JSON [[x,y,t],…] in
the normalized 0..1 master square, ≤240 points), p1/p2_draw_mulligan.
P2's drawing component is never stored — always derived as the opposite of
P1's. Team drawing score is computed at reveal time, never stored.

**API routes** (worker/index.ts):
- `POST /api/games` — create; P1's entire side (answers/flappy/drawing)
  arrives WITH creation, so a shareable code never exists with an open P1.
- `GET /api/games/:code` — public status: `{code, packId, state, expiresAt,
  drawChallengeId, drawComponent}` only. Never answers, never strokes.
- `POST /api/games/:code/p2` — atomic single lock:
  `UPDATE … WHERE p2_submitted_at IS NULL`; 0 rows changed → 409.
- `GET /api/games/:code/reveal` — 409 until complete; the ONLY place
  answers/strokes/team score leave the server.
- All routes 410 expired games; daily cron deletes expired rows.

## Invariants — never break these

1. **Answer & drawing secrecy is server-side.** P1's answers and stroke
   never appear in any response P2 can fetch before P2's side is locked.
   Status may expose only which drawing component P1 took. Both sides'
   data leaves the server exclusively via the completed-game reveal.
2. **Locks are immutable and atomic.** P1 locks at creation; P2 via the
   conditional UPDATE. No endpoint edits a locked side.
3. **Drawings are normalized stroke vectors, never raster images.**
   [[x,y,t],…] in the shared 0..1 master coordinate system; combined
   untouched at reveal (mismatch is the joke); ONE deterministic team
   score, no individual drawing scores, no random scores.
4. **No accounts, no PII, no tracking.** DB stores only game mechanics +
   timestamps. No names, emails, IPs (intentionally), fingerprinting, or
   analytics. WHOIS/registrant privacy matters to the owner; the workers.dev
   URL (contains "drulestead") must never appear in user-facing surfaces.
5. **One play per side per browser is a localStorage UX safeguard, not
   security** (`debatable.role.{code}`, drafts). It prevents accidental
   self-play (creator opening own link gets the waiting screen, never P2's
   flow); deliberate bypass via private windows is accepted. Never
   "upgrade" this to fingerprinting/auth.
6. **Aggregate/global stats are opt-in by owner request only.** The one
   that exists: `card_saves`, an anonymous per-day count of completed
   "Save image" actions (no game codes, no PII; viewed via
   `npm run stats:saves`). Don't add more without an explicit request.
7. **Packs and drawing challenges are versioned, frozen data.** Answers
   are stored as choice indices, so NEVER edit a pack/challenge that has
   games — add `original-v4` / a new challenge and repoint the
   CURRENT_* constant. Every game keeps its own packId/challengeId.
8. **One-stroke drawing rules**: P1 chooses a component, P2 automatically
   gets the other (server rejects P2 naming one); one voluntary retry
   ("Restart (1 left)" → "Final attempt"); micro-blip strokes never count
   or spend the retry; no eraser/undo/colors. The whole round is opt-in
   via the "That was fun, right?" gate; sitting out stores NULL and the
   reveal omits the section.
9. **Verdicts are jokes.** Never imply real compatibility, red flags, or
   competence anywhere in copy.
10. **Mobile-first webview survival**: touch handlers on the game stages
    must never swallow touches on buttons (cancelling touchend kills their
    click); HTML is served no-cache (stale SPA bundles = old app after
    deploys); hashed /assets/* immutable.

## Current status

**Built, deployed, verified end-to-end** (Playwright two-context e2e in
scratchpad, plus 11 unit tests): full question flow with tap feedback and
refresh-resume; flappy tiebreaker (pixel-art sprites — original artwork,
NOT Flappy Bird assets; difficulty ramps with score; pauses on
notification/blur); Finish the Drawing (gate → rules ack → one-stroke
canvas with pulsing start dot → staged reveal with animated strokes over a
dashed ghost reference, count-up team score, plan-vs-reality compare);
share card DOM + PNG with team drawing; OG link previews; rainbow Play
button with firework explosion + top-of-screen confetti; "Built by David
from Hinge" attribution (footer/card/PNG); security headers;
explicit submit-retry screen.

**Config state**: predictions OFF (screens still in code; one-line
re-enable), flappy ON, drawing OFF (parked for a future mode picker —
all code kept in place; one-line re-enable via ENABLE_DRAWING). Live
pack: original-v3 (fries/voice
note/alarms/vacation/empty day/birthday/eating out). Reveal labels are
always You/Them (stored role, else creator's perspective).

**Known issues / soft spots**: drawing-round feel on real iPhones is
lightly tested (canvas touch, start-dot size, one-stroke difficulty);
flappy difficulty tuned by feedback, may need more; new-domain reputation
false positives from third-party mobile AV (Google Safe Browsing verified
clean; decays with domain age); dev-server port 8787 in sandboxes tends to
leak orphan workerd processes (kill by PID/fuser before restarting).

## When compacting, always preserve

- The **Invariants** section above, verbatim in spirit — especially:
  server-side secrecy until both sides lock; atomic immutable locks;
  strokes as normalized vectors with ONE deterministic team score; no
  accounts/PII/tracking/fingerprinting; localStorage role = UX not
  security; frozen versioned packs/challenges; migrations run BEFORE
  deploy.
- The deploy ritual: owner runs `git pull && npm run deploy` on their Mac;
  branch `claude/debatable-dating-game-s4zeqt`; DB migrations via the
  `db:migrate*` npm scripts against `debatable-db`.
- The full file map: worker/index.ts; shared/{config,packs,drawing,
  verdicts,types}.ts; src/{main,quiz,flappy,draw,reveal,card,screens,
  storage,api,ui}.ts + styles.css; schema.sql + migrations/0002,0003;
  tests/drawing.test.ts; wrangler.jsonc (real database_id committed);
  index.html; public/ (og.png, apple-touch-icon.png).
- That verification = `npm run check` + `npm run build` + `npm test` +
  the scratchpad Playwright e2e against `wrangler dev` on :8787.
- The owner's voice preferences: dry/playful copy, no compatibility
  language, "Flappy" never "Flappy Bird" in UI, attribution line stays.
