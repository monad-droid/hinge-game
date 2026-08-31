// The reveal: score first, then each of the seven answers one at a time,
// then predictions, then the final verdict and shareable card. Paced, not
// a dashboard.

import { ENABLE_PREDICTIONS, PUBLIC_DOMAIN, QUESTIONS_PER_GAME } from "../shared/config";
import { getPack } from "../shared/packs";
import type { Pack, Question } from "../shared/packs";
import { pickVerdict, predictionReaction } from "../shared/verdicts";
import type { RevealResponse } from "../shared/types";
import { saveCardImage } from "./card";
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
    youLabel: perspective ? "You" : "Player 1",
    themLabel: perspective ? "Them" : "Player 2",
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
        h("span", { class: "wordmark", "aria-hidden": "true" }, "Debat", h("em", null, "able")),
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
    showFinal(ctx);
  }
}

function tiebreakerRow(label: string, score: number | null): HTMLElement {
  return h(
    "div",
    { class: "pred-block" },
    h("span", { class: "side-who" }, label),
    score === null
      ? h("p", { class: "pred-react" }, "Refused to play.")
      : h("p", { class: "score-huge", style: "font-size: 3rem; margin: 0.15rem 0 0" }, String(score))
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

  mount(
    h(
      "div",
      { class: "screen" },
      h("header", { class: "landing-top" }, wordmark()),
      h(
        "main",
        { class: "centered" },
        h("h1", { class: "kicker" }, "Flappy results"),
        tiebreakerRow(ctx.youLabel, you),
        tiebreakerRow(ctx.themLabel, them),
        h("p", { class: "flavor" }, tiebreakerLine(you, them))
      ),
      h(
        "div",
        { class: "stack" },
        h("button", { class: "btn btn-primary", onclick: () => showFinal(ctx) }, "The verdict")
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

function showFinal(ctx: RevealContext): void {
  mount(
    h(
      "div",
      { class: "screen" },
      h("header", { class: "landing-top" }, wordmark()),
      h(
        "main",
        { class: "centered" },
        h("h1", { class: "kicker" }, "Final verdict"),
        scoreEl(ctx.data.score, "score-huge"),
        h("p", { class: "sub" }, `${ctx.data.score} of ${QUESTIONS_PER_GAME} aligned.`),
        h("p", { class: "verdict-line" }, h("span", { class: "hl" }, ctx.verdict))
      ),
      h(
        "div",
        { class: "stack" },
        h("button", { class: "btn btn-primary", onclick: () => showShareCard(ctx) }, "See the results card"),
        h("button", { class: "btn-ghost btn", onclick: ctx.onHome }, "Play again")
      )
    )
  );
}

function showShareCard(ctx: RevealContext): void {
  const dispute = featuredDispute(ctx);

  const card = h(
    "div",
    { class: "share-card", id: "share-card" },
    h("span", { class: "cardmark" }, "Debatable"),
    scoreEl(ctx.data.score, "cardscore"),
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
    h("p", { class: "card-verdict" }, ctx.verdict),
    h("span", { class: "card-domain" }, PUBLIC_DOMAIN)
  );

  mount(
    h(
      "div",
      { class: "screen" },
      h(
        "header",
        { class: "quiz-top" },
        h("span", { class: "wordmark", "aria-hidden": "true" }, "Debat", h("em", null, "able")),
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
              }).catch(() => toast("Couldn't render the image. Screenshot works.")),
          },
          "Save image"
        ),
        h("button", { class: "btn-ghost btn", onclick: () => showFinal(ctx) }, "Back")
      )
    )
  );
}
