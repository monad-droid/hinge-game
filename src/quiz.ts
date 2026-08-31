// The question flow: one question per screen, tap to advance, then the
// prediction screen. Shared by Player 1 and Player 2 — only the completion
// callback differs.

import { ENABLE_MINIGAME, ENABLE_PREDICTIONS, QUESTIONS_PER_GAME } from "../shared/config";
import type { Pack } from "../shared/packs";
import { PREDICTION_FLAVOR } from "../shared/verdicts";
import type { Answer } from "../shared/types";
import { playFlappy } from "./flappy";
import { clearDraft, getDraft, setDraft } from "./storage";
import { h, mount, toast } from "./ui";

export interface QuizOptions {
  pack: Pack;
  draftKey: string;
  // Called once the whole side is locked in: answers, prediction (when
  // enabled) and the tiebreaker score (null if skipped/disabled). Must
  // submit to the server; throws propagate back to a retry UI.
  onComplete: (answers: Answer[], prediction: number | null, flappy: number | null) => Promise<void>;
}

export function startQuiz(opts: QuizOptions): void {
  const draft = getDraft(opts.draftKey);
  const answers: Answer[] = draft ? draft.answers.slice(0, QUESTIONS_PER_GAME) : [];
  if (answers.length >= QUESTIONS_PER_GAME) {
    afterAnswers(opts, answers);
  } else {
    showQuestion(opts, answers);
  }
}

// The steps between the last question and submission: tiebreaker (one
// attempt), then prediction. The played/skipped score is carried in memory
// (flappyMemo) and mirrored to the draft for refresh-resume — never trust
// the draft read-back alone, since storage can be unavailable (private
// windows, locked-down webviews) and a failed read must not re-offer the
// one attempt.
function afterAnswers(
  opts: QuizOptions,
  answers: Answer[],
  flappyMemo?: number | null
): void {
  const flappy = flappyMemo !== undefined ? flappyMemo : getDraft(opts.draftKey)?.flappy;
  if (ENABLE_MINIGAME && flappy === undefined) {
    playFlappy({
      onDone: (score) => {
        setDraft(opts.draftKey, { answers, flappy: score });
        afterAnswers(opts, answers, score);
      },
    });
    return;
  }
  const settled = flappy === undefined ? null : flappy;
  if (ENABLE_PREDICTIONS) {
    showPrediction(opts, answers, settled);
  } else {
    void submit(opts, answers, null, settled, () => afterAnswers(opts, answers, settled));
  }
}

function showQuestion(opts: QuizOptions, answers: Answer[]): void {
  const index = answers.length;
  const question = opts.pack.questions[index]!;

  // Flash the chosen button and hold for a beat before advancing — mobile
  // Safari doesn't reliably show :active on touch, and an instant screen
  // swap would hide the feedback anyway.
  const pick = (choice: Answer, event: Event) => {
    const pressed = event.currentTarget as HTMLButtonElement;
    for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>(".answer-btn"))) {
      b.disabled = true; // no double-taps while the flash plays
    }
    pressed.classList.add("is-picked");

    const next = [...answers, choice];
    setDraft(opts.draftKey, { answers: next });

    window.setTimeout(() => {
      if (next.length >= QUESTIONS_PER_GAME) {
        afterAnswers(opts, next);
      } else {
        showQuestion(opts, next);
      }
    }, 170);
  };

  mount(
    h(
      "div",
      { class: "screen" },
      h(
        "header",
        { class: "quiz-top" },
        h("span", { class: "wordmark", "aria-hidden": "true" }, "Debat", h("em", null, "able")),
        h(
          "span",
          { class: "progress-label" },
          h("span", { class: "sr-only" }, `Question ${index + 1} of ${QUESTIONS_PER_GAME}`),
          h("span", { "aria-hidden": "true" }, `${index + 1} / ${QUESTIONS_PER_GAME}`)
        )
      ),
      h(
        "div",
        { class: "progress-track", "aria-hidden": "true" },
        h("div", {
          class: "progress-fill",
          style: `width: ${(index / QUESTIONS_PER_GAME) * 100}%`,
        })
      ),
      h(
        "main",
        { class: "quiz-question" },
        h("h1", { class: "question-text" }, question.prompt)
      ),
      h(
        "div",
        { class: "answers" },
        h("button", { class: "btn answer-btn", onclick: (e: Event) => pick(0, e) }, question.choices[0]),
        h("button", { class: "btn answer-btn", onclick: (e: Event) => pick(1, e) }, question.choices[1])
      )
    )
  );

  // Animate the bar toward this question's progress after mount.
  requestAnimationFrame(() => {
    const fill = document.querySelector<HTMLElement>(".progress-fill");
    if (fill) fill.style.width = `${((index + 1) / QUESTIONS_PER_GAME) * 100}%`;
  });
}

function showPrediction(opts: QuizOptions, answers: Answer[], flappy: number | null): void {
  let selected: number | null = null;

  const flavor = h("p", { class: "tally-flavor", "aria-live": "polite" }, " ");
  const lockBtn = h(
    "button",
    { class: "btn btn-primary", disabled: true, onclick: () => void lock() },
    "Lock it in"
  );

  const tally = h("div", { class: "tally", role: "group", "aria-label": "Your guess, 0 to 7" });
  for (let n = 0; n <= QUESTIONS_PER_GAME; n++) {
    tally.append(
      h(
        "button",
        {
          "aria-pressed": "false",
          onclick: (e: Event) => {
            selected = n;
            tally.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false"));
            (e.currentTarget as HTMLElement).setAttribute("aria-pressed", "true");
            flavor.textContent = PREDICTION_FLAVOR[n] ?? " ";
            flavor.classList.remove("tally-pop");
            void flavor.offsetWidth; // restart animation
            flavor.classList.add("tally-pop");
            lockBtn.removeAttribute("disabled");
          },
        },
        String(n)
      )
    );
  }

  const lock = async () => {
    if (selected === null) return;
    lockBtn.setAttribute("disabled", "");
    lockBtn.textContent = "Locking…";
    await submit(opts, answers, selected, flappy, () => showPrediction(opts, answers, flappy));
  };

  mount(
    h(
      "div",
      { class: "screen" },
      h(
        "header",
        { class: "quiz-top" },
        h("span", { class: "wordmark", "aria-hidden": "true" }, "Debat", h("em", null, "able")),
        h("span", { class: "progress-label" }, "Last step")
      ),
      h(
        "main",
        { class: "quiz-question" },
        h("h1", { class: "display" }, "How alike do you think you are?"),
        h("p", { class: "sub" }, `How many of the ${QUESTIONS_PER_GAME} did you agree on?`),
        tally,
        flavor
      ),
      h("div", { class: "stack" }, lockBtn)
    )
  );
}

async function submit(
  opts: QuizOptions,
  answers: Answer[],
  prediction: number | null,
  flappy: number | null,
  retryScreen: () => void
): Promise<void> {
  try {
    await opts.onComplete(answers, prediction, flappy);
    clearDraft(opts.draftKey);
  } catch {
    // Completion handlers throw only for retryable failures (network etc.);
    // terminal states (already settled, expired) render their own screens.
    toast("That didn't go through. Try again.");
    retryScreen();
  }
}
