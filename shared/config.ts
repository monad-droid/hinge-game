// Central app configuration. Brand and domain live here so they can be
// swapped without touching game logic or UI components.

export const APP_NAME = "Debatable";
export const PUBLIC_DOMAIN = "debatable.lol";
export const GAME_EXPIRATION_DAYS = 30;
// Off for now — the "how alike do you think you are?" step is on trial.
// Flipping this back on restores the prediction screens and reveal beat.
export const ENABLE_PREDICTIONS = false;

// The flappy tiebreaker after question 7: one attempt, skippable, both
// scores compared in the reveal. Flip off to remove it from the flow
// entirely (stored scores are simply ignored).
export const ENABLE_MINIGAME = true;
export const FLAPPY_MAX_SCORE = 9999;

// Finish the Drawing: the collaborative bonus round after the questions.
// Off removes it from the flow; stored strokes are simply ignored.
export const ENABLE_DRAWING = true;

// The question pack every new game is created from — the one live question
// list. Existing games keep the pack they were created with, so bumping
// this never rewrites an old game's reveal.
export const CURRENT_PACK_ID = "original-v3";

export const QUESTIONS_PER_GAME = 7;

// Game codes: unambiguous alphabet (no 0/O, 1/I/l), 5 characters.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 5;
