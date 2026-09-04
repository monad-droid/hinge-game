// Types shared between the Worker API and the frontend.

import type { PointTriple } from "./drawing";

export type Answer = 0 | 1;

// Finish the Drawing submissions. Player 1 chooses the component; Player 2
// never sends one (the server assigns the opposite). null = sat out.
export interface DrawingSubmission {
  component?: string;
  points: PointTriple[];
  mulligan: boolean;
}

export type GameState = "WAITING_FOR_P2" | "COMPLETE";

// GET /api/games/:code — safe for anyone holding the link.
// Never contains answers.
export interface GameStatus {
  code: string;
  packId: string;
  state: GameState;
  expiresAt: number;
  // Which drawing component Player 1 took (safe to share — it tells
  // Player 2 which part is theirs). null when P1 sat the drawing out.
  drawChallengeId: string | null;
  drawComponent: string | null;
}

// POST /api/games — creates the game with Player 1's side already locked.
// flappy is the tiebreaker score: a number, or null if skipped/disabled.
// flappyRetry marks a score earned via the zero-pity retry.
export interface CreateGameRequest {
  answers: Answer[];
  prediction: number | null;
  flappy: number | null;
  flappyRetry: boolean;
  drawing: DrawingSubmission | null;
}

export interface CreateGameResponse {
  code: string;
}

// POST /api/games/:code/p2
export interface SubmitP2Request {
  answers: Answer[];
  prediction: number | null;
  flappy: number | null;
  flappyRetry: boolean;
  drawing: DrawingSubmission | null;
}

// GET /api/games/:code/reveal — only served once the game is COMPLETE.
export interface RevealResponse {
  code: string;
  packId: string;
  p1: PlayerSide;
  p2: PlayerSide;
  score: number;
  // Present only when both players completed the drawing.
  drawing: DrawingReveal | null;
}

export interface DrawingReveal {
  challengeId: string;
  p1: { component: string; points: PointTriple[] };
  p2: { component: string; points: PointTriple[] };
  teamScore: number;
}

export interface PlayerSide {
  answers: Answer[];
  prediction: number | null;
  flappy: number | null;
  // True when the flappy score came from the zero-pity retry.
  flappyRetry: boolean;
}

export interface ApiError {
  error:
    | "not_found"
    | "expired"
    | "already_settled"
    | "not_ready"
    | "bad_request";
  message: string;
}
