import { Hono } from "hono";
import type { Context } from "hono";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  CURRENT_PACK_ID,
  ENABLE_DRAWING,
  ENABLE_MINIGAME,
  ENABLE_PREDICTIONS,
  FLAPPY_MAX_SCORE,
  GAME_EXPIRATION_DAYS,
  QUESTIONS_PER_GAME,
} from "../shared/config";
import {
  CURRENT_CHALLENGE_ID,
  getChallenge,
  getComponent,
  otherComponentId,
  sanitizeStroke,
  teamScore,
  triplesToPoints,
} from "../shared/drawing";
import type { PointTriple } from "../shared/drawing";
import { getPack } from "../shared/packs";
import type {
  Answer,
  ApiError,
  CreateGameResponse,
  GameStatus,
  RevealResponse,
} from "../shared/types";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

interface GameRow {
  code: string;
  pack_id: string;
  created_at: number;
  expires_at: number;
  p1_answers: string;
  p1_prediction: number | null;
  p1_flappy: number | null;
  p1_submitted_at: number;
  p2_answers: string | null;
  p2_prediction: number | null;
  p2_flappy: number | null;
  p2_submitted_at: number | null;
  draw_challenge: string | null;
  p1_draw_component: string | null;
  p1_draw_points: string | null;
  p1_draw_mulligan: number | null;
  p2_draw_points: string | null;
  p2_draw_mulligan: number | null;
}

const app = new Hono<{ Bindings: Env }>();

// ---------- helpers ----------

function err(c: Context, status: 400 | 404 | 409 | 410 | 500, error: ApiError["error"], message: string) {
  return c.json({ error, message } satisfies ApiError, status);
}

function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

function isValidCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return false;
  return true;
}

// Accepts exactly QUESTIONS_PER_GAME answers, each 0 or 1.
function parseAnswers(value: unknown): Answer[] | null {
  if (!Array.isArray(value) || value.length !== QUESTIONS_PER_GAME) return null;
  const answers: Answer[] = [];
  for (const v of value) {
    if (v !== 0 && v !== 1) return null;
    answers.push(v);
  }
  return answers;
}

// Prediction is an integer 0–7 when predictions are enabled, else null.
function parsePrediction(value: unknown): { ok: boolean; prediction: number | null } {
  if (!ENABLE_PREDICTIONS || value === null || value === undefined) {
    return { ok: true, prediction: null };
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= QUESTIONS_PER_GAME) {
    return { ok: true, prediction: value };
  }
  return { ok: false, prediction: null };
}

// Tiebreaker score: a small non-negative integer, or null when the player
// skipped it (or the minigame is disabled).
function parseFlappy(value: unknown): { ok: boolean; flappy: number | null } {
  if (!ENABLE_MINIGAME || value === null || value === undefined) {
    return { ok: true, flappy: null };
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= FLAPPY_MAX_SCORE) {
    return { ok: true, flappy: value };
  }
  return { ok: false, flappy: null };
}

// Finish the Drawing submissions. Returns ok:false only for actively
// malformed payloads; a null/absent drawing (sat out / feature off / old
// client) is valid and stores nothing. Player 1 must name a real component
// of the current challenge; Player 2 never chooses (the server assigns the
// opposite of Player 1's, and rejects any attempt to claim one).
function parseDrawing(
  value: unknown,
  role: "p1" | "p2"
): { ok: boolean; component: string | null; points: string | null; mulligan: number | null } {
  const none = { ok: true, component: null, points: null, mulligan: null };
  if (!ENABLE_DRAWING || value === null || value === undefined) return none;
  if (typeof value !== "object") return { ...none, ok: false };
  const { component, points, mulligan } = value as Record<string, unknown>;
  const challenge = getChallenge(CURRENT_CHALLENGE_ID)!;
  if (role === "p1") {
    if (typeof component !== "string" || !getComponent(challenge, component)) {
      return { ...none, ok: false };
    }
  } else if (component !== undefined && component !== null) {
    // P2 may not pick a component — theirs is derived server-side.
    return { ...none, ok: false };
  }
  const cleaned = sanitizeStroke(points);
  if (!cleaned) return { ...none, ok: false };
  return {
    ok: true,
    component: role === "p1" ? (component as string) : null,
    points: JSON.stringify(cleaned),
    mulligan: mulligan === true ? 1 : 0,
  };
}

function serializeAnswers(answers: Answer[]): string {
  return answers.join("");
}

function deserializeAnswers(s: string): Answer[] {
  return s.split("").map((ch) => (ch === "1" ? 1 : 0));
}

function isExpired(row: GameRow, now: number): boolean {
  return now >= row.expires_at;
}

function stateOf(row: GameRow): GameStatus["state"] {
  return row.p2_submitted_at === null ? "WAITING_FOR_P2" : "COMPLETE";
}

async function loadGame(db: D1Database, code: string): Promise<GameRow | null> {
  return db
    .prepare("SELECT * FROM games WHERE code = ?")
    .bind(code)
    .first<GameRow>();
}

// ---------- routes ----------

// Create a game. Player 1's answers arrive with creation, so a game only
// exists once Player 1 is already locked in — there is no window where a
// shared link points at a half-created Player 1 side.
app.post("/api/games", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return err(c, 400, "bad_request", "Malformed request.");
  }
  const { answers: rawAnswers, prediction: rawPrediction, flappy: rawFlappy } = (body ?? {}) as Record<string, unknown>;

  const answers = parseAnswers(rawAnswers);
  if (!answers) return err(c, 400, "bad_request", "Exactly 7 answers of 0 or 1 are required.");
  const { ok, prediction } = parsePrediction(rawPrediction);
  if (!ok) return err(c, 400, "bad_request", "Prediction must be an integer from 0 to 7.");
  const flappyParsed = parseFlappy(rawFlappy);
  if (!flappyParsed.ok) return err(c, 400, "bad_request", "Tiebreaker score is invalid.");
  const drawParsed = parseDrawing((body as Record<string, unknown>).drawing, "p1");
  if (!drawParsed.ok) return err(c, 400, "bad_request", "Drawing payload is invalid.");

  const pack = getPack(CURRENT_PACK_ID);
  if (!pack) return err(c, 500, "bad_request", "No question pack configured.");

  const now = Date.now();
  const expiresAt = now + GAME_EXPIRATION_DAYS * 24 * 60 * 60 * 1000;

  // Retry on the (unlikely) code collision — the PRIMARY KEY makes the
  // uniqueness check and the insert atomic.
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateCode();
    try {
      await c.env.DB.prepare(
        `INSERT INTO games (code, pack_id, created_at, expires_at, p1_answers, p1_prediction, p1_flappy, p1_submitted_at,
                            draw_challenge, p1_draw_component, p1_draw_points, p1_draw_mulligan)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          code, pack.id, now, expiresAt, serializeAnswers(answers), prediction, flappyParsed.flappy, now,
          drawParsed.points ? CURRENT_CHALLENGE_ID : null,
          drawParsed.component, drawParsed.points, drawParsed.mulligan
        )
        .run();
      return c.json<CreateGameResponse>({ code }, 201);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("UNIQUE") && !msg.includes("PRIMARY")) throw e;
    }
  }
  return err(c, 500, "bad_request", "Could not create a game. Try again.");
});

// Public game status. This is all a Player 2 client can ever see before
// locking in: state, pack, expiry. Player 1's answers are never included.
app.get("/api/games/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();
  if (!isValidCode(code)) return err(c, 404, "not_found", "That debate doesn't exist.");

  const row = await loadGame(c.env.DB, code);
  if (!row) return err(c, 404, "not_found", "That debate doesn't exist.");
  if (isExpired(row, Date.now())) return err(c, 410, "expired", "This debate has expired.");

  return c.json<GameStatus>({
    code: row.code,
    packId: row.pack_id,
    state: stateOf(row),
    expiresAt: row.expires_at,
    drawChallengeId: row.draw_challenge ?? null,
    drawComponent: row.p1_draw_component ?? null,
  });
});

// Submit Player 2's side. The conditional UPDATE (… WHERE p2_submitted_at IS
// NULL) makes the lock atomic: the first submission wins, any repeat — a
// double-tap, a refresh mid-submit, a second person opening the link — gets
// a 409 instead of overwriting.
app.post("/api/games/:code/p2", async (c) => {
  const code = c.req.param("code").toUpperCase();
  if (!isValidCode(code)) return err(c, 404, "not_found", "That debate doesn't exist.");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return err(c, 400, "bad_request", "Malformed request.");
  }
  const { answers: rawAnswers, prediction: rawPrediction, flappy: rawFlappy } = (body ?? {}) as Record<string, unknown>;

  const answers = parseAnswers(rawAnswers);
  if (!answers) return err(c, 400, "bad_request", "Exactly 7 answers of 0 or 1 are required.");
  const { ok, prediction } = parsePrediction(rawPrediction);
  if (!ok) return err(c, 400, "bad_request", "Prediction must be an integer from 0 to 7.");
  const flappyParsed = parseFlappy(rawFlappy);
  if (!flappyParsed.ok) return err(c, 400, "bad_request", "Tiebreaker score is invalid.");
  const drawParsed = parseDrawing((body as Record<string, unknown>).drawing, "p2");
  if (!drawParsed.ok) return err(c, 400, "bad_request", "Drawing payload is invalid.");

  const row = await loadGame(c.env.DB, code);
  if (!row) return err(c, 404, "not_found", "That debate doesn't exist.");
  if (isExpired(row, Date.now())) return err(c, 410, "expired", "This debate has expired.");
  if (row.p2_submitted_at !== null) {
    return err(c, 409, "already_settled", "Looks like this one is already settled.");
  }

  // A P2 drawing only counts when P1 actually drew (otherwise there is no
  // assigned component and no combined result to make).
  const p2DrawPoints = row.p1_draw_points ? drawParsed.points : null;
  const p2DrawMulligan = p2DrawPoints ? drawParsed.mulligan : null;

  const result = await c.env.DB.prepare(
    `UPDATE games SET p2_answers = ?, p2_prediction = ?, p2_flappy = ?, p2_submitted_at = ?,
                      p2_draw_points = ?, p2_draw_mulligan = ?
     WHERE code = ? AND p2_submitted_at IS NULL`
  )
    .bind(serializeAnswers(answers), prediction, flappyParsed.flappy, Date.now(), p2DrawPoints, p2DrawMulligan, code)
    .run();

  if (!result.meta.changes) {
    return err(c, 409, "already_settled", "Looks like this one is already settled.");
  }
  return c.json({ ok: true }, 200);
});

// The reveal. Both sides' answers leave the server ONLY here, and only once
// both sides are locked. Until then, this endpoint refuses — answer secrecy
// is enforced server-side, not hidden in the frontend.
app.get("/api/games/:code/reveal", async (c) => {
  const code = c.req.param("code").toUpperCase();
  if (!isValidCode(code)) return err(c, 404, "not_found", "That debate doesn't exist.");

  const row = await loadGame(c.env.DB, code);
  if (!row) return err(c, 404, "not_found", "That debate doesn't exist.");
  if (isExpired(row, Date.now())) return err(c, 410, "expired", "This debate has expired.");
  if (row.p2_submitted_at === null || row.p2_answers === null) {
    return err(c, 409, "not_ready", "Still waiting on the other side.");
  }

  const p1 = deserializeAnswers(row.p1_answers);
  const p2 = deserializeAnswers(row.p2_answers);
  let score = 0;
  for (let i = 0; i < p1.length; i++) if (p1[i] === p2[i]) score++;

  return c.json<RevealResponse>({
    code: row.code,
    packId: row.pack_id,
    p1: {
      answers: p1,
      prediction: ENABLE_PREDICTIONS ? row.p1_prediction : null,
      flappy: ENABLE_MINIGAME ? row.p1_flappy : null,
    },
    p2: {
      answers: p2,
      prediction: ENABLE_PREDICTIONS ? row.p2_prediction : null,
      flappy: ENABLE_MINIGAME ? row.p2_flappy : null,
    },
    score,
    drawing: buildDrawingReveal(row),
  });
});

// Both strokes leave the server ONLY here (inside the completed-game
// reveal), combined with the single deterministic team score.
function buildDrawingReveal(row: GameRow): RevealResponse["drawing"] {
  if (!ENABLE_DRAWING) return null;
  if (!row.draw_challenge || !row.p1_draw_component || !row.p1_draw_points || !row.p2_draw_points) {
    return null;
  }
  const challenge = getChallenge(row.draw_challenge);
  if (!challenge) return null;
  let p1Points: PointTriple[];
  let p2Points: PointTriple[];
  try {
    p1Points = JSON.parse(row.p1_draw_points) as PointTriple[];
    p2Points = JSON.parse(row.p2_draw_points) as PointTriple[];
  } catch {
    return null; // malformed stored stroke — omit the section rather than crash
  }
  if (!Array.isArray(p1Points) || !Array.isArray(p2Points)) return null;
  const p2Component = otherComponentId(challenge, row.p1_draw_component);
  const score = teamScore(challenge, [
    { componentId: row.p1_draw_component, points: triplesToPoints(p1Points) },
    { componentId: p2Component, points: triplesToPoints(p2Points) },
  ]);
  return {
    challengeId: challenge.id,
    p1: { component: row.p1_draw_component, points: p1Points },
    p2: { component: p2Component, points: p2Points },
    teamScore: score,
  };
}

app.all("/api/*", (c) => err(c, 404, "not_found", "No such endpoint."));

// Anything else falls through to static assets, with explicit caching:
// HTML always revalidates (a stale index.html means users run an old
// version of the app after a deploy); hashed /assets/* files never change
// and cache forever.
app.all("*", async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  const contentType = res.headers.get("content-type") ?? "";
  const headers = new Headers(res.headers);
  if (contentType.includes("text/html")) {
    headers.set("Cache-Control", "no-cache, must-revalidate");
  } else if (new URL(c.req.url).pathname.startsWith("/assets/")) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  }
  return new Response(res.body, { status: res.status, headers });
});

export default {
  fetch: app.fetch,

  // Daily cleanup of expired games. Expiry is already enforced on every
  // request, so this just keeps the table from growing forever.
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await env.DB.prepare("DELETE FROM games WHERE expires_at <= ?")
      .bind(Date.now())
      .run();
  },
};
