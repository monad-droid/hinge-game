// The tiebreaker: a one-attempt flappy game in the house style. Ink bird,
// ink pipes, paper sky. Score = pipes cleared. Calls onDone(score) when the
// run ends and the player continues, or onDone(null) if they skip.

import { h, mount, onScreenExit, wordmark } from "./ui";

export interface FlappyOptions {
  onDone: (score: number | null) => void;
}

const INK = "#191512";
const PAPER = "#f6f1e7";
const ACCENT = "#ff4d00";
const MUTED = "rgba(25, 21, 18, 0.4)";

export function playFlappy(opts: FlappyOptions): void {
  const canvas = h("canvas", { class: "flappy-canvas", "aria-label": "Flappy tiebreaker game" });

  const startOverlay = h(
    "div",
    { class: "flappy-overlay" },
    h("p", { class: "kicker" }, "Last thing"),
    h("h1", { class: "display" }, "The tiebreaker."),
    h("p", { class: "sub" }, "One attempt. Tap to stay airborne."),
    h("p", { class: "fine mt" }, "Tap anywhere to start."),
    h(
      "button",
      {
        class: "btn-ghost btn",
        // pointerdown would otherwise bubble to the stage and start the run
        // before the click lands — skipping must not spend the attempt.
        onpointerdown: (e: Event) => e.stopPropagation(),
        onclick: (e: Event) => {
          e.stopPropagation();
          cleanup();
          opts.onDone(null);
        },
      },
      "I'm above this"
    )
  );

  const stage = h("main", { class: "flappy-stage" }, canvas, startOverlay);

  mount(
    h(
      "div",
      { class: "screen flappy-screen" },
      h(
        "header",
        { class: "quiz-top" },
        h("span", { class: "wordmark", "aria-hidden": "true" }, "Debat", h("em", null, "able")),
        h("span", { class: "progress-label" }, "Bonus round")
      ),
      stage
    )
  );

  // ——— sizing ———
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = stage.getBoundingClientRect();
  const W = Math.max(280, rect.width);
  const H = Math.max(360, rect.height);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  // ——— tuning (scaled so it plays the same on any screen height) ———
  const u = H / 640;
  const GRAVITY = 1900 * u;
  const FLAP = -540 * u;
  const PIPE_SPEED = 170 * u;
  const PIPE_GAP = 185 * u;
  const PIPE_WIDTH = 60;
  const PIPE_SPACING = 250; // horizontal px between pipes
  const BIRD_SIZE = 26;
  const BIRD_X = Math.min(W * 0.3, 140);
  const FLOOR_Y = H - 14;

  // ——— state ———
  type Phase = "ready" | "playing" | "dead";
  let phase: Phase = "ready";
  let birdY = H * 0.42;
  let velocity = 0;
  let score = 0;
  let pipes: { x: number; gapY: number; counted: boolean }[] = [];
  let nextPipeX = W + 140;
  let raf = 0;
  let lastTime = 0;

  const spawnGapY = () => {
    const margin = 70 * u;
    return margin + Math.random() * (FLOOR_Y - PIPE_GAP - margin * 2);
  };

  const flap = () => {
    if (phase === "ready") {
      phase = "playing";
      startOverlay.remove();
    }
    if (phase === "playing") velocity = FLAP;
  };

  const die = () => {
    phase = "dead";
    setTimeout(showResult, 450);
  };

  const showResult = () => {
    const overlay = h(
      "div",
      { class: "flappy-overlay" },
      h("p", { class: "kicker" }, "Final distance"),
      h("p", { class: "score-huge" }, String(score)),
      h("p", { class: "verdict-line" }, resultLine(score)),
      h(
        "button",
        {
          class: "btn btn-primary mt",
          onclick: (e: Event) => {
            e.stopPropagation();
            cleanup();
            opts.onDone(score);
          },
        },
        "Continue"
      )
    );
    stage.append(overlay);
    overlay.querySelector("button")?.focus();
  };

  // ——— simulation ———
  const step = (dt: number) => {
    velocity += GRAVITY * dt;
    birdY += velocity * dt;

    if (birdY < 0) {
      birdY = 0;
      velocity = 0;
    }
    if (birdY + BIRD_SIZE >= FLOOR_Y) {
      birdY = FLOOR_Y - BIRD_SIZE;
      die();
      return;
    }

    for (const pipe of pipes) pipe.x -= PIPE_SPEED * dt;
    pipes = pipes.filter((p) => p.x + PIPE_WIDTH > -10);
    nextPipeX -= PIPE_SPEED * dt;
    if (nextPipeX <= W) {
      pipes.push({ x: nextPipeX, gapY: spawnGapY(), counted: false });
      nextPipeX += PIPE_SPACING;
    }

    for (const pipe of pipes) {
      const inX = BIRD_X + BIRD_SIZE > pipe.x + 4 && BIRD_X < pipe.x + PIPE_WIDTH - 4;
      if (inX && (birdY < pipe.gapY || birdY + BIRD_SIZE > pipe.gapY + PIPE_GAP)) {
        die();
        return;
      }
      if (!pipe.counted && pipe.x + PIPE_WIDTH < BIRD_X) {
        pipe.counted = true;
        score++;
      }
    }
  };

  // ——— rendering ———
  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    // pipes
    ctx.fillStyle = INK;
    for (const pipe of pipes) {
      ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.gapY);
      ctx.fillRect(pipe.x, pipe.gapY + PIPE_GAP, PIPE_WIDTH, FLOOR_Y - pipe.gapY - PIPE_GAP);
    }

    // floor
    ctx.fillRect(0, FLOOR_Y, W, 3);

    // score
    if (phase !== "ready") {
      ctx.fillStyle = MUTED;
      ctx.font = 'italic 64px "Instrument Serif", Georgia, serif';
      ctx.textAlign = "center";
      ctx.fillText(String(score), W / 2, 90);
      ctx.textAlign = "left";
    }

    // bird: ink square, orange eye, tilts with velocity
    ctx.save();
    ctx.translate(BIRD_X + BIRD_SIZE / 2, birdY + BIRD_SIZE / 2);
    ctx.rotate(Math.max(-0.45, Math.min(0.8, velocity / (900 * u))));
    ctx.fillStyle = INK;
    ctx.fillRect(-BIRD_SIZE / 2, -BIRD_SIZE / 2, BIRD_SIZE, BIRD_SIZE);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(BIRD_SIZE / 2 - 10, -BIRD_SIZE / 2 + 5, 6, 6);
    ctx.restore();
  };

  const frame = (t: number) => {
    if (phase === "dead") {
      draw();
      return;
    }
    const dt = lastTime ? Math.min((t - lastTime) / 1000, 1 / 30) : 0;
    lastTime = t;
    if (phase === "playing") step(dt);
    draw();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  // ——— input ———
  const onPointer = (e: Event) => {
    e.preventDefault();
    flap();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === " " || e.key === "ArrowUp") {
      e.preventDefault();
      flap();
    }
  };
  stage.addEventListener("pointerdown", onPointer);
  window.addEventListener("keydown", onKey);

  const cleanup = () => {
    cancelAnimationFrame(raf);
    stage.removeEventListener("pointerdown", onPointer);
    window.removeEventListener("keydown", onKey);
  };
  onScreenExit(cleanup);
}

function resultLine(score: number): string {
  if (score === 0) return "Immediate ground contact.";
  if (score <= 3) return "Brief but memorable.";
  if (score <= 9) return "Respectable airtime.";
  if (score <= 19) return "Suspiciously practiced.";
  return "Have you done this before?";
}
