// Tiny DOM helpers. No framework — the app is eight screens and a fetch.

type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, unknown> | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key.startsWith("on") && typeof value === "function") {
        el.addEventListener(key.slice(2), value as EventListener);
      } else if (key === "class") {
        el.className = String(value);
      } else if (key === "value" && el instanceof HTMLInputElement) {
        el.value = String(value);
      } else if (value === true) {
        el.setAttribute(key, "");
      } else {
        el.setAttribute(key, String(value));
      }
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

let cleanup: (() => void) | null = null;

// Register a teardown (poll timers etc.) for the current screen; it runs
// automatically when the next screen mounts.
export function onScreenExit(fn: () => void): void {
  cleanup = fn;
}

export function mount(screen: HTMLElement): void {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  const app = document.getElementById("app")!;
  app.replaceChildren(screen);
  window.scrollTo(0, 0);
  // Move screen-reader/keyboard focus to the new screen's heading.
  const heading = screen.querySelector<HTMLElement>("h1, h2");
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string): void {
  document.querySelector(".toast")?.remove();
  clearTimeout(toastTimer);
  const el = h("div", { class: "toast", role: "status" }, message);
  document.body.append(el);
  toastTimer = setTimeout(() => el.remove(), 2000);
}

export function wordmark(): HTMLElement {
  return h("a", { class: "wordmark", href: "/", "aria-label": "Debatable, home" }, "Debat", h("em", null, "able"));
}

export function footerNote(): HTMLElement {
  return h("div", { class: "footer" }, h("p", { class: "fine" }, "Games disappear after 30 days."));
}
