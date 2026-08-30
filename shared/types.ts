// Types shared between the Worker API and the frontend.

export type Answer = 0 | 1;

export type GameState = "WAITING_FOR_P2" | "COMPLETE";

// GET /api/games/:code — safe for anyone holding the link.
// Never contains answers.
export interface GameStatus {
  code: string;
  packId: string;
  state: GameState;
  expiresAt: number;
}

// POST /api/games — creates the game with Player 1's side already locked.
export interface CreateGameRequest {
  answers: Answer[];
  prediction: number | null;
}

export interface CreateGameResponse {
  code: string;
}

// POST /api/games/:code/p2
export interface SubmitP2Request {
  answers: Answer[];
  prediction: number | null;
}

// GET /api/games/:code/reveal — only served once the game is COMPLETE.
export interface RevealResponse {
  code: string;
  packId: string;
  p1: PlayerSide;
  p2: PlayerSide;
  score: number;
}

export interface PlayerSide {
  answers: Answer[];
  prediction: number | null;
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
