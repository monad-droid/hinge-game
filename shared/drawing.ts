// Finish the Drawing: challenge definitions, stroke geometry, and the
// deterministic team-scoring used by both the Worker (authoritative score)
// and the client (rendering). Self-contained on purpose — no imports — so
// tests can run it directly under Node.
//
// Everything lives in one master coordinate system, the unit square:
// (0,0) top-left → (1,1) bottom-right. Reference component paths, player
// strokes, and scoring all use it, so the two players' strokes combine into
// one object with no repositioning.

export interface NormPoint {
  x: number;
  y: number;
  t: number; // ms since stroke start
}

// Wire/storage format: compact triples [x, y, t].
export type PointTriple = [number, number, number];

export interface DrawingComponent {
  id: string;
  label: string; // "the roof"
  // One-stroke-friendly reference polyline in master coordinates.
  referencePath: { x: number; y: number }[];
  start: { x: number; y: number };
}

export interface DrawingChallenge {
  id: string;
  name: string;
  components: [DrawingComponent, DrawingComponent];
}

// ——— house_v1 ———
// Both components are closed polylines drawable in one continuous stroke,
// sharing the master square: roof triangle up top, body (with door notch)
// below, meeting at y = 0.40.

export const CHALLENGES: Record<string, DrawingChallenge> = {
  house_v1: {
    id: "house_v1",
    name: "House",
    components: [
      {
        id: "roof",
        label: "the roof",
        referencePath: [
          { x: 0.12, y: 0.4 },
          { x: 0.5, y: 0.1 },
          { x: 0.88, y: 0.4 },
          { x: 0.12, y: 0.4 },
        ],
        start: { x: 0.12, y: 0.4 },
      },
      {
        id: "house",
        label: "the house",
        referencePath: [
          { x: 0.17, y: 0.4 },
          { x: 0.17, y: 0.9 },
          { x: 0.4, y: 0.9 },
          { x: 0.4, y: 0.66 },
          { x: 0.6, y: 0.66 },
          { x: 0.6, y: 0.9 },
          { x: 0.83, y: 0.9 },
          { x: 0.83, y: 0.4 },
          { x: 0.17, y: 0.4 },
        ],
        start: { x: 0.17, y: 0.4 },
      },
    ],
  },
};

export const CURRENT_CHALLENGE_ID = "house_v1";

export function getChallenge(id: string): DrawingChallenge | undefined {
  return CHALLENGES[id];
}

export function otherComponentId(challenge: DrawingChallenge, componentId: string): string {
  const [a, b] = challenge.components;
  return componentId === a.id ? b.id : a.id;
}

export function getComponent(
  challenge: DrawingChallenge,
  componentId: string
): DrawingComponent | undefined {
  return challenge.components.find((c) => c.id === componentId);
}

// ——— geometry ———

type XY = { x: number; y: number };

export function pathLength(points: XY[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  return length;
}

// Uniform arc-length resampling to exactly n points.
export function resample(points: XY[], n: number): XY[] {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: n }, () => ({ ...points[0]! }));
  const total = pathLength(points);
  if (total === 0) return Array.from({ length: n }, () => ({ ...points[0]! }));
  const step = total / (n - 1);
  const out: XY[] = [{ x: points[0]!.x, y: points[0]!.y }];
  let carried = 0;
  let i = 1;
  let prev = points[0]!;
  while (out.length < n && i < points.length) {
    const seg = Math.hypot(points[i]!.x - prev.x, points[i]!.y - prev.y);
    if (carried + seg >= step && seg > 0) {
      const f = (step - carried) / seg;
      const q = { x: prev.x + f * (points[i]!.x - prev.x), y: prev.y + f * (points[i]!.y - prev.y) };
      out.push(q);
      prev = q;
      carried = 0;
    } else {
      carried += seg;
      prev = points[i]!;
      i++;
    }
  }
  while (out.length < n) out.push({ ...points[points.length - 1]! });
  return out;
}

// Drop near-duplicate samples and cap the count — applied before storing a
// player stroke so we never persist raw pointer firehose data.
export function decimate(points: NormPoint[], minDist = 0.004, maxPoints = 240): NormPoint[] {
  const out: NormPoint[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= minDist) out.push(p);
  }
  if (out.length <= maxPoints) return out;
  const step = out.length / maxPoints;
  const thinned: NormPoint[] = [];
  for (let i = 0; i < maxPoints; i++) thinned.push(out[Math.floor(i * step)]!);
  const last = out[out.length - 1]!;
  if (thinned[thinned.length - 1] !== last) thinned[thinned.length - 1] = last;
  return thinned;
}

function avgNearestDistance(from: XY[], to: XY[]): number {
  if (from.length === 0 || to.length === 0) return 1;
  let sum = 0;
  for (const p of from) {
    let best = Infinity;
    for (const q of to) {
      const d = (p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y);
      if (d < best) best = d;
    }
    sum += Math.sqrt(best);
  }
  return sum / from.length;
}

// Symmetric Chamfer distance in master units: penalizes both target regions
// the players missed and player ink far from the target.
export function chamfer(a: XY[], b: XY[]): number {
  return (avgNearestDistance(a, b) + avgNearestDistance(b, a)) / 2;
}

// ——— team scoring ———
// One score for the combined drawing vs the complete reference. The error →
// score mapping is exponential, calibrated by tests/drawing.test.ts:
// near-perfect traces land high-90s, recognizable-but-wobbly 75–90,
// misplaced-but-plausible 50–75, chaos under 40.

// Calibrated in tests/drawing.test.ts against generated strokes:
// err 0.0024 (perfect trace) → 98, 0.009 (light wobble) → 91,
// 0.035 (offset but plausible) → 54, 0.05 (scribble) → 36,
// 0.065 (missing component) → 24.
const SAMPLES_PER_COMPONENT = 160;
const SCORE_SCALE = 0.05;
const SCORE_EXPONENT = 1.35;

export function teamScore(
  challenge: DrawingChallenge,
  strokes: { componentId: string; points: XY[] }[]
): number {
  const target: XY[] = [];
  for (const component of challenge.components) {
    target.push(...resample(component.referencePath, SAMPLES_PER_COMPONENT));
  }
  const drawn: XY[] = [];
  for (const stroke of strokes) {
    if (stroke.points.length >= 2) {
      drawn.push(...resample(stroke.points, SAMPLES_PER_COMPONENT));
    }
  }
  if (drawn.length === 0) return 0;
  const err = chamfer(drawn, target);
  const score = 100 * Math.exp(-Math.pow(err / SCORE_SCALE, SCORE_EXPONENT));
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ——— (de)serialization + validation of the wire format ———

export const MAX_STORED_POINTS = 240;
export const MIN_VALID_POINTS = 8;
export const MIN_VALID_LENGTH = 0.12; // in master units — filters accidental taps

export function triplesToPoints(triples: PointTriple[]): NormPoint[] {
  return triples.map(([x, y, t]) => ({ x, y, t }));
}

export function pointsToTriples(points: NormPoint[]): PointTriple[] {
  return points.map((p) => [
    Math.round(p.x * 1000) / 1000,
    Math.round(p.y * 1000) / 1000,
    Math.round(p.t),
  ]);
}

// Server-side sanitizer: returns cleaned triples, or null if the payload
// isn't a plausible stroke.
export function sanitizeStroke(value: unknown): PointTriple[] | null {
  if (!Array.isArray(value) || value.length < MIN_VALID_POINTS || value.length > 2000) return null;
  const cleaned: PointTriple[] = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 3) return null;
    const [x, y, t] = entry as [unknown, unknown, unknown];
    if (typeof x !== "number" || typeof y !== "number" || typeof t !== "number") return null;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(t)) return null;
    if (x < -0.25 || x > 1.25 || y < -0.25 || y > 1.25) return null;
    cleaned.push([
      Math.round(Math.min(1, Math.max(0, x)) * 1000) / 1000,
      Math.round(Math.min(1, Math.max(0, y)) * 1000) / 1000,
      Math.max(0, Math.round(t)),
    ]);
  }
  const asPoints = triplesToPoints(cleaned);
  if (pathLength(asPoints) < MIN_VALID_LENGTH) return null;
  const thinned = decimate(asPoints, 0.004, MAX_STORED_POINTS);
  if (thinned.length < MIN_VALID_POINTS) return null;
  return pointsToTriples(thinned);
}
