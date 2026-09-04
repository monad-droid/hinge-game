// The reveal: score first, then each of the seven answers one at a time,
// then predictions, then the final verdict and shareable card. Paced, not
// a dashboard.

import { BUILT_BY, ENABLE_PREDICTIONS, PUBLIC_DOMAIN, QUESTIONS_PER_GAME } from "../shared/config";
import { getPack } from "../shared/packs";
import type { Pack, Question } from "../shared/packs";
import { pickDrawVerdict, pickVerdict, predictionReaction } from "../shared/verdicts";
import { getChallenge } from "../shared/drawing";
import type { RevealResponse } from "../shared/types";
import { saveCardImage } from "./card";
import { referenceSvg, strokesSvg } from "./draw";
import { h, mount, toast, wordmark } from "./ui";

const DISPUTE_FLAVOR = [
  "This seems worth discussing.",
  "The evidence is troubling.",
  "Someone here is wrong.",
  "This can be resolved. Loudly.",
];

type Perspective = "p1" | "p2" | null;

export interface RevealContext {
  data: RevealResponse;
  pack: Pack;
  perspective: Perspective;
  youLabel: string;
  themLabel: string;
  verdict: string;
  agreements: boolean[];
  onHome: () => void;
}

function seedHash(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash;
}

export function startReveal(data: RevealResponse, perspective: Perspective, onHome: () => void): void {
  const pack = getPack(data.packId);
  if (!pack) {
    onHome();
    return;
  }
  const agreements = pack.questions.map((_, i) => data.p1.answers[i] === data.p2.answers[i]);
  const ctx: RevealContext = {
    data,
    pack,
    perspective,
    youLabel: "You",
    themLabel: "Them",
    verdict: pickVerdict(data.score, data.code),
    agreements,
    onHome,
  };
  showOpener(ctx);
}

function scoreEl(score: number, cls: string): HTMLElement {
  return h(
    "p",
    { class: cls },
    h("span", { class: "sr-only" }, `${score} out of ${QUESTIONS_PER_GAME}`),
    h("span", { "aria-hidden": "true" }, String(score), h("span", { class: "of" }, ` / ${QUESTIONS_PER_GAME}`))
  );
}

function showOpener(ctx: RevealContext): void {
  mount(
    h(
      "div",
      { class: "screen" },
      h("header", { class: "landing-top" }, wordmark()),
      h(
        "main",
        { class: "centered" },
        h("h1", { class: "kicker" }, "The results are in"),
        scoreEl(ctx.data.score, "score-huge"),
        h("p", { class: "verdict-line" }, h("span", { class: "hl" }, ctx.verdict))
      ),
      h(
        "div",
        { class: "stack" },
        h("button", { class: "btn btn-primary", onclick: () => showCard(ctx, 0) }, "See the damage")
      )
    )
  );
}

function yourAnswer(ctx: RevealContext, index: number): number {
  const side = ctx.perspective === "p2" ? ctx.data.p2 : ctx.data.p1;
  return side.answers[index]!;
}

function theirAnswer(ctx: RevealContext, index: number): number {
  const side = ctx.perspective === "p2" ? ctx.data.p1 : ctx.data.p2;
  return side.answers[index]!;
}

function showCard(ctx: RevealContext, index: number): void {
  const question = ctx.pack.questions[index]!;
  const agreed = ctx.agreements[index]!;
  const isLast = index === QUESTIONS_PER_GAME - 1;

  const next = () => {
    if (!isLast) {
      showCard(ctx, index + 1);
    } else if (hasPredictions(ctx)) {
      showPredictions(ctx);
    } else {
      afterPredictions(ctx);
    }
  };

  const body = agreed
    ? [
        h("span", { class: "tag tag-same" }, "Same side"),
        h("h1", { class: "question-text" }, question.prompt),
        h("p", { class: "kicker chose-label" }, "You both chose:"),
        h("p", { class: "chosen-answer" }, h("span", { class: "hl" }, question.choices[yourAnswer(ctx, index) as 0 | 1])),
      ]
    : [
        h("span", { class: "tag tag-dispute" }, "Dispute detected"),
        h("h1", { class: "question-text" }, question.prompt),
        h(
          "div",
          { class: "sides" },
          h(
            "div",
            { class: "side-row" },
            h("span", { class: "side-who" }, ctx.youLabel),
            h("span", { class: "side-answer" }, question.choices[yourAnswer(ctx, index) as 0 | 1])
          ),
          h(
            "div",
            { class: "side-row" },
            h("span", { class: "side-who" }, ctx.themLabel),
            h("span", { class: "side-answer" }, question.choices[theirAnswer(ctx, index) as 0 | 1])
          )
        ),
        h("p", { class: "flavor" }, DISPUTE_FLAVOR[(seedHash(ctx.data.code) + index) % DISPUTE_FLAVOR.length]),
      ];

  const card = h("main", { class: "reveal-card", onclick: next }, ...body);

  mount(
    h(
      "div",
      { class: "screen" },
      h(
        "header",
        { class: "quiz-top" },
        wordmark(),
        h("span", { class: "progress-label" }, `${index + 1} / ${QUESTIONS_PER_GAME}`)
      ),
      card,
      h(
        "div",
        { class: "stack" },
        h(
          "button",
          { class: "btn btn-primary", onclick: next },
          !isLast
            ? "Next"
            : hasPredictions(ctx)
              ? "The predictions"
              : hasTiebreaker(ctx)
                ? "The flappy results"
                : ctx.data.drawing
                  ? "One more thing\u2026"
                  : "The verdict"
        )
      )
    )
  );
}

function hasPredictions(ctx: RevealContext): boolean {
  return (
    ENABLE_PREDICTIONS &&
    (ctx.data.p1.prediction !== null || ctx.data.p2.prediction !== null)
  );
}

// The tiebreaker screen appears when at least one side actually played
// (old games and both-skipped games have only nulls and show nothing).
function hasTiebreaker(ctx: RevealContext): boolean {
  return ctx.data.p1.flappy !== null || ctx.data.p2.flappy !== null;
}

function afterPredictions(ctx: RevealContext): void {
  if (hasTiebreaker(ctx)) {
    showTiebreaker(ctx);
  } else {
    afterTiebreaker(ctx);
  }
}

function afterTiebreaker(ctx: RevealContext): void {
  if (ctx.data.drawing) {
    showDrawTease(ctx);
  } else {
    showShareCard(ctx);
  }
}

// The asterisk marks a score earned via the zero-pity retry.
function tiebreakerRow(label: string, score: number | null, retried: boolean): HTMLElement {
  return h(
    "div",
    { class: "pred-block" },
    h("span", { class: "side-who" }, label),
    score === null
      ? h("p", { class: "pred-react" }, "Refused to play.")
      : h(
          "p",
          { class: "score-huge", style: "font-size: 3rem; margin: 0.15rem 0 0" },
          String(score),
          retried ? h("span", { style: "font-size: 0.4em; vertical-align: 1.15em" }, "*") : null
        )
  );
}

function tiebreakerLine(you: number | null, them: number | null): string {
  if (you === null || them === null) return "One of you takes this seriously.";
  if (you === them) return "A tie. How diplomatic.";
  return you > them ? "No further questions." : "Unfortunate.";
}

function showTiebreaker(ctx: RevealContext): void {
  const you = ctx.perspective === "p2" ? ctx.data.p2.flappy : ctx.data.p1.flappy;
  const them = ctx.perspective === "p2" ? ctx.data.p1.flappy : ctx.data.p2.flappy;
  const youRetry = ctx.perspective === "p2" ? ctx.data.p2.flappyRetry : ctx.data.p1.flappyRetry;
  const themRetry = ctx.perspective === "p2" ? ctx.data.p1.flappyRetry : ctx.data.p2.flappyRetry;

  mount(
    h(
      "div",
      { class: "screen" },
      h("header", { class: "landing-top" }, wordmark()),
      h(
        "main",
        { class: "centered" },
        h("h1", { class: "kicker" }, "Flappy results"),
        tiebreakerRow(ctx.youLabel, you, youRetry),
        tiebreakerRow(ctx.themLabel, them, themRetry),
        h("p", { class: "flavor" }, tiebreakerLine(you, them))
      ),
      h(
        "div",
        { class: "stack" },
        h(
          "button",
          { class: "btn btn-primary", onclick: () => afterTiebreaker(ctx) },
          ctx.data.drawing ? "One more thing\u2026" : "The verdict"
        )
      )
    )
  );
}

// ——— Finish the Drawing reveal: tease → staged combined drawing → compare ———

// Faint dashed target underneath player strokes, at the same on-screen
// weight as the reference players traced against.
function prependGhostReference(svg: SVGSVGElement, challengeId: string): void {
  const challenge = getChallenge(challengeId);
  if (!challenge) return;
  for (const component of [...challenge.components].reverse()) {
    const ghost = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    ghost.setAttribute(
      "points",
      component.referencePath.map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`).join(" ")
    );
    ghost.setAttribute("class", "ref-line-ghost");
    ghost.setAttribute("vector-effect", "non-scaling-stroke");
    svg.prepend(ghost);
  }
}

// Which color is whose: P1 always draws in ink, P2 in blue; the labels
// flip to match the viewer's perspective.
function strokeLegend(ctx: RevealContext): HTMLElement {
  const youIsP1 = ctx.perspective !== "p2";
  const item = (label: string, swatchClass: string) =>
    h("span", { class: "legend-item" }, h("span", { class: `legend-swatch ${swatchClass}` }), label);
  return h(
    "div",
    { class: "stroke-legend" },
    item(ctx.youLabel, youIsP1 ? "legend-ink" : "legend-blue"),
    item(ctx.themLabel, youIsP1 ? "legend-blue" : "legend-ink")
  );
}

function showDrawTease(ctx: RevealContext): void {
  mount(
    h(
      "div",
      { class: "screen" },
      h("header", { class: "landing-top" }, wordmark()),
      h(
        "main",
        { class: "centered" },
        h("h1", { class: "kicker" }, "One more thing\u2026"),
        h("p", { class: "display", style: "font-family: var(--serif); font-style: italic; font-size: clamp(2.2rem, 9vw, 3.2rem); margin: 0" }, "Remember that drawing?")
      ),
      h(
        "div",
        { class: "stack" },
        h("button", { class: "btn btn-primary", onclick: () => showDrawReveal(ctx) }, "See what you made")
      )
    )
  );
}

function showDrawReveal(ctx: RevealContext): void {
  const drawing = ctx.data.drawing!;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const verdict = pickDrawVerdict(drawing.teamScore, ctx.data.code);

  const svg = strokesSvg([
    { points: drawing.p1.points, className: "stroke-p1" },
    { points: drawing.p2.points, className: "stroke-p2" },
  ]);
  // Ghost of the reference behind their strokes, so the gap between plan
  // and reality is visible in the same frame.
  prependGhostReference(svg, drawing.challengeId);
  const frame = h("div", { class: "combined-frame" });
  frame.append(svg);

  const caption = h("h1", { class: "kicker", style: "visibility: hidden" }, "You built this");
  const scoreLine = h(
    "p",
    { class: "score-huge", style: "visibility: hidden; font-size: clamp(3rem, 18vw, 5rem); margin: 0" },
    "0%"
  );
  const scoreLabel = h("p", { class: "kicker", style: "visibility: hidden; margin-top: 0.2rem" }, "Team score");
  const verdictLine = h(
    "p",
    { class: "verdict-line", style: "visibility: hidden" },
    h("span", { class: "hl" }, verdict)
  );
  const nextBtn = h(
    "button",
    { class: "btn btn-primary", style: "visibility: hidden", onclick: () => showDrawCompare(ctx) },
    "The plan vs. reality"
  );

  mount(
    h(
      "div",
      { class: "screen" },
      h("header", { class: "landing-top" }, wordmark()),
      h("main", { class: "centered", style: "justify-content: flex-start; padding-top: 0.5rem" }, caption, frame, strokeLegend(ctx), scoreLine, scoreLabel, verdictLine),
      h("div", { class: "stack" }, nextBtn)
    )
  );

  // Stage the strokes: P1's part draws itself in, then P2's, then the
  // caption, count-up team score, verdict.
  const lines = Array.from(svg.querySelectorAll<SVGPolylineElement>(".stroke-p1, .stroke-p2"));
  const durations = [900, 900];
  let delay = reduced ? 0 : 250;
  lines.forEach((line, i) => {
    const len = (line as SVGPolylineElement).getTotalLength();
    line.style.strokeDasharray = String(len);
    if (reduced) {
      line.style.strokeDashoffset = "0";
      return;
    }
    line.style.strokeDashoffset = String(len);
    line.style.setProperty("--stroke-len", String(len));
    window.setTimeout(() => line.classList.add("stroke-animate"), delay);
    delay += durations[i] ?? 900;
  });

  const showResults = () => {
    caption.style.visibility = "visible";
    scoreLine.style.visibility = "visible";
    scoreLabel.style.visibility = "visible";
    const target = drawing.teamScore;
    const durationMs = reduced ? 0 : 1100;
    const started = performance.now();
    const tick = () => {
      const f = durationMs === 0 ? 1 : Math.min(1, (performance.now() - started) / durationMs);
      const eased = 1 - Math.pow(1 - f, 3);
      scoreLine.textContent = `${Math.round(target * eased)}%`;
      if (f < 1) {
        requestAnimationFrame(tick);
      } else {
        verdictLine.style.visibility = "visible";
        nextBtn.style.visibility = "visible";
      }
    };
    tick();
  };
  window.setTimeout(showResults, reduced ? 0 : delay + 400);
}

function showDrawCompare(ctx: RevealContext): void {
  const drawing = ctx.data.drawing!;
  const challenge = getChallenge(drawing.challengeId);
  const combined = strokesSvg([
    { points: drawing.p1.points, className: "stroke-p1" },
    { points: drawing.p2.points, className: "stroke-p2" },
  ]);
  prependGhostReference(combined, drawing.challengeId);
  const combinedFrame = h("div", { class: "ref-frame" });
  combinedFrame.append(combined);

  const planFrame = h("div", { class: "ref-frame" });
  if (challenge) planFrame.append(referenceSvg(challenge));

  mount(
    h(
      "div",
      { class: "screen" },
      h("header", { class: "landing-top" }, wordmark()),
      h(
        "main",
        { class: "centered" },
        h("h1", { class: "kicker" }, "For the record"),
        h(
          "div",
          { class: "compare-grid" },
          h("div", { class: "compare-cell" }, h("p", { class: "kicker" }, "The plan"), planFrame),
          h("div", { class: "compare-cell" }, h("p", { class: "kicker" }, "What you built"), combinedFrame)
        ),
        strokeLegend(ctx),
        h("p", { class: "flavor" }, "This seems worth discussing.")
      ),
      h(
        "div",
        { class: "stack" },
        h("button", { class: "btn btn-primary", onclick: () => showShareCard(ctx) }, "The verdict")
      )
    )
  );
}

function predictionBlock(label: string, predicted: number | null, actual: number): HTMLElement | null {
  if (predicted === null) return null;
  return h(
    "div",
    { class: "pred-block" },
    h("span", { class: "side-who" }, label),
    h(
      "div",
      { class: "pred-nums" },
      h("div", null, h("span", { class: "side-who" }, "Predicted"), h("span", { class: "n" }, String(predicted))),
      h("div", null, h("span", { class: "side-who" }, "Reality"), h("span", { class: "n" }, String(actual)))
    ),
    h("p", { class: "pred-react" }, predictionReaction(predicted, actual))
  );
}

function showPredictions(ctx: RevealContext): void {
  const you = ctx.perspective === "p2" ? ctx.data.p2 : ctx.data.p1;
  const them = ctx.perspective === "p2" ? ctx.data.p1 : ctx.data.p2;

  mount(
    h(
      "div",
      { class: "screen" },
      h("header", { class: "landing-top" }, wordmark()),
      h(
        "main",
        { class: "centered" },
        h("h1", { class: "kicker" }, "The predictions"),
        predictionBlock(ctx.youLabel, you.prediction, ctx.data.score),
        predictionBlock(ctx.themLabel, them.prediction, ctx.data.score)
      ),
      h(
        "div",
        { class: "stack" },
        h(
          "button",
          { class: "btn btn-primary", onclick: () => afterPredictions(ctx) },
          hasTiebreaker(ctx) ? "The flappy results" : "The verdict"
        )
      )
    )
  );
}

// Picks the disagreement to feature on the card — deterministic per game so
// both players screenshot the same thing.
export function featuredDispute(ctx: RevealContext): Question | null {
  const disputes = ctx.pack.questions.filter((_, i) => !ctx.agreements[i]);
  if (disputes.length === 0) return null;
  return disputes[seedHash(ctx.data.code) % disputes.length]!;
}

function flappyCardScore(score: number | null, retried: boolean): string {
  return score === null ? "refused" : `${score}${retried ? "*" : ""}`;
}

// The reveal ends here: the share card doubles as the final-verdict
// screen (it already carries the score and the verdict line).
function showShareCard(ctx: RevealContext): void {
  const dispute = featuredDispute(ctx);
  const drawing = ctx.data.drawing;
  const flappyYou = ctx.perspective === "p2" ? ctx.data.p2.flappy : ctx.data.p1.flappy;
  const flappyThem = ctx.perspective === "p2" ? ctx.data.p1.flappy : ctx.data.p2.flappy;
  const flappyYouRetry = ctx.perspective === "p2" ? ctx.data.p2.flappyRetry : ctx.data.p1.flappyRetry;
  const flappyThemRetry = ctx.perspective === "p2" ? ctx.data.p1.flappyRetry : ctx.data.p2.flappyRetry;

  // Flappy sits top-right beside the big score, mirroring the saved PNG.
  const flappyRow = hasTiebreaker(ctx)
    ? h(
        "div",
        { class: "card-flappy" },
        h("span", { class: "side-who" }, "Flappy"),
        h("div", { class: "card-dispute-topic" }, `${ctx.youLabel} – ${flappyCardScore(flappyYou, flappyYouRetry)}`),
        h("div", { class: "card-dispute-topic" }, `${ctx.themLabel} – ${flappyCardScore(flappyThem, flappyThemRetry)}`)
      )
    : null;

  let drawRow: HTMLElement | null = null;
  if (drawing) {
    const thumb = h("div", { class: "card-draw-thumb" });
    const thumbSvg = strokesSvg([
      { points: drawing.p1.points, className: "stroke-p1" },
      { points: drawing.p2.points, className: "stroke-p2" },
    ]);
    prependGhostReference(thumbSvg, drawing.challengeId);
    thumb.append(thumbSvg);
    drawRow = h(
      "div",
      { class: "card-draw-row" },
      thumb,
      h(
        "div",
        null,
        h("span", { class: "side-who" }, "Team drawing"),
        h("div", { class: "card-dispute-topic" }, `${drawing.teamScore}%`)
      )
    );
  }

  const card = h(
    "div",
    { class: "share-card", id: "share-card" },
    h("span", { class: "cardmark" }, "Debatable"),
    h("div", { class: "card-toprow" }, scoreEl(ctx.data.score, "cardscore"), flappyRow),
    h("div", { class: "card-rule" }),
    h(
      "div",
      { class: "card-dispute" },
      dispute
        ? h(
            "div",
            null,
            h("span", { class: "side-who" }, "But apparently we need to discuss"),
            h("div", { class: "card-dispute-topic" }, h("span", { class: "hl" }, dispute.topic))
          )
        : h(
            "div",
            null,
            h("span", { class: "side-who" }, "Disputes detected"),
            h("div", { class: "card-dispute-topic" }, h("span", { class: "hl" }, "None. Which is somehow worse."))
          )
    ),
    drawRow,
    h("p", { class: "card-verdict" }, ctx.verdict),
    h(
      "div",
      null,
      h("span", { class: "card-domain" }, PUBLIC_DOMAIN),
      h("p", { class: "fine", style: "margin-top: 0.25rem" }, BUILT_BY)
    )
  );

  mount(
    h(
      "div",
      { class: "screen" },
      h(
        "header",
        { class: "quiz-top" },
        wordmark(),
        h("span", { class: "progress-label" }, "Exhibit A")
      ),
      card,
      h("p", { class: "fine", style: "text-align:center" }, "Screenshot this. That's the move."),
      h(
        "div",
        { class: "stack mt" },
        h(
          "button",
          {
            class: "btn btn-primary",
            onclick: () =>
              void saveCardImage({
                score: ctx.data.score,
                verdict: ctx.verdict,
                disputeTopic: dispute ? dispute.topic : null,
                flappy: hasTiebreaker(ctx)
                  ? {
                      youLabel: ctx.youLabel,
                      themLabel: ctx.themLabel,
                      you: flappyYou,
                      them: flappyThem,
                      youRetry: flappyYouRetry,
                      themRetry: flappyThemRetry,
                    }
                  : null,
                drawing: drawing
                  ? {
                      challengeId: drawing.challengeId,
                      p1: drawing.p1.points,
                      p2: drawing.p2.points,
                      teamScore: drawing.teamScore,
                    }
                  : null,
              }).catch(() => toast("Couldn't render the image. Screenshot works.")),
          },
          "Save image"
        ),
        h("button", { class: "btn-ghost btn", onclick: ctx.onHome }, "Play again")
      )
    )
  );
}
