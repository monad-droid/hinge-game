# Debatable

Seven meaningless questions. One person to argue with.

A two-player async opinion game for people who matched on a dating app.
Player 1 answers 7 questions, sends a short link; Player 2 answers blind;
both get a paced reveal of where they agreed and where a dispute has been
detected. No accounts, no names, no PII — a game is just a short code like
`debatable.lol/g/XK42P` that disappears after 30 days.

## Stack

- **Cloudflare Workers** — one Worker serves the API and the static frontend.
- **Cloudflare D1** (SQLite) — one row per game; atomic conditional updates
  make submission locking race-proof.
- **Vite + vanilla TypeScript** — the frontend is a ~7 KB (gzip) SPA. No
  framework; the app is eight screens and a fetch.
- **Hono** — tiny router for the API.

Free tier covers MVP traffic comfortably, deploys with one command, and
custom domains are first-class.

## Project structure

```
├── index.html            # SPA shell (Vite entry)
├── schema.sql            # D1 schema (one `games` table)
├── wrangler.jsonc        # Worker + assets + D1 + cron config
├── vite.config.ts
├── shared/               # Code used by BOTH worker and frontend
│   ├── config.ts         # APP_NAME, PUBLIC_DOMAIN, expiration, flags
│   ├── packs.ts          # Question packs (structured data)
│   ├── verdicts.ts       # Verdict bank + prediction flavor copy
│   └── types.ts          # API request/response types
├── worker/
│   ├── index.ts          # Hono API + scheduled cleanup
│   └── tsconfig.json
└── src/                  # Frontend
    ├── main.ts           # Router + game-entry orchestration
    ├── quiz.ts           # Question flow + prediction screen (both players)
    ├── screens.ts        # Landing, share, waiting, P2 intro, dead-ends
    ├── reveal.ts         # Score → per-question cards → predictions → verdict
    ├── card.ts           # Client-side PNG of the result card
    ├── api.ts            # Typed fetch wrappers
    ├── storage.ts        # localStorage: drafts + browser role memory
    ├── ui.ts             # Tiny DOM helpers
    └── styles.css        # The whole design system
```

## Configuration

Everything brand/behavior-level lives in `shared/config.ts`:

```ts
APP_NAME = "Debatable"
PUBLIC_DOMAIN = "debatable.lol"
GAME_EXPIRATION_DAYS = 30
ENABLE_PREDICTIONS = true
CURRENT_PACK_ID = "original"
```

Set `ENABLE_PREDICTIONS = false` and the prediction screens and prediction
reveal disappear cleanly (the API accepts and stores `null`).

No environment variables or secrets are required. The only per-account value
is the D1 `database_id` in `wrangler.jsonc`.

## Local development

```bash
npm install
npx wrangler d1 create debatable-db          # once; paste database_id into wrangler.jsonc
npm run db:local                             # apply schema.sql to the local D1
npm run dev                                  # build frontend + wrangler dev → http://localhost:8787
```

For frontend iteration with rebuild-on-save, run `npm run watch` in a second
terminal alongside `wrangler dev` (or use `vite dev` on :5173, which proxies
`/api` to :8787).

## Deployment

```bash
npm install
npx wrangler login

# 1. Create the production database (once)
npx wrangler d1 create debatable-db
#    → copy the printed database_id into wrangler.jsonc

# 2. Apply the schema to production
npm run db:remote

# 3. Build + deploy
npm run deploy
```

That's it — the Worker serves the app at `https://debatable.<your-subdomain>.workers.dev`.

### Custom domain (debatable.lol)

1. Add `debatable.lol` as a site in your Cloudflare account (Dashboard →
   Add a domain), and point the domain's nameservers at Cloudflare (set at
   your registrar; Cloudflare shows the two nameservers to use).
2. Dashboard → **Workers & Pages → debatable → Settings → Domains & Routes →
   Add → Custom domain** → enter `debatable.lol`. Cloudflare creates the DNS
   record and certificate automatically.
3. Optionally add `www.debatable.lol` the same way, or a Bulk Redirect from
   `www` to the apex.

No code changes needed — `PUBLIC_DOMAIN` in `shared/config.ts` is already
`debatable.lol` (it's used for display and the share card; share links
always use the origin the player is on).

## How server-side answer secrecy is enforced

Player 1's answers only exist in two places server-side responses can draw
from, and both are gated:

- A game is **created together with Player 1's locked answers** in one
  `INSERT` (`POST /api/games`). There is no server state where a shareable
  game exists with an editable Player 1 side.
- `GET /api/games/:code` (the only endpoint Player 2's client touches before
  locking) returns exactly `{code, packId, state, expiresAt}` — answers are
  never serialized into it, so they can't be found in the page source or any
  network response.
- Both players' answers leave the server **only** via
  `GET /api/games/:code/reveal`, which refuses with `409` until Player 2's
  row is committed.
- Player 2's lock is atomic: `UPDATE … WHERE code = ? AND p2_submitted_at IS
  NULL`. If zero rows change, the submission is rejected (`409`) — a
  double-tap, a refresh mid-submit, or a second person on the link can never
  overwrite a locked side.

## How 30-day expiration works

- Each row stores `expires_at = created_at + GAME_EXPIRATION_DAYS`.
- Every API route checks `expires_at` and answers `410` for expired games;
  the frontend renders "This debate has expired." with a start-over CTA.
  Expiry is therefore correct even if cleanup never ran.
- A daily cron trigger (`triggers.crons` in `wrangler.jsonc`) runs the
  Worker's `scheduled()` handler, which `DELETE`s expired rows so the table
  doesn't grow forever.

## How to add another question pack later

1. Add an entry to `PACKS` in `shared/packs.ts`:

```ts
export const PACKS: Record<string, Pack> = {
  original: { ... },
  movies: {
    id: "movies",
    name: "Movies",
    questions: [ /* exactly 7, each with two choices + a short card topic */ ],
  },
};
```

2. Each game row already stores its `pack_id`, and every screen (quiz,
   reveal, card) reads questions via `getPack(game.packId)` — so existing
   games keep rendering with the pack they were created with.
3. To switch which pack new games use, change `CURRENT_PACK_ID` in
   `shared/config.ts`. (A pack-selection screen is deliberately not built
   in v1; when you want one, pass a `packId` into `POST /api/games` and
   validate it against `PACKS`.)

## Privacy posture

No accounts, names, emails, tracking, fingerprinting, or analytics. The
server stores only: game code, pack id, timestamps, fourteen 0/1 answers and
two 0–7 predictions. IPs are not intentionally stored (standard Cloudflare
request logs are outside the app). `localStorage` remembers which side a
browser played purely so you can't accidentally answer your own quiz.
