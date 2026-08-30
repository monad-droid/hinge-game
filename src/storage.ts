// localStorage helpers. This is a UX safeguard (resume after refresh, don't
// accidentally play against yourself) — never identity or security.

import type { Answer } from "../shared/types";

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
}

export function getDraft(key: string): Draft | null {
  const draft = read<Draft>(`draft.${key}`);
  if (!draft || !Array.isArray(draft.answers)) return null;
  const clean: Draft = {
    answers: draft.answers.filter((a): a is Answer => a === 0 || a === 1),
  };
  if (typeof draft.flappy === "number" || draft.flappy === null) clean.flappy = draft.flappy;
  return clean;
}

export function setDraft(key: string, draft: Draft): void {
  write(`draft.${key}`, draft);
}

export function clearDraft(key: string): void {
  remove(`draft.${key}`);
}
