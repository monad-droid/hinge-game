import "./styles.css";
import { CURRENT_PACK_ID, ENABLE_PREDICTIONS } from "../shared/config";
import { getPack } from "../shared/packs";
import { getChallenge, otherComponentId } from "../shared/drawing";
import type { Answer, DrawingSubmission } from "../shared/types";
import { ApiFail, api } from "./api";
import { startQuiz } from "./quiz";
import { startReveal } from "./reveal";
import {
  showExpired,
  showLanding,
  showLoading,
  showNetworkError,
  showNotFound,
  showP2Intro,
  showShare,
} from "./screens";
import { getDraft, getRole, setRole } from "./storage";

function navigate(path: string): void {
  history.pushState(null, "", path);
  route();
}

const goHome = () => navigate("/");

function route(): void {
  const path = location.pathname;
  const gameMatch = /^\/g\/([A-Za-z0-9]+)\/?$/.exec(path);
  if (path === "/" || path === "") {
    showLanding({
      onStart: startPlayer1,
      onCode: (code) => navigate(`/g/${code}`),
    });
  } else if (gameMatch) {
    void enterGame(gameMatch[1]!.toUpperCase());
  } else {
    showNotFound(goHome);
  }
}

// ————— Player 1 —————

function startPlayer1(): void {
  const pack = getPack(CURRENT_PACK_ID)!;
  startQuiz({
    pack,
    draftKey: "p1",
    drawing: { role: "p1" },
    onComplete: async (
      answers: Answer[],
      prediction: number | null,
      flappy: number | null,
      flappyRetry: boolean,
      drawing: DrawingSubmission | null
    ) => {
      const { code } = await api.createGame(
        answers, ENABLE_PREDICTIONS ? prediction : null, flappy, flappyRetry, drawing
      );
      setRole(code, "p1");
      history.replaceState(null, "", `/g/${code}`);
      showShare(code, { fresh: true, drew: !!drawing, onReady: () => void goReveal(code) });
    },
  });
}

// ————— entering /g/:code —————

async function enterGame(code: string): Promise<void> {
  showLoading();
  let status;
  try {
    status = await api.getStatus(code);
  } catch (e) {
    handleTerminal(e, code);
    return;
  }

  const role = getRole(code);

  if (status.state === "WAITING_FOR_P2") {
    if (role === "p1") {
      // The creator opened their own link — show waiting, never Player 2's
      // flow, so a browser can't accidentally play against itself.
      showShare(code, { fresh: false, onReady: () => void goReveal(code) });
    } else {
      const draft = getDraft(`p2.${code}`);
      const assigned =
        status.drawChallengeId && status.drawComponent
          ? assignedComponentFor(status.drawChallengeId, status.drawComponent)
          : null;
      if (draft && draft.answers.length > 0) {
        beginPlayer2(code, status.packId, assigned); // resume mid-quiz without re-intro
      } else {
        showP2Intro({ onBegin: () => beginPlayer2(code, status.packId, assigned) });
      }
    }
    return;
  }

  // COMPLETE — always straight to the reveal, labeled You/Them (from the
  // stored role, or the sharer's perspective if this browser has none).
  void goReveal(code);
}

// ————— Player 2 —————

// P2 always draws the component P1 did not take. The server enforces this
// too; this just tells the client which part to present.
function assignedComponentFor(challengeId: string, p1Component: string): string | null {
  const challenge = getChallenge(challengeId);
  if (!challenge) return null;
  return otherComponentId(challenge, p1Component);
}

function beginPlayer2(code: string, packId: string, assignedDrawComponent: string | null): void {
  const pack = getPack(packId) ?? getPack(CURRENT_PACK_ID)!;
  startQuiz({
    pack,
    draftKey: `p2.${code}`,
    drawing: { role: "p2", assigned: assignedDrawComponent },
    onComplete: async (
      answers: Answer[],
      prediction: number | null,
      flappy: number | null,
      flappyRetry: boolean,
      drawing: DrawingSubmission | null
    ) => {
      try {
        // P2 never names a component — the server derives it from P1's.
        const p2Drawing = drawing ? { points: drawing.points, mulligan: drawing.mulligan } : null;
        await api.submitP2(code, answers, ENABLE_PREDICTIONS ? prediction : null, flappy, flappyRetry, p2Drawing);
      } catch (e) {
        if (e instanceof ApiFail && e.kind === "already_settled") {
          await resolveSettledConflict(code, answers);
          return;
        }
        if (e instanceof ApiFail && (e.kind === "expired" || e.kind === "not_found")) {
          handleTerminal(e, code);
          return;
        }
        throw e; // network etc. — the quiz shows a retry
      }
      setRole(code, "p2");
      void goReveal(code);
    },
  });
}

// A 409 on submit usually means our own earlier submit landed but the
// response got lost (refresh mid-submit). If the locked Player 2 answers
// match what this browser was submitting, treat this browser as Player 2.
async function resolveSettledConflict(code: string, attempted: Answer[]): Promise<void> {
  try {
    const reveal = await api.getReveal(code);
    if (reveal.p2.answers.join("") === attempted.join("")) {
      setRole(code, "p2");
      startReveal(reveal, "p2", goHome);
      return;
    }
  } catch {
    // fall through — show the reveal from the default perspective
  }
  void goReveal(code);
}

// ————— reveal —————

async function goReveal(code: string): Promise<void> {
  showLoading();
  try {
    const reveal = await api.getReveal(code);
    startReveal(reveal, getRole(code), goHome);
  } catch (e) {
    if (e instanceof ApiFail && e.kind === "not_ready") {
      // Direct navigation to a reveal that isn't ready yet.
      void enterGame(code);
      return;
    }
    handleTerminal(e, code);
  }
}

// ————— shared error handling —————

function handleTerminal(e: unknown, code: string): void {
  if (e instanceof ApiFail) {
    if (e.kind === "not_found") return showNotFound(goHome);
    if (e.kind === "expired") return showExpired(goHome);
  }
  showNetworkError(() => void enterGame(code));
}

// An (empty) touchstart listener makes mobile Safari apply :active styles
// on touch, so every button gets press feedback, not just the answers.
document.addEventListener("touchstart", () => {}, { passive: true });

window.addEventListener("popstate", route);
route();
