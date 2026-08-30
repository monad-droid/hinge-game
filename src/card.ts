// Client-side PNG of the result card (1080×1350, the classic 4:5 social
// size). Screenshots are the primary path; this is the deluxe option.

import { PUBLIC_DOMAIN, QUESTIONS_PER_GAME } from "../shared/config";

export interface CardData {
  score: number;
  verdict: string;
  disputeTopic: string | null;
}

const W = 1080;
const H = 1350;
const PAPER = "#f6f1e7";
const INK = "#191512";
const ACCENT = "#ff4d00";
const MUTED = "rgba(25, 21, 18, 0.55)";

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const words = text.split(" ");
  let line = "";
  let cursorY = y;
  for (const word of words) {
    const attempt = line ? `${line} ${word}` : word;
    if (ctx.measureText(attempt).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = attempt;
    }
  }
  if (line) ctx.fillText(line, x, cursorY);
  return cursorY + lineHeight;
}

// Saving: on phones we hand the PNG to the native share sheet (so iOS offers
// "Save Image" → Photos, AirDrop, Messages…); desktop browsers without
// file-sharing fall back to a plain download.
export async function saveCardImage(data: CardData): Promise<void> {
  const blob = await renderCardPng(data);
  const file = new File([blob], "debatable.png", { type: "image/png" });

  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // user closed the sheet
      // Anything else (lost user-gesture, share refused) → download instead.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "debatable.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function renderCardPng(data: CardData): Promise<Blob> {
  // Make sure the display face is ready before drawing with it.
  try {
    await Promise.all([
      document.fonts.load('italic 160px "Instrument Serif"'),
      document.fonts.load('400 60px "Instrument Serif"'),
    ]);
  } catch {
    // Fall back to Georgia below.
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");

  const serif = '"Instrument Serif", Georgia, serif';
  const sans = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const margin = 90;

  // Paper + frame
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  ctx.strokeRect(36, 36, W - 72, H - 72);

  // Wordmark
  ctx.fillStyle = INK;
  ctx.font = `800 44px ${sans}`;
  ctx.textBaseline = "alphabetic";
  drawTracked(ctx, "DEBATABLE", margin, 190, 14);

  // Score
  ctx.font = `italic 300px ${serif}`;
  ctx.fillStyle = INK;
  const scoreText = String(data.score);
  ctx.fillText(scoreText, margin, 500);
  const scoreWidth = ctx.measureText(scoreText).width;
  ctx.font = `italic 130px ${serif}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(` / ${QUESTIONS_PER_GAME}`, margin + scoreWidth + 10, 500);

  // Divider
  ctx.fillStyle = INK;
  ctx.fillRect(margin, 585, W - margin * 2, 6);

  // Featured dispute (or the 7/7 joke)
  ctx.fillStyle = ACCENT;
  ctx.font = `800 28px ${sans}`;
  const label = data.disputeTopic
    ? "BUT APPARENTLY WE NEED TO DISCUSS"
    : "DISPUTES DETECTED";
  drawTracked(ctx, label, margin, 680, 4);

  ctx.fillStyle = INK;
  ctx.font = `800 64px ${sans}`;
  const topic = (data.disputeTopic ?? "None. Which is somehow worse.").toUpperCase();
  const afterTopic = wrapText(ctx, topic, margin, 770, W - margin * 2, 78);

  // Verdict
  ctx.fillStyle = INK;
  ctx.font = `italic 72px ${serif}`;
  wrapText(ctx, data.verdict, margin, afterTopic + 90, W - margin * 2, 88);

  // Domain
  ctx.fillStyle = ACCENT;
  ctx.font = `800 40px ${sans}`;
  drawTracked(ctx, PUBLIC_DOMAIN.toUpperCase(), margin, H - 120, 10);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("toBlob failed");
  return blob;
}

// Canvas has no letter-spacing; fake it per character.
function drawTracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number): void {
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + tracking;
  }
}
