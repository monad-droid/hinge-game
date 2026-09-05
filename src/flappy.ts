// The tiebreaker: a one-attempt flappy game. Classic-arcade look — pixel
// bird, capped pipes, scrolling ground — drawn from hand-made pixel maps on
// canvas (original artwork, no image assets). Calls onDone(score, retried)
// when the run ends and the player continues (retried = the score came via
// the zero-pity do-over), or onDone(null, false) if they skip.

import { h, mount, onScreenExit, wordmark } from "./ui";

export interface FlappyOptions {
  onDone: (score: number | null, retried: boolean) => void;
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
  // disco outfit: mirrored shades, sequins, silver wing
  A: "#37d5f0",
  M: "#ff4fd8",
  P: "#a04de0",
  V: "#7a2bb5",
  G: "#ffd23f",
  S: "#e6e9f2",
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

// The same bird, dressed for the club: black deal-with-it shades under
// the white brow and a full purple suit — jacket over the lower body,
// matching wing, darker purple shading.
const DISCO_BIRD_MAP = [
  ".......KKKKKK.......",
  ".....KKYYYYYYKK.....",
  "....KYYYYYYYKWWWK...",
  "...KYYYYYYYKKKKKKK..",
  "...KYYYYYYYKKKKKKK..",
  "..KYYYYYYYYKWWWWWK..",
  "..KYYYYYYYYYKWWWK...",
  "..KYYYYYYYYYKKKKKKK.",
  "..KPPPPPPPPKOOOOOOK.",
  "..KPPPPPPPPKDDDDDDK.",
  "...KPPPPPPPPKKKKKK..",
  "...KPPVPPGPPPK......",
  "....KPVPPPVPK.......",
  ".....KKKKKKK........",
];

const DISCO_WING_MAP = [
  ".KKKKK..",
  "KPPPPPK.",
  "KPVPPVPK",
  "KPPPPPK.",
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
function makeBirdFrames(bodyMap: string[], wingMap: string[]): HTMLCanvasElement[] {
  return [-2, 0, 2].map((wingOffset) => {
    const c = document.createElement("canvas");
    c.width = 20;
    c.height = bodyMap.length;
    const ctx = c.getContext("2d")!;
    paintMap(ctx, bodyMap, 0, 0);
    paintMap(ctx, wingMap, 1, 5 + wingOffset);
    return c;
  });
}

// Blows the Play button apart: white flash, expanding shockwave, a fan of
// palette shards, fast streaks, drifting star glyphs, a screen shake, and a
// delayed second crackle. Pure DOM + WAAPI.
const BOOM_COLORS = ["#ff4d00", "#ffc233", "#74bf2e", "#2657e0", "#a04de0", "#191512", "#ffffff"];

function explodeButton(container: HTMLElement, btn: HTMLElement): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = btn.getBoundingClientRect();
  const home = container.getBoundingClientRect();
  const cx = rect.left - home.left + rect.width / 2;
  const cy = rect.top - home.top + rect.height / 2;

  // central flash
  const flash = document.createElement("span");
  flash.className = "boom-flash";
  flash.style.cssText = `left:${cx}px;top:${cy}px`;
  container.append(flash);
  const flashAnim = flash.animate(
    [
      { transform: "translate(-50%, -50%) scale(0.2)", opacity: 1 },
      { transform: "translate(-50%, -50%) scale(2.6)", opacity: 0 },
    ],
    { duration: 320, easing: "ease-out", fill: "forwards" }
  );
  flashAnim.onfinish = () => flash.remove();

  // circular shockwave
  const ring = document.createElement("span");
  ring.className = "boom-ring";
  ring.style.cssText = `left:${cx}px;top:${cy}px`;
  container.append(ring);
  const ringAnim = ring.animate(
    [
      { transform: "translate(-50%, -50%) scale(0.2)", opacity: 1 },
      { transform: "translate(-50%, -50%) scale(3.4)", opacity: 0 },
    ],
    { duration: 550, easing: "cubic-bezier(0.16, 0.85, 0.35, 1)", fill: "forwards" }
  );
  ringAnim.onfinish = () => ring.remove();

  // screen shake
  container.animate(
    [
      { transform: "translate(0, 0)" },
      { transform: "translate(-5px, 4px)" },
      { transform: "translate(5px, -3px)" },
      { transform: "translate(-4px, -4px)" },
      { transform: "translate(3px, 3px)" },
      { transform: "translate(0, 0)" },
    ],
    { duration: 380, easing: "ease-out" }
  );

  const spawnShard = (
    x: number,
    y: number,
    opts: { size: [number, number]; dist: [number, number]; dur: [number, number]; kind?: string; text?: string; color?: string }
  ) => {
    const shard = document.createElement("span");
    shard.className = "spark" + (opts.kind ? ` ${opts.kind}` : "");
    const size = opts.size[0] + Math.random() * (opts.size[1] - opts.size[0]);
    const color = opts.color ?? BOOM_COLORS[Math.floor(Math.random() * BOOM_COLORS.length)]!;
    if (opts.text) {
      shard.textContent = opts.text;
      shard.style.cssText = `left:${x}px;top:${y}px;font-size:${size}px;color:${color}`;
    } else {
      const tall = Math.random() < 0.35 ? 2.4 : 1;
      shard.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size * tall}px;background:${color}`;
    }
    container.append(shard);
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.8;
    const dist = opts.dist[0] + Math.random() * (opts.dist[1] - opts.dist[0]);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const spin = (Math.random() - 0.5) * 900;
    const anim = shard.animate(
      [
        { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${spin}deg)`, opacity: 1, offset: 0.65 },
        { transform: `translate(${dx}px, ${dy + 80}px) rotate(${spin * 1.4}deg)`, opacity: 0 },
      ],
      {
        duration: opts.dur[0] + Math.random() * (opts.dur[1] - opts.dur[0]),
        easing: "cubic-bezier(0.16, 0.85, 0.35, 1)",
        fill: "forwards",
      }
    );
    anim.onfinish = () => shard.remove();
  };

  // fast streaks first — the firework trails
  for (let i = 0; i < 14; i++) {
    spawnShard(cx, cy, { size: [3, 4], dist: [140, 330], dur: [320, 520], kind: "spark-streak", color: Math.random() < 0.5 ? "#ffffff" : "#ffc233" });
  }
  // main confetti fan from across the button's face
  for (let i = 0; i < 46; i++) {
    spawnShard(rect.left - home.left + Math.random() * rect.width, rect.top - home.top + Math.random() * rect.height, {
      size: [5, 13],
      dist: [80, 300],
      dur: [780, 1200],
    });
  }
  // drifting stars
  for (let i = 0; i < 7; i++) {
    spawnShard(cx + (Math.random() - 0.5) * rect.width * 0.6, cy, {
      size: [15, 26],
      dist: [70, 190],
      dur: [1000, 1450],
      kind: "spark-star",
      text: "\u2726",
      color: Math.random() < 0.5 ? "#ffc233" : "#ff4d00",
    });
  }
  // delayed second crackle near the center
  window.setTimeout(() => {
    if (!container.isConnected) return;
    for (let i = 0; i < 18; i++) {
      spawnShard(cx + (Math.random() - 0.5) * 140, cy - 60 + (Math.random() - 0.5) * 90, {
        size: [3, 6],
        dist: [30, 110],
        dur: [380, 650],
        color: Math.random() < 0.4 ? "#ffffff" : undefined as unknown as string,
      });
    }
  }, 260);
}

// Confetti shower from the top edge of the stage: staggered drops with
// flutter and spin, falling through the overlay cut and over the sky.
function rainConfetti(container: HTMLElement): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const home = container.getBoundingClientRect();
  // Spawn above the very top of the SCREEN (not just the stage), so the
  // shower visibly enters from the top edge of the page.
  const spawnY = -(Math.max(0, home.top) + 30);
  for (let i = 0; i < 102; i++) {
    const piece = document.createElement("span");
    piece.className = "spark";
    const size = 3 + Math.random() * 4;
    const strip = Math.random() < 0.5;
    piece.style.cssText = `left:${Math.random() * home.width}px;top:${spawnY}px;width:${size}px;height:${
      strip ? size * 2.3 : size
    }px;background:${BOOM_COLORS[i % BOOM_COLORS.length]}`;
    container.append(piece);
    const drift = (Math.random() - 0.5) * 140;
    const flutter = 14 + Math.random() * 22;
    const fall = home.height - spawnY + 40;
    const spin = (Math.random() - 0.5) * 1080;
    const anim = piece.animate(
      [
        { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
        { transform: `translate(${drift * 0.4 + flutter}px, ${fall * 0.35}px) rotate(${spin * 0.4}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${drift * 0.7 - flutter}px, ${fall * 0.68}px) rotate(${spin * 0.7}deg)`, opacity: 1, offset: 0.68 },
        { transform: `translate(${drift}px, ${fall}px) rotate(${spin}deg)`, opacity: 0.85 },
      ],
      {
        duration: 1100 + Math.random() * 900,
        delay: Math.random() * 380,
        easing: "cubic-bezier(0.35, 0.15, 0.75, 0.9)",
        fill: "both",
      }
    );
    anim.onfinish = () => piece.remove();
  }
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
            explodeButton(stage, btn);
            rainConfetti(stage);
            const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            // Cut to the game the moment the main burst is spent — no dead
            // beat after the explosion; the last shards finish over the sky.
            window.setTimeout(() => {
              startOverlay.remove();
              phase = "ready";
            }, reduced ? 120 : 620);
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
            opts.onDone(null, false);
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
        wordmark(),
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

  const birdFrames = makeBirdFrames(BIRD_MAP, WING_MAP);
  const discoFrames = makeBirdFrames(DISCO_BIRD_MAP, DISCO_WING_MAP);
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
  let pipes: { x: number; gapY: number; gap: number; counted: boolean; passedAt: number | null; index: number }[] = [];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // ——— DISCO MODE ———
  // The 5th pipe is the disco pipe (mirrored, glinting). Passing it drops
  // the whole world into the club: dark sky, sweeping lights, a disco
  // ball, neon pipes, and a flashing dance floor.
  const DISCO_PIPE = 5;
  let pipeIndex = 0;
  let discoOn = false;
  let discoAt = -1;
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

  // A zero earns pity: one offer to go again. Only zeros, only once —
  // any score that clears a single pipe is final, same as always.
  let zeroRetryUsed = false;

  const restartRun = () => {
    birdY = restY;
    velocity = 0;
    score = 0;
    pipes = [];
    pipeIndex = 0;
    discoOn = false;
    discoAt = -1;
    nextPipeX = W + 140;
    scrollX = 0;
    lastTime = 0;
    phase = "ready";
    raf = requestAnimationFrame(frame);
  };

  const showResult = () => {
    if (score === 0 && !zeroRetryUsed) {
      showZeroRetry();
      return;
    }
    const line =
      score === 0 && zeroRetryUsed ? "Immediate ground contact. Again." : resultLine(score);
    const overlay = h(
      "div",
      { class: "flappy-overlay flappy-overlay-fade" },
      h("p", { class: "kicker" }, "Final distance"),
      h("p", { class: "score-huge" }, String(score)),
      h("p", { class: "verdict-line" }, line),
      h(
        "button",
        {
          class: "btn btn-primary mt",
          onclick: (e: Event) => {
            e.stopPropagation();
            cleanup();
            opts.onDone(score, zeroRetryUsed);
          },
        },
        "Continue"
      )
    );
    stage.append(overlay);
    overlay.querySelector("button")?.focus();
  };

  // A light card floating over the dimmed game world — the crash site
  // (and the arcade 0) stay visible behind the scrim.
  const showZeroRetry = () => {
    const overlay = h(
      "div",
      { class: "flappy-overlay flappy-overlay-scrim flappy-overlay-fade" },
      h(
        "div",
        { class: "pity-card" },
        h("h1", { class: "pity-title" }, "Immediate ground contact"),
        h("div", { class: "pity-rule" }),
        h("p", { class: "pity-sub" }, "Look, we don't normally do this. But that was hard to watch."),
        h(
          "button",
          {
            class: "pity-btn",
            onpointerdown: (e: Event) => e.stopPropagation(),
            // The same send-off as the Play button: launch scale, firework
            // explosion, confetti, then cut to the run as the burst spends.
            onclick: (e: Event) => {
              e.stopPropagation();
              const btn = e.currentTarget as HTMLButtonElement;
              btn.disabled = true;
              btn.classList.add("is-launching");
              explodeButton(stage, btn);
              rainConfetti(stage);
              const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              window.setTimeout(() => {
                zeroRetryUsed = true;
                overlay.remove();
                restartRun();
              }, reduced ? 120 : 620);
            },
          },
          "One more try"
        ),
        h(
          "button",
          {
            class: "pity-ghost",
            onpointerdown: (e: Event) => e.stopPropagation(),
            onclick: (e: Event) => {
              e.stopPropagation();
              cleanup();
              opts.onDone(0, false);
            },
          },
          "I'm keeping the 0"
        )
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
      pipes.push({ x: nextPipeX, gapY: spawnGapY(gap), gap, counted: false, passedAt: null, index: ++pipeIndex });
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
        pipe.passedAt = elapsed; // kicks off the pass pop
        score++;
        if (pipe.index === DISCO_PIPE && !discoOn) {
          discoOn = true;
          discoAt = elapsed;
        }
      }
    }
  };

  // ——— rendering ———
  const drawPipePair = (pipe: { x: number; gapY: number; gap: number; passedAt: number | null; index: number }) => {
    const capH = 26;
    // Pass pop: cleared pipes swell to a peak, settle slightly bigger, and
    // stay lit — permanently wider and lighter, a trail of conquests.
    const POP = 0.3;
    const PEAK = 16;
    const REST = 10;
    const popT = pipe.passedAt === null ? -1 : elapsed - pipe.passedAt;
    let bulge = 0;
    if (popT >= 0) {
      if (popT < POP / 2) bulge = PEAK * Math.sin(Math.PI * (popT / POP));
      else if (popT < POP) bulge = REST + (PEAK - REST) * Math.cos((Math.PI * (popT - POP / 2)) / POP);
      else bulge = REST;
    }
    const k = popT >= 0 && popT < POP ? Math.sin(Math.PI * (popT / POP)) : 0;
    const x = pipe.x - bulge / 2;
    const w = PIPE_WIDTH + bulge;

    // Palette: the disco pipe is mirrored silver; once the mode drops,
    // later pipes go neon (hue cycling by index). Earlier pipes stay green.
    let cMain: string = PIPE;
    let cLight: string = PIPE_LIGHT;
    let cDark: string = PIPE_DARK;
    if (pipe.index === DISCO_PIPE) {
      cMain = "#c9cfdd"; cLight = "#eef2f8"; cDark = "#8b93a6";
    } else if (discoOn && pipe.index > DISCO_PIPE) {
      const NEON: [string, string, string][] = [
        ["#e438c4", "#ff86e3", "#96157e"],
        ["#2ec9e0", "#8fe9f5", "#1a7f92"],
        ["#f3b32a", "#ffe08a", "#a97a10"],
      ];
      [cMain, cLight, cDark] = NEON[pipe.index % NEON.length]!;
    }

    const body = (top: number, height: number) => {
      if (height <= 0) return;
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(x + 3, top, w - 6, height);
      ctx.fillStyle = cMain;
      ctx.fillRect(x + 5, top, w - 10, height);
      ctx.fillStyle = cLight;
      ctx.fillRect(x + 8, top, 7, height);
      ctx.fillStyle = cDark;
      ctx.fillRect(x + w - 12, top, 5, height);
    };

    const cap = (top: number) => {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(x, top, w, capH);
      ctx.fillStyle = cMain;
      ctx.fillRect(x + 2, top + 2, w - 4, capH - 4);
      ctx.fillStyle = cLight;
      ctx.fillRect(x + 5, top + 2, 8, capH - 4);
      ctx.fillStyle = cDark;
      ctx.fillRect(x + w - 10, top + 2, 5, capH - 4);
    };

    // top pipe (hangs from the ceiling)
    body(0, pipe.gapY - capH);
    cap(pipe.gapY - capH);
    // bottom pipe (stands on the ground)
    cap(pipe.gapY + pipe.gap);
    body(pipe.gapY + pipe.gap + capH, FLOOR_Y - pipe.gapY - pipe.gap - capH);

    // The portal: a skinny, glowing purple swirl filling the disco pipe's
    // gap — layered outer glow, bright body, rotating darker swirl arcs,
    // pale center. You fly through it into disco mode.
    if (pipe.index === DISCO_PIPE) {
      const pcx = x + w / 2;
      const pcy = pipe.gapY + pipe.gap / 2;
      const rx = w * 0.32;
      const ry = pipe.gap / 2 - 3;
      const wob = (ph: number) => (reducedMotion ? 0 : Math.sin(elapsed * 3.1 + ph) * 2.5);
      ctx.save();
      // outer glow, layered
      const GLOW: [string, number][] = [
        ["rgba(160, 77, 224, 0.16)", 14],
        ["rgba(160, 77, 224, 0.3)", 8],
        ["rgba(206, 140, 255, 0.45)", 4],
      ];
      for (let gi = 0; gi < GLOW.length; gi++) {
        const [gc, grow] = GLOW[gi]!;
        ctx.fillStyle = gc;
        ctx.beginPath();
        ctx.ellipse(pcx, pcy, rx + grow + wob(gi), ry + grow * 0.7 + wob(gi + 2), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // body
      ctx.fillStyle = "#a04de0";
      ctx.beginPath();
      ctx.ellipse(pcx, pcy, rx + wob(5), ry, 0, 0, Math.PI * 2);
      ctx.fill();
      // rotating darker swirl arcs
      ctx.strokeStyle = "#6b2aa8";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      for (let si = 0; si < 3; si++) {
        const a0 = (reducedMotion ? si : elapsed * 2.4 + si * 2.1);
        ctx.beginPath();
        ctx.ellipse(pcx, pcy, rx * (0.82 - si * 0.22), ry * (0.85 - si * 0.22), 0, a0, a0 + Math.PI * 1.25);
        ctx.stroke();
      }
      // pale center
      ctx.fillStyle = "#f2e4ff";
      ctx.beginPath();
      ctx.ellipse(pcx, pcy, rx * 0.34, ry * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Mirror-ball glints wandering the disco pipe's faces.
    if (pipe.index === DISCO_PIPE) {
      ctx.fillStyle = "#ffffff";
      const tphase = reducedMotion ? 0 : Math.floor(elapsed * 6);
      for (let i = 0; i < 8; i++) {
        const hsh = ((i * 73 + tphase * 37) % 97) / 97;
        const topH = Math.max(1, pipe.gapY - 20);
        const botH = Math.max(1, FLOOR_Y - pipe.gapY - pipe.gap - 30);
        const gy = i % 2 === 0 ? 6 + hsh * topH : pipe.gapY + pipe.gap + 10 + hsh * botH;
        const gx = x + 6 + ((i * 29 + tphase * 13) % Math.max(1, Math.floor(w) - 14));
        ctx.fillRect(gx, gy, 3, 3);
      }
    }


    if (popT >= 0) {
      // Lights up on pass, pulses brighter through the pop, then holds.
      ctx.globalAlpha = Math.max(0.38, k * 0.55);
      ctx.fillStyle = cLight;
      ctx.fillRect(x, 0, w, pipe.gapY);
      ctx.fillRect(x, pipe.gapY + pipe.gap, w, FLOOR_Y - pipe.gapY - pipe.gap);
      ctx.globalAlpha = 1;
    }
  };

  const draw = () => {
    // sky — or the club, once the disco pipe has been passed
    ctx.fillStyle = discoOn ? "#191231" : SKY;
    ctx.fillRect(0, 0, W, H);

    if (!discoOn) {
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
    } else {
      // club lights: three sweeping additive beams
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.16;
      const BEAMS: [number, string][] = [
        [0.15, "#ff4fd8"],
        [0.5, "#37d5f0"],
        [0.85, "#ffd23f"],
      ];
      for (let i = 0; i < BEAMS.length; i++) {
        const [fx, color] = BEAMS[i]!;
        const sway = reducedMotion ? 0 : Math.sin(elapsed * 1.4 + i * 2.1) * 0.45;
        ctx.save();
        ctx.translate(W * fx, -6);
        ctx.rotate(sway + (fx - 0.5) * 0.4);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(8, 0);
        ctx.lineTo(70, H);
        ctx.lineTo(-70, H);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      // twin disco balls, flanking the score
      for (const bfx of [0.18, 0.82]) {
      const bx = W * bfx;
      const by = 70;
      const r = 22;
      ctx.strokeStyle = "#8b93a6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx, by - r);
      ctx.stroke();
      ctx.fillStyle = "#c9cfdd";
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = "rgba(139, 147, 166, 0.7)";
      ctx.lineWidth = 1;
      for (let gy = -r; gy <= r; gy += 8) {
        ctx.beginPath();
        ctx.moveTo(bx - r, by + gy);
        ctx.lineTo(bx + r, by + gy);
        ctx.stroke();
      }
      const spin = reducedMotion ? 0 : (elapsed * 30) % 16;
      for (let gx = -r - 16; gx <= r; gx += 8) {
        ctx.beginPath();
        ctx.moveTo(bx + gx + spin, by - r);
        ctx.lineTo(bx + gx + spin, by + r);
        ctx.stroke();
      }
      ctx.fillStyle = "#ffffff";
      const gl = Math.floor(elapsed * 5) % 4;
      ctx.fillRect(bx - r + 6 + gl * 9, by - 8 + (gl % 2) * 10, 4, 4);
      ctx.fillRect(bx + r - 10 - gl * 5, by + 2 - (gl % 2) * 12, 3, 3);
      ctx.restore();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.stroke();
      }
    }

    for (const pipe of pipes) drawPipePair(pipe);

    if (!discoOn) {
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
    } else {
      // dance floor: flashing tiles scrolling with the world
      ctx.fillStyle = "#120c22";
      ctx.fillRect(0, FLOOR_Y, W, 7);
      const FLOOR_COLORS = ["#ff4fd8", "#37d5f0", "#ffd23f", "#9b5cf0"];
      const ts = 26;
      const beat = reducedMotion ? 0 : Math.floor(elapsed * 3);
      const firstCol = Math.floor(scrollX / ts);
      for (let ci = firstCol; ci <= firstCol + Math.ceil(W / ts) + 1; ci++) {
        ctx.fillStyle = FLOOR_COLORS[(((ci % 4) + 4) % 4 + beat) % 4]!;
        ctx.fillRect(ci * ts - scrollX, FLOOR_Y + 7, ts - 2, GROUND_H - 7);
      }
    }

    // bird: sprite frame by time, tilted with velocity (level while bobbing)
    const frame = (discoOn ? discoFrames : birdFrames)[Math.floor(elapsed / 0.09) % 3]!;
    ctx.save();
    ctx.translate(BIRD_X + BIRD_SIZE / 2, birdY + BIRD_SIZE / 2);
    if (phase === "playing" || phase === "dead") {
      ctx.rotate(Math.max(-0.4, Math.min(0.9, velocity / (900 * u))));
    }
    ctx.drawImage(frame, -SPRITE_W / 2, -SPRITE_H / 2, SPRITE_W, (SPRITE_H * frame.height) / 14);
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

    // the drop: a quick white flash the instant disco mode hits
    if (discoOn && discoAt >= 0 && elapsed - discoAt < 0.35 && !reducedMotion) {
      ctx.globalAlpha = (1 - (elapsed - discoAt) / 0.35) * 0.75;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
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
    const dt = lastTime ? Math.min((t - lastTime) / 1000, 1 / 45) : 0;
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
  // pointerdown preventDefault doesn't stop every WebKit touch gesture;
  // swallow raw touch events on the stage too (non-passive on purpose).
  // NEVER for touches on buttons: canceling touchend suppresses the click
  // they need to fire.
  const onTouch = (e: Event) => {
    const target = e.target as HTMLElement | null;
    if (target && target.closest("button")) return;
    e.preventDefault();
  };
  stage.addEventListener("touchstart", onTouch, { passive: false });
  stage.addEventListener("touchend", onTouch, { passive: false });
  window.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", pauseIfPlaying);
  window.addEventListener("blur", pauseIfPlaying);

  const cleanup = () => {
    cancelAnimationFrame(raf);
    stage.removeEventListener("pointerdown", onPointer);
    stage.removeEventListener("touchstart", onTouch);
    stage.removeEventListener("touchend", onTouch);
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
