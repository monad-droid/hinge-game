// Verdict copy, keyed by agreement score (0–7). Entertainment only — none of
// this implies real compatibility, and it should stay that way.

export const VERDICTS: Record<number, string[]> = {
  7: [
    "Unfortunately, you share one brain.",
    "This is getting suspicious.",
    "Zero notes.",
  ],
  6: [
    "Suspiciously aligned.",
    "Almost unsettling.",
    "One disagreement away from concerning.",
  ],
  5: [
    "Strong showing.",
    "Enough agreement to be suspicious.",
    "Basically on the same side.",
  ],
  4: [
    "Perfectly debatable.",
    "Right down the middle.",
    "Exactly enough disagreement.",
  ],
  3: [
    "There are some things to discuss.",
    "Healthy amount of disagreement.",
    "The evidence is mixed.",
  ],
  2: [
    "This might require a conversation.",
    "Bold differences of opinion.",
    "Several disputes detected.",
  ],
  1: [
    "At least you found each other.",
    "Remarkable work.",
    "One glorious point of agreement.",
  ],
  0: [
    "Honestly impressive.",
    "You couldn't do this again if you tried.",
    "Complete ideological collapse. Over absolutely nothing.",
  ],
};

// Reactive flavor for the 0–7 prediction selector.
export const PREDICTION_FLAVOR: Record<number, string> = {
  7: "Very confident.",
  6: "Bold.",
  5: "Optimistic.",
  4: "Playing it safe.",
  3: "Hedging.",
  2: "Expecting problems.",
  1: "Grim.",
  0: "Honestly, impressive if true.",
};

// Short reactions to how a prediction compared with reality.
export function predictionReaction(predicted: number, actual: number): string {
  const diff = predicted - actual;
  if (diff === 0) return "Called it.";
  if (diff === 1 || diff === -1) return "Respectable.";
  if (diff >= 2) return "Interesting confidence.";
  return "Underestimated yourselves.";
}

// Both players should see the same verdict, so pick deterministically from
// the game code instead of at random per client.
export function pickVerdict(score: number, seed: string): string {
  const options = VERDICTS[score] ?? VERDICTS[4]!;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return options[h % options.length]!;
}

// Team-drawing verdicts by score band. Jokes only — never competence claims.
export const DRAW_VERDICTS: [number, string[]][] = [
  [90, ["Suspiciously competent.", "Okay, that's actually good.", "Architects, apparently."]],
  [75, ["Shockingly habitable.", "Honestly? Pretty solid.", "You might get the deposit back."]],
  [50, ["It's technically a house.", "The vision was there.", "Some assembly issues."]],
  [25, ["We're choosing not to involve an inspector.", "Structurally ambitious.", "Plans were not communicated."]],
  [0, ["Condemned immediately.", "This feels personal.", "The HOA has been notified."]],
];

export function pickDrawVerdict(score: number, seed: string): string {
  const band = DRAW_VERDICTS.find(([min]) => score >= min) ?? DRAW_VERDICTS[DRAW_VERDICTS.length - 1]!;
  const options = band[1];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 33 + seed.charCodeAt(i)) >>> 0;
  return options[h % options.length]!;
}
