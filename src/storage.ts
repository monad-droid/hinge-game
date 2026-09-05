// localStorage helpers. This is a UX safeguard (resume after refresh, don't
// accidentally play against yourself) — never identity or security.

import type { Answer, DrawingSubmission } from "../shared/types";

const PREFIX = "debatable.";

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Private mode / storage full — the game still works, just without resume.
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

export type Role = "p1" | "p2";

export function getRole(code: string): Role | null {
  return read<Role>(`role.${code}`);
}

export function setRole(code: string, role: Role): void {
  write(`role.${code}`, role);
}

// In-progress answers, so a refresh doesn't erase progress. `flappy` is set
// once the tiebreaker has been played (a score) or skipped (null); absent
// means not yet offered — that's what makes it one attempt per side.
export interface Draft {
  answers: Answer[];
  flappy?: number | null;
  // True when the flappy score came from the zero-pity retry.
  flappyRetry?: boolean;
  // Set once the drawing round is finished (submission) or sat out (null);
  // absent = not yet offered — that's what makes it one attempt per side.
  drawing?: DrawingSubmission | null;
}

export function getDraft(key: string): Draft | null {
  const draft = read<Draft>(`draft.${key}`);
  if (!draft || !Array.isArray(draft.answers)) return null;
  const clean: Draft = {
    answers: draft.answers.filter((a): a is Answer => a === 0 || a === 1),
  };
  if (typeof draft.flappy === "number" || draft.flappy === null) clean.flappy = draft.flappy;
  if (typeof draft.flappyRetry === "boolean") clean.flappyRetry = draft.flappyRetry;
  if (draft.drawing === null) {
    clean.drawing = null;
  } else if (
    draft.drawing &&
    typeof draft.drawing === "object" &&
    Array.isArray(draft.drawing.points)
  ) {
    clean.drawing = draft.drawing;
  }
  return clean;
}

export function setDraft(key: string, draft: Draft): void {
  write(`draft.${key}`, draft);
}

export function clearDraft(key: string): void {
  remove(`draft.${key}`);
}

// One anonymous bit for aggregate stats: has this browser ever created a
// game? Self-declared, per-browser, never an identifier.
export function hasCreatedBefore(): boolean {
  return read<boolean>("creator") === true;
}

export function markCreated(): void {
  write("creator", true);
}

// Cold-start reconciliation: browsers that created games before the
// creator flag existed still hold per-code role memories. A stored "p1"
// role proves a past creation, so mark those browsers as returning —
// otherwise every pre-existing creator counts as "new" once.
export function reconcileCreatorFlag(): void {
  if (hasCreatedBefore()) return;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX + "role.") && localStorage.getItem(k) === '"p1"') {
        markCreated();
        return;
      }
    }
  } catch {
    // storage unavailable — nothing to reconcile
  }
}
