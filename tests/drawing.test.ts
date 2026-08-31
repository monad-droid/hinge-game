// Scoring + assignment tests for Finish the Drawing.
// Run: npm test  (node --experimental-strip-types --test tests/)

import test from "node:test";
import assert from "node:assert/strict";
import {
  CHALLENGES,
  getChallenge,
  otherComponentId,
  resample,
  sanitizeStroke,
  teamScore,
  type PointTriple,
} from "../shared/drawing.ts";

const house = getChallenge("house_v1")!;
const [roof, body] = house.components;

// Deterministic pseudo-random for reproducible "hand wobble".
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function trace(path: { x: number; y: number }[], opts?: { jitter?: number; dx?: number; dy?: number; seed?: number }) {
  const jitter = opts?.jitter ?? 0;
  const rand = rng(opts?.seed ?? 42);
  return resample(path, 120).map((p) => ({
    x: p.x + (opts?.dx ?? 0) + (rand() - 0.5) * 2 * jitter,
    y: p.y + (opts?.dy ?? 0) + (rand() - 0.5) * 2 * jitter,
  }));
}

function scoreWith(roofStroke: { x: number; y: number }[], bodyStroke: { x: number; y: number }[]): number {
  return teamScore(house, [
    { componentId: "roof", points: roofStroke },
    { componentId: "house", points: bodyStroke },
  ]);
}

test("component assignment is always the opposite", () => {
  assert.equal(otherComponentId(house, "roof"), "house");
  assert.equal(otherComponentId(house, "house"), "roof");
});

test("challenge components share the master coordinate system", () => {
  for (const component of house.components) {
    for (const p of component.referencePath) {
      assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
    }
  }
});

test("perfect traces score very high but 100 stays hard", () => {
  const s = scoreWith(trace(roof.referencePath), trace(body.referencePath));
  assert.ok(s >= 93, `perfect trace scored ${s}`);
});

test("recognizable wobble lands in the satisfying band", () => {
  const s = scoreWith(
    trace(roof.referencePath, { jitter: 0.02, seed: 7 }),
    trace(body.referencePath, { jitter: 0.02, seed: 8 })
  );
  assert.ok(s >= 72 && s <= 96, `wobbly trace scored ${s}`);
});

test("misplaced-but-plausible attempts land mid-band", () => {
  const s = scoreWith(
    trace(roof.referencePath, { jitter: 0.015, dx: 0.06, dy: -0.03, seed: 9 }),
    trace(body.referencePath, { jitter: 0.015, dx: -0.05, dy: 0.04, seed: 10 })
  );
  assert.ok(s >= 45 && s <= 80, `offset attempt scored ${s}`);
});

test("one missing component is heavily penalized", () => {
  const s = teamScore(house, [{ componentId: "roof", points: trace(roof.referencePath) }]);
  const full = scoreWith(trace(roof.referencePath), trace(body.referencePath));
  assert.ok(s < 45, `half a house scored ${s}`);
  assert.ok(s < full - 30);
});

test("chaos scores like chaos", () => {
  const rand = rng(1234);
  const scribble = Array.from({ length: 120 }, () => ({ x: rand(), y: rand() }));
  const s = scoreWith(scribble, scribble);
  assert.ok(s < 45, `scribble scored ${s}`);
});

test("score degrades monotonically as drawings get worse", () => {
  const bands = [0, 0.015, 0.04, 0.09].map((jitter) =>
    scoreWith(
      trace(roof.referencePath, { jitter, seed: 3 }),
      trace(body.referencePath, { jitter, seed: 4 })
    )
  );
  for (let i = 1; i < bands.length; i++) {
    assert.ok(bands[i]! <= bands[i - 1]!, `band ${i} (${bands[i]}) > band ${i - 1} (${bands[i - 1]})`);
  }
});

test("empty team scores zero", () => {
  assert.equal(teamScore(house, []), 0);
});

test("sanitizeStroke accepts a plausible stroke and clamps/caps it", () => {
  const raw: PointTriple[] = resample(body.referencePath, 500).map((p, i) => [p.x, p.y, i * 4]);
  raw[0] = [-0.05, raw[0]![1], 0]; // slight out-of-bounds is clamped
  const cleaned = sanitizeStroke(raw);
  assert.ok(cleaned && cleaned.length >= 8 && cleaned.length <= 240);
  for (const [x, y] of cleaned!) assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1);
});

test("sanitizeStroke rejects garbage", () => {
  assert.equal(sanitizeStroke(null), null);
  assert.equal(sanitizeStroke([[0.5, 0.5, 0]]), null); // too short
  assert.equal(sanitizeStroke([[9, 9, 0], [0.2, 0.2, 5]]), null); // far out of bounds
  const tap: PointTriple[] = Array.from({ length: 20 }, (_, i) => [0.5 + i * 0.001, 0.5, i]);
  assert.equal(sanitizeStroke(tap), null); // too little path length
});
