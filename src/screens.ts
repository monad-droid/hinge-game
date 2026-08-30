// Landing, share, waiting, Player 2 intro, and the graceful dead-ends.

import { CODE_LENGTH, PUBLIC_DOMAIN } from "../shared/config";
import { api } from "./api";
import { footerNote, h, mount, onScreenExit, toast, wordmark } from "./ui";

export function gameUrl(code: string): string {
  return `${location.origin}/g/${code}`;
}

function displayUrl(code: string): string {
  const host = location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? location.host
    : PUBLIC_DOMAIN;
  return `${host}/g/${code}`;
}

async function copyLink(code: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(gameUrl(code));
    toast("Link copied.");
  } catch {
    toast("Couldn't copy. Long-press the link instead.");
  }
}

// ————— landing —————

export function showLanding(opts: { onStart: () => void; onCode: (code: string) => void }): void {
  const input = h("input", {
    type: "text",
    inputmode: "text",
    autocomplete: "off",
    autocapitalize: "characters",
    spellcheck: "false",
    maxlength: String(CODE_LENGTH),
    placeholder: "XK42P",
    "aria-label": "Game code",
  });

  const go = () => {
    const code = input.value.trim().toUpperCase();
    if (code.length !== CODE_LENGTH) {
      toast("Codes are 5 characters.");
      input.focus();
      return;
    }
    opts.onCode(code);
  };

  const codeRow = h(
    "div",
    { class: "code-entry", hidden: true },
    input,
    h("button", { class: "btn", onclick: go }, "Go")
  );

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") go();
  });

  mount(
    h(
      "div",
      { class: "screen" },
      h("header", { class: "landing-top" }, wordmark()),
      h(
        "main",
        { class: "landing-hero" },
        h("h1", { class: "display" }, "Seven meaningless questions. One person to argue with."),
        h(
          "div",
          { class: "stack mt" },
          h("button", { class: "btn btn-primary", onclick: opts.onStart }, "Start a game"),
          h(
            "button",
            {
              class: "btn-ghost btn",
              onclick: () => {
                codeRow.hidden = false;
                input.focus();
              },
            },
            "Have a code?"
          ),
          codeRow
        )
      ),
      footerNote()
    )
  );
}

// ————— Player 1: share & waiting —————

export function showShare(code: string, opts: { fresh: boolean; onReady: () => void }): void {
  const screen = h(
    "div",
    { class: "screen" },
    h("header", { class: "landing-top" }, wordmark()),
    h(
      "main",
      { class: "centered" },
      opts.fresh
        ? h("h1", { class: "display" }, "Your answers are locked.")
        : h("h1", { class: "display" }, "Still waiting."),
      opts.fresh
        ? h("p", { class: "sub" }, "Now send this to someone to see how you compare.")
        : h("p", { class: "sub" }, "Typical."),
      h(
        "div",
        { class: "stack mt" },
        h("button", { class: "btn btn-primary", onclick: () => void copyLink(code) }, "Copy link"),
        h("p", { class: "sharelink" }, displayUrl(code)),
        h("p", { class: "fine", style: "text-align:center" }, "They won't see your answers until they've picked theirs.")
      )
    ),
    footerNote()
  );

  mount(screen);
  pollUntilComplete(code, opts.onReady);
}

// Gentle polling: one status check every 15s while the tab is visible, plus
// an immediate check when the tab regains focus. No websockets, no hammering.
function pollUntilComplete(code: string, onReady: () => void): void {
  let stopped = false;

  const check = async () => {
    if (stopped || document.hidden) return;
    try {
      const status = await api.getStatus(code);
      if (!stopped && status.state === "COMPLETE") {
        stop();
        onReady();
      }
    } catch {
      // Transient failure — the next tick will try again.
    }
  };

  const interval = setInterval(() => void check(), 15000);
  const onVisible = () => {
    if (!document.hidden) void check();
  };
  document.addEventListener("visibilitychange", onVisible);

  const stop = () => {
    stopped = true;
    clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisible);
  };
  onScreenExit(stop);
}

// ————— Player 2 intro —————

export function showP2Intro(opts: { onBegin: () => void }): void {
  mount(
    h(
      "div",
      { class: "screen" },
      h("header", { class: "landing-top" }, wordmark()),
      h(
        "main",
        { class: "centered" },
        h("p", { class: "kicker" }, "You've been served"),
        h("h1", { class: "display" }, "They've already answered."),
        h("p", { class: "sub" }, "Now let's see how questionable your opinions are."),
        h(
          "div",
          { class: "stack mt" },
          h("button", { class: "btn btn-primary", onclick: opts.onBegin }, "Pick my sides"),
          h("p", { class: "fine", style: "text-align:center" }, "No peeking. Their answers stay hidden until you lock yours.")
        )
      ),
      footerNote()
    )
  );
}

// ————— dead-ends —————

function deadEnd(title: string, sub: string, cta: { label: string; onclick: () => void }[]): void {
  mount(
    h(
      "div",
      { class: "screen" },
      h("header", { class: "landing-top" }, wordmark()),
      h(
        "main",
        { class: "centered" },
        h("h1", { class: "display" }, title),
        h("p", { class: "sub" }, sub),
        h(
          "div",
          { class: "stack mt" },
          ...cta.map((c, i) =>
            h("button", { class: i === 0 ? "btn btn-primary" : "btn", onclick: c.onclick }, c.label)
          )
        )
      ),
      footerNote()
    )
  );
}

export function showNotFound(onHome: () => void): void {
  deadEnd("That debate doesn't exist.", "Check the link, or start your own argument.", [
    { label: "Start a game", onclick: onHome },
  ]);
}

export function showExpired(onHome: () => void): void {
  deadEnd("This debate has expired.", "Start a new one.", [
    { label: "Start a game", onclick: onHome },
  ]);
}

export function showSettled(opts: { onView: () => void; onHome: () => void }): void {
  deadEnd("Looks like this one is already settled.", "Both sides are locked in.", [
    { label: "See the verdict", onclick: opts.onView },
    { label: "Start a game", onclick: opts.onHome },
  ]);
}

export function showLoading(): void {
  mount(
    h(
      "div",
      { class: "screen" },
      h("header", { class: "landing-top" }, wordmark()),
      h("main", { class: "centered" }, h("p", { class: "kicker" }, "One moment"))
    )
  );
}

export function showNetworkError(onRetry: () => void): void {
  deadEnd("The internet has objections.", "Couldn't reach the server. Try again.", [
    { label: "Retry", onclick: onRetry },
  ]);
}

