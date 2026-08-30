import type {
  Answer,
  ApiError,
  CreateGameResponse,
  GameStatus,
  RevealResponse,
} from "../shared/types";

export class ApiFail extends Error {
  kind: ApiError["error"] | "network";

  constructor(kind: ApiError["error"] | "network", message: string) {
    super(message);
    this.kind = kind;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiFail("network", "Network hiccup.");
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // fall through — treated below
  }
  if (!res.ok) {
    const apiError = body as Partial<ApiError> | null;
    throw new ApiFail(apiError?.error ?? "network", apiError?.message ?? "Something went sideways.");
  }
  return body as T;
}

export const api = {
  createGame(answers: Answer[], prediction: number | null): Promise<CreateGameResponse> {
    return request("/api/games", {
      method: "POST",
      body: JSON.stringify({ answers, prediction }),
    });
  },

  getStatus(code: string): Promise<GameStatus> {
    return request(`/api/games/${encodeURIComponent(code)}`);
  },

  submitP2(code: string, answers: Answer[], prediction: number | null): Promise<{ ok: true }> {
    return request(`/api/games/${encodeURIComponent(code)}/p2`, {
      method: "POST",
      body: JSON.stringify({ answers, prediction }),
    });
  },

  getReveal(code: string): Promise<RevealResponse> {
    return request(`/api/games/${encodeURIComponent(code)}/reveal`);
  },
};
