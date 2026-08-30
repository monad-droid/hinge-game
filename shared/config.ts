// Central app configuration. Brand and domain live here so they can be
// swapped without touching game logic or UI components.

export const APP_NAME = "Debatable";
export const PUBLIC_DOMAIN = "debatable.lol";
export const GAME_EXPIRATION_DAYS = 30;
export const ENABLE_PREDICTIONS = true;

// The question pack new games are created from. Only one pack exists in v1;
// pack selection UI is intentionally out of scope.
export const CURRENT_PACK_ID = "original";

export const QUESTIONS_PER_GAME = 7;

// Game codes: unambiguous alphabet (no 0/O, 1/I/l), 5 characters.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 5;
