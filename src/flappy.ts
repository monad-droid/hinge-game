// The tiebreaker: a one-attempt flappy game. Classic-arcade look — pixel
// bird, capped pipes, scrolling ground — drawn from hand-made pixel maps on
// canvas (original artwork, no image assets). Calls onDone(score) when the
// run ends and the player continues, or onDone(null) if they skip.

import { h, mount, onScreenExit } from "./ui";

export interface FlappyOptions {
  onDone: (score: number | null) => void;
}

// ——— palette (classic-inspired, our own) ———
const SKY = "#70c5ce";
const CLOUD = "rgba(255, 255, 255, 0.85)";
const PIPE = "#74bf2e";
const PIPE_LIGHT = "#a5e358";
const PIPE_DARK = "#4e8a1e";
const OUTLINE = "#29231a";
const GRASS = "#7ec850";
const GRASS_EDGE = "#5aa33c";
const SAND = "#ded895";
const SAND_STRIPE = "#cbc06a";

// ——— bird sprite: 20×14 pixel map + 3 wing positions ———
const BIRD_COLORS: Record<string, string> = {
  K: OUTLINE,
  Y: "#f6c53d",
  L: "#f9e8b5",
  W: "#ffffff",
  O: "#f2842b",
  D: "#d9650f",
};

const BIRD_MAP = [
  ".......KKKKKK.......",
  ".....KKYYYYYYKK.....",
  "....KYYYYYYYKWWWK...",
  "...KYYYYYYYKWWWWWK..",
  "...KYYYYYYYKWWKWWK..",
  "..KYYYYYYYYKWWWWWK..",
  "..KYYYYYYYYYKWWWK...",
  "..KYYYYYYYYYKKKKKKK.",
  "..KYYYYYYYYKOOOOOOK.",
  "..KYYYYYYYYKDDDDDDK.",
  "...KYYYYYYYYKKKKKK..",
  "...KYYLLLLLYYK......",
  "....KLLLLLLLK.......",
  ".....KKKKKKK........",
];

const WING_MAP = [
  ".KKKKK..",
  "KLLLLLK.",
  "KLLLLLLK",
  "KLLLLLK.",
  ".KKKKK..",
];

function paintMap(ctx: CanvasRenderingContext2D, map: string[], ox: number, oy: number): void {
  for (let y = 0; y < map.length; y++) {
    const row = map[y]!;
    for (let x = 0; x < row.length; x++) {
      const color = BIRD_COLORS[row[x]!];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }
}

// Pre-renders the three wing frames at 1× — scaled up crisply at draw time.
function makeBirdFrames(): HTMLCanvasElement[] {
  return [-2, 0, 2].map((wingOffset) => {
    const c = document.createElement("canvas");
    c.width = 20;
    c.height = 14;
    const ctx = c.getContext("2d")!;
    paintMap(ctx, BIRD_MAP, 0, 0);
    paintMap(ctx, WING_MAP, 1, 5 + wingOffset);
    return c;
  });
}

export function playFlappy(opts: FlappyOptions): void {
  const canvas = h("canvas", { class: "flappy-canvas", "aria-label": "Flappy tiebreaker game" });

  const startOverlay = h(
    "div",
    { class: "flappy-overlay" },
    h("p", { class: "kicker" }, "Last thing"),
    h("h1", { class: "display" }, "The tiebreaker."),
    h("p", { class: "sub" }, "One attempt. Every tap keeps you airborne."),
    h(
      "div",
      { class: "stack mt" },
      h(
        "button",
        {
          class: "btn btn-flight",
          onpointerdown: (e: Event) => e.stopPropagation(),
          onclick: (e: Event) => {
            e.stopPropagation();
            const btn = e.currentTarget as HTMLButtonElement;
            btn.disabled = true;
            btn.classList.add("is-launching");
            window.setTimeout(() => {
              startOverlay.remove();
              phase = "ready";
            }, 380);
          },
        },
        "Play"
      ),
      h(
        "button",
        {
          class: "btn-ghost btn",
          // pointerdown must not reach the stage — skipping (or merely
          // pressing a button) can never spend the attempt.
          onpointerdown: (e: Event) => e.stopPropagation(),
          onclick: (e: Event) => {
            e.stopPropagation();
            cleanup();
            opts.onDone(null);
          },
        },
        "I'm above this"
      )
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
  ctx.imageSmoothingEnabled = false; // keep the pixel art crisp when scaled

  // ——— tuning (scaled so it plays the same on any screen height) ———
  const u = H / 640;
  const GRAVITY = 1900 * u;
  const FLAP = -540 * u;
  // Difficulty ramps with score: the world speeds up and the gaps tighten,
  // so first-timers still clear a few pipes but 40+ takes actual skill.
  const speedNow = () => (185 + Math.min(50, score) * 1.9) * u;
  const gapNow = () => (162 - Math.min(45, score) * 1.3) * u;
  const PIPE_WIDTH = 62;
  const PIPE_SPACING = 232;
  const BIRD_SIZE = 26; // collision box; the sprite is drawn a bit larger
  const BIRD_X = Math.min(W * 0.3, 140);
  const GROUND_H = 48;
  const FLOOR_Y = H - GROUND_H;
  const SPRITE_W = 40;
  const SPRITE_H = 28;

  const birdFrames = makeBirdFrames();
  const clouds = [0.15, 0.45, 0.75].map((f, i) => ({
    x: W * f,
    y: H * (0.12 + 0.11 * i),
    r: 16 + 8 * ((i * 7) % 3),
  }));

  // ——— state ———
  // intro: brand overlay with the start button. ready: overlay gone, bird
  // bobbing, waiting for the first tap. Then playing → dead, with paused
  // in between if the OS interrupts (notification, call, tab switch).
  type Phase = "intro" | "ready" | "playing" | "paused" | "dead";
  let phase: Phase = "intro";
  const restY = H * 0.42;
  let birdY = restY;
  let velocity = 0;
  let score = 0;
  let pipes: { x: number; gapY: number; gap: number; counted: boolean }[] = [];
  let nextPipeX = W + 140;
  let scrollX = 0;
  let raf = 0;
  let lastTime = 0;
  let elapsed = 0;

  const spawnGapY = (gap: number) => {
    const margin = 62 * u;
    return margin + Math.random() * (FLOOR_Y - gap - margin * 2);
  };

  const flap = () => {
    if (phase === "intro") return; // taps do nothing until Take flight
    if (phase === "ready" || phase === "paused") phase = "playing";
    if (phase === "playing") velocity = FLAP;
  };

  // An interruption mid-run (notification banner, incoming call, app
  // switch) pauses instead of letting the bird die off-screen.
  const pauseIfPlaying = () => {
    if (phase === "playing") phase = "paused";
  };

  const die = () => {
    phase = "dead";
    setTimeout(showResult, 450);
  };

  const showResult = () => {
    const overlay = h(
      "div",
      { class: "flappy-overlay flappy-overlay-fade" },
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
    const speed = speedNow();
    velocity += GRAVITY * dt;
    birdY += velocity * dt;
    scrollX += speed * dt;

    if (birdY < 0) {
      birdY = 0;
      velocity = 0;
    }
    if (birdY + BIRD_SIZE >= FLOOR_Y) {
      birdY = FLOOR_Y - BIRD_SIZE;
      die();
      return;
    }

    for (const pipe of pipes) pipe.x -= speed * dt;
    pipes = pipes.filter((p) => p.x + PIPE_WIDTH > -10);
    nextPipeX -= speed * dt;
    if (nextPipeX <= W) {
      const gap = gapNow();
      pipes.push({ x: nextPipeX, gapY: spawnGapY(gap), gap, counted: false });
      nextPipeX += PIPE_SPACING;
    }

    for (const pipe of pipes) {
      const inX = BIRD_X + BIRD_SIZE > pipe.x + 4 && BIRD_X < pipe.x + PIPE_WIDTH - 4;
      if (inX && (birdY < pipe.gapY || birdY + BIRD_SIZE > pipe.gapY + pipe.gap)) {
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
  const drawPipePair = (pipe: { x: number; gapY: number; gap: number }) => {
    const capH = 26;
    const x = pipe.x;

    const body = (top: number, height: number) => {
      if (height <= 0) return;
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(x + 3, top, PIPE_WIDTH - 6, height);
      ctx.fillStyle = PIPE;
      ctx.fillRect(x + 5, top, PIPE_WIDTH - 10, height);
      ctx.fillStyle = PIPE_LIGHT;
      ctx.fillRect(x + 8, top, 7, height);
      ctx.fillStyle = PIPE_DARK;
      ctx.fillRect(x + PIPE_WIDTH - 12, top, 5, height);
    };

    const cap = (top: number) => {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(x, top, PIPE_WIDTH, capH);
      ctx.fillStyle = PIPE;
      ctx.fillRect(x + 2, top + 2, PIPE_WIDTH - 4, capH - 4);
      ctx.fillStyle = PIPE_LIGHT;
      ctx.fillRect(x + 5, top + 2, 8, capH - 4);
      ctx.fillStyle = PIPE_DARK;
      ctx.fillRect(x + PIPE_WIDTH - 10, top + 2, 5, capH - 4);
    };

    // top pipe (hangs from the ceiling)
    body(0, pipe.gapY - capH);
    cap(pipe.gapY - capH);
    // bottom pipe (stands on the ground)
    cap(pipe.gapY + pipe.gap);
    body(pipe.gapY + pipe.gap + capH, FLOOR_Y - pipe.gapY - pipe.gap - capH);
  };

  const draw = () => {
    // sky
    ctx.fillStyle = SKY;
    ctx.fillRect(0, 0, W, H);

    // clouds, drifting slower than the world
    ctx.fillStyle = CLOUD;
    for (const cloud of clouds) {
      const span = W + 200;
      const cx = ((((cloud.x - scrollX * 0.25) % span) + span) % span) - 100;
      ctx.beginPath();
      ctx.arc(cx, cloud.y, cloud.r, 0, Math.PI * 2);
      ctx.arc(cx + cloud.r * 0.9, cloud.y + 4, cloud.r * 0.75, 0, Math.PI * 2);
      ctx.arc(cx - cloud.r * 0.9, cloud.y + 5, cloud.r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const pipe of pipes) drawPipePair(pipe);

    // ground: grass lip, then striped sand scrolling with the pipes
    ctx.fillStyle = GRASS;
    ctx.fillRect(0, FLOOR_Y, W, 7);
    ctx.fillStyle = GRASS_EDGE;
    ctx.fillRect(0, FLOOR_Y + 7, W, 3);
    ctx.fillStyle = SAND;
    ctx.fillRect(0, FLOOR_Y + 10, W, GROUND_H - 10);
    ctx.fillStyle = SAND_STRIPE;
    const stripeSpan = 26;
    for (let sx = -stripeSpan + (-scrollX % stripeSpan); sx < W; sx += stripeSpan) {
      ctx.fillRect(sx, FLOOR_Y + 10, 13, 9);
    }

    // bird: sprite frame by time, tilted with velocity (level while bobbing)
    const frame = birdFrames[Math.floor(elapsed / 0.09) % 3]!;
    ctx.save();
    ctx.translate(BIRD_X + BIRD_SIZE / 2, birdY + BIRD_SIZE / 2);
    if (phase === "playing" || phase === "dead") {
      ctx.rotate(Math.max(-0.4, Math.min(0.9, velocity / (900 * u))));
    }
    ctx.drawImage(frame, -SPRITE_W / 2, -SPRITE_H / 2, SPRITE_W, SPRITE_H);
    ctx.restore();

    // get-ready / paused hint
    if (phase === "ready" || phase === "paused") {
      const hint = phase === "ready" ? "TAP TO FLAP" : "PAUSED — TAP";
      ctx.font = "900 34px -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 7;
      ctx.lineJoin = "round";
      ctx.strokeStyle = OUTLINE;
      ctx.strokeText(hint, W / 2, H * 0.62);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(hint, W / 2, H * 0.62);
      ctx.textAlign = "left";
    }

    // arcade score
    if (phase !== "ready") {
      ctx.font = "900 52px -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 8;
      ctx.lineJoin = "round";
      ctx.strokeStyle = OUTLINE;
      ctx.strokeText(String(score), W / 2, 96);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(String(score), W / 2, 96);
      ctx.textAlign = "left";
    }
  };

  const frame = (t: number) => {
    if (phase === "dead") {
      draw();
      return;
    }
    const dt = lastTime ? Math.min((t - lastTime) / 1000, 1 / 30) : 0;
    lastTime = t;
    elapsed += dt;
    if (phase === "playing") {
      step(dt);
    } else if (phase === "ready") {
      birdY = restY + Math.sin(elapsed * 4) * 7 * u; // idle bob
    }
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
  document.addEventListener("visibilitychange", pauseIfPlaying);
  window.addEventListener("blur", pauseIfPlaying);

  const cleanup = () => {
    cancelAnimationFrame(raf);
    stage.removeEventListener("pointerdown", onPointer);
    window.removeEventListener("keydown", onKey);
    document.removeEventListener("visibilitychange", pauseIfPlaying);
    window.removeEventListener("blur", pauseIfPlaying);
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
