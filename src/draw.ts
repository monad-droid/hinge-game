// Finish the Drawing: the collaborative bonus round. Player 1 picks a
// component of the reference object; Player 2 gets the other one. Each
// recreates their part in ONE continuous stroke on a canvas that IS the
// master coordinate system, so the two strokes later combine into one
// (questionable) object with no repositioning.

import {
  CURRENT_CHALLENGE_ID,
  MIN_VALID_LENGTH,
  MIN_VALID_POINTS,
  decimate,
  getChallenge,
  getComponent,
  pathLength,
  pointsToTriples,
  type DrawingChallenge,
  type DrawingComponent,
  type NormPoint,
  type PointTriple,
} from "../shared/drawing";
import type { DrawingSubmission } from "../shared/types";
import { footerNote, h, mount, onScreenExit, toast, wordmark } from "./ui";

export interface DrawingRoundOptions {
  role: "p1" | "p2";
  // Player 2 only: the component id assigned to them.
  assigned?: string;
  onDone: (result: DrawingSubmission | null) => void; // null = sat out
}

const START_RADIUS = 0.09; // how close to the dot a stroke must begin

// ——— SVG reference rendering (shared by intros, reveal, compare) ———

export function polylinePoints(points: { x: number; y: number }[]): string {
  return points.map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`).join(" ");
}

export function referenceSvg(
  challenge: DrawingChallenge,
  opts: { highlight?: string; className?: string } = {}
): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("class", `ref-svg ${opts.className ?? ""}`);
  svg.setAttribute("aria-hidden", "true");
  for (const component of challenge.components) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("points", polylinePoints(component.referencePath));
    const highlighted = !opts.highlight || opts.highlight === component.id;
    line.setAttribute("class", highlighted ? "ref-line" : "ref-line ref-line-dim");
    svg.append(line);
  }
  return svg;
}

export function strokesSvg(
  strokes: { points: PointTriple[]; className: string }[],
  className = ""
): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("class", `ref-svg ${className}`);
  svg.setAttribute("aria-hidden", "true");
  for (const stroke of strokes) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("points", polylinePoints(stroke.points.map(([x, y]) => ({ x, y }))));
    line.setAttribute("class", stroke.className);
    svg.append(line);
  }
  return svg;
}

// ——— round entry ———

export function runDrawingRound(opts: DrawingRoundOptions): void {
  const challenge = getChallenge(CURRENT_CHALLENGE_ID)!;
  if (opts.role === "p1") {
    showGate(opts, () => showIntroP1(challenge, opts));
  } else {
    const component = opts.assigned ? getComponent(challenge, opts.assigned) : undefined;
    if (!component) {
      opts.onDone(null); // old game or P1 sat out — no drawing round for P2
      return;
    }
    showGate(opts, () => showIntroP2(challenge, component, opts));
  }
}

// The bonus round is strictly opt-in: a clear fork before anyone sees the
// drawing challenge. Stop here locks their side in with no drawing.
function showGate(opts: DrawingRoundOptions, onContinue: () => void): void {
  mount(
    h(
      "div",
      { class: "screen" },
      h(
        "header",
        { class: "quiz-top" },
        wordmark(),
        h("span", { class: "progress-label" }, "Optional")
      ),
      h(
        "main",
        { class: "centered" },
        h("h1", { class: "display" }, "That was fun, right?"),
        h("p", { class: "sub" }, "There's one last quick game. Twenty seconds. Entirely optional."),
        h(
          "div",
          { class: "stack mt" },
          h("button", { class: "btn btn-primary", onclick: onContinue }, "One last quick game"),
          h("button", { class: "btn-ghost btn", onclick: () => opts.onDone(null) }, "Stop here")
        )
      ),
      footerNote()
    )
  );
}

function showIntroP1(challenge: DrawingChallenge, opts: DrawingRoundOptions): void {
  const [a, b] = challenge.components;
  mount(
    h(
      "div",
      { class: "screen" },
      h(
        "header",
        { class: "quiz-top" },
        wordmark(),
        h("span", { class: "progress-label" }, "One more thing")
      ),
      h(
        "main",
        { class: "centered" },
        h("h1", { class: "display" }, "Finish the drawing."),
        h("p", { class: "sub" }, "You're building this together. One part each."),
        h("div", { class: "ref-frame" }, referenceSvg(challenge)),
        h("p", { class: "kicker", style: "margin-top: 1rem" }, "Pick your part"),
        h(
          "div",
          { class: "stack" },
          h(
            "button",
            { class: "btn btn-primary", onclick: () => showDraw(challenge, a, opts) },
            capitalize(a.label)
          ),
          h(
            "button",
            { class: "btn btn-primary", onclick: () => showDraw(challenge, b, opts) },
            capitalize(b.label)
          )
        )
      ),
      footerNote()
    )
  );
}

function showIntroP2(
  challenge: DrawingChallenge,
  component: DrawingComponent,
  opts: DrawingRoundOptions
): void {
  const other = challenge.components.find((c) => c.id !== component.id)!;
  const line =
    component.id === "roof"
      ? `They built ${other.label}. ${capitalize(component.label)} is on you.`
      : `They took ${other.label}. You're building ${component.label}.`;
  mount(
    h(
      "div",
      { class: "screen" },
      h(
        "header",
        { class: "quiz-top" },
        wordmark(),
        h("span", { class: "progress-label" }, "Your part")
      ),
      h(
        "main",
        { class: "centered" },
        h("h1", { class: "display" }, line),
        h("p", { class: "sub" }, "You each draw one part. Neither of you sees the other's attempt."),
        h("div", { class: "ref-frame" }, referenceSvg(challenge, { highlight: component.id })),
        h(
          "div",
          { class: "stack mt" },
          h(
            "button",
            { class: "btn btn-primary", onclick: () => showDraw(challenge, component, opts) },
            `Draw ${component.label}`
          )
        )
      ),
      footerNote()
    )
  );
}

// ——— the drawing screen ———

function showDraw(
  challenge: DrawingChallenge,
  component: DrawingComponent,
  opts: DrawingRoundOptions,
  retryUsed = false
): void {
  const canvas = h("canvas", { class: "draw-canvas", "aria-label": `Drawing canvas for ${component.label}` });
  const startDot = h("div", { class: "start-dot", "aria-hidden": "true" });
  const stage = h("div", { class: "draw-stage" }, canvas, startDot);

  const instructions = h(
    "p",
    { class: "sub", style: "margin-top: 0.35rem" },
    "One line. Don't lift your finger."
  );
  const restartBtn = h(
    "button",
    {
      class: "btn-ghost btn",
      disabled: true,
      onclick: () => {
        cleanup();
        showDraw(challenge, component, opts, true);
      },
    },
    "Restart (1 left)"
  );
  const lockBtn = h(
    "button",
    {
      class: "btn btn-primary",
      disabled: true,
      onclick: () => {
        if (!strokeDone || points.length < 2) return;
        cleanup();
        const thinned = decimate(points);
        opts.onDone({
          component: component.id,
          points: pointsToTriples(thinned),
          mulligan: retryUsed,
        });
      },
    },
    "Lock it in"
  );

  mount(
    h(
      "div",
      { class: "screen draw-screen" },
      h(
        "header",
        { class: "quiz-top" },
        wordmark(),
        h("span", { class: "progress-label" }, retryUsed ? "Final attempt" : "Finish the drawing")
      ),
      h(
        "main",
        { class: "draw-main" },
        h("h1", { class: "kicker", style: "margin-bottom: 0.1rem" }, "Draw your section"),
        instructions,
        stage
      ),
      h("div", { class: "stack" }, lockBtn, retryUsed ? null : restartBtn)
    )
  );

  // — canvas sizing / rendering —
  const ctx = canvas.getContext("2d")!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let rect = stage.getBoundingClientRect();

  const size = () => {
    rect = stage.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    positionDot();
    render();
  };

  const positionDot = () => {
    startDot.style.left = `${component.start.x * 100}%`;
    startDot.style.top = `${component.start.y * 100}%`;
  };

  let points: NormPoint[] = [];
  let drawing = false;
  let strokeDone = false;
  let strokeStartTime = 0;
  let lastHint = 0;

  const render = () => {
    const w = rect.width;
    const hgt = rect.height;
    ctx.clearRect(0, 0, w, hgt);
    // assigned reference, dashed and muted
    ctx.setLineDash([6, 7]);
    ctx.strokeStyle = "rgba(25, 21, 18, 0.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    component.referencePath.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x * w, p.y * hgt);
      else ctx.lineTo(p.x * w, p.y * hgt);
    });
    ctx.stroke();
    // player stroke
    if (points.length > 1) {
      ctx.setLineDash([]);
      ctx.strokeStyle = "#191512";
      ctx.lineWidth = 4;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x * w, p.y * hgt);
        else ctx.lineTo(p.x * w, p.y * hgt);
      });
      ctx.stroke();
    }
  };

  const toNorm = (e: PointerEvent): NormPoint => ({
    x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    t: strokeStartTime ? Math.round(performance.now() - strokeStartTime) : 0,
  });

  let raf = 0;
  const scheduleRender = () => {
    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        render();
      });
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    if (strokeDone || drawing) return;
    rect = stage.getBoundingClientRect();
    const p = toNorm(e);
    const d = Math.hypot(p.x - component.start.x, p.y - component.start.y);
    if (d > START_RADIUS) {
      const now = Date.now();
      if (now - lastHint > 1500) {
        lastHint = now;
        toast("Start at the dot.");
      }
      return;
    }
    drawing = true;
    strokeStartTime = performance.now();
    points = [{ ...p, t: 0 }];
    startDot.classList.add("start-dot-hidden");
    stage.setPointerCapture?.(e.pointerId);
    scheduleRender();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!drawing) return;
    e.preventDefault();
    points.push(toNorm(e));
    scheduleRender();
  };

  const endStroke = (e: PointerEvent) => {
    if (!drawing) return;
    e.preventDefault();
    drawing = false;
    const length = pathLength(points);
    if (points.length < MIN_VALID_POINTS || length < MIN_VALID_LENGTH) {
      // A micro-blip isn't a drawing: it never counts as the attempt and
      // never spends the retry — just go again.
      points = [];
      strokeStartTime = 0;
      startDot.classList.remove("start-dot-hidden");
      toast("One long line \u2014 keep going.");
      render();
      return;
    }
    strokeDone = true;
    lockBtn.removeAttribute("disabled");
    if (!retryUsed) {
      restartBtn.removeAttribute("disabled");
      instructions.textContent = "Lock it in, or spend your one retry.";
    } else {
      instructions.textContent = "This one counts. Lock it in.";
    }
    render();
  };

  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerup", endStroke);
  stage.addEventListener("pointercancel", endStroke);
  window.addEventListener("resize", size);

  const cleanup = () => {
    cancelAnimationFrame(raf);
    stage.removeEventListener("pointerdown", onPointerDown);
    stage.removeEventListener("pointermove", onPointerMove);
    stage.removeEventListener("pointerup", endStroke);
    stage.removeEventListener("pointercancel", endStroke);
    window.removeEventListener("resize", size);
  };
  onScreenExit(cleanup);

  size();
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
