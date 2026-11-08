"use client";

// Typed API client for every endpoint in lib/types.ts.
// Behavior: try the real API; on network error / 404 / 5xx fall back to lib/mock (logged once per endpoint).
// NEXT_PUBLIC_USE_MOCKS=1 forces mocks.

import type {
  ActionRequest,
  ActionResponse,
  AgentChatRequest,
  AgentPanelState,
  AgentStreamEvent,
  DashboardData,
  EngineResult,
  PersonaId,
  TfsData,
  Trip,
  WhatIfRequest,
} from "@/lib/types";
import {
  mockAction,
  mockRunWhatIf,
  mockRuntimeAgentInitial,
  mockRuntimeDashboard,
  mockStreamAgent,
  mockTfs,
  mockTrips,
  showcaseTripByPersona,
} from "@/lib/mock";

const FORCE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "1";

export type Source = "live" | "mock";
type Listener = (s: Record<string, Source>) => void;
const sources: Record<string, Source> = {};
const listeners = new Set<Listener>();
const warned = new Set<string>();

function mark(endpoint: string, s: Source, why?: string) {
  if (sources[endpoint] === s) return;
  sources[endpoint] = s;
  if (s === "mock" && !warned.has(endpoint)) {
    warned.add(endpoint);
    console.info(`[api] ${endpoint}: using mock data${why ? ` (${why})` : ""}`);
  }
  listeners.forEach((l) => l({ ...sources }));
}

/** Subscribe to which endpoints are live vs mocked (for a small dev indicator). */
export function subscribeSources(l: Listener) {
  listeners.add(l);
  l({ ...sources });
  return () => void listeners.delete(l);
}

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

async function request<T>(endpoint: string, url: string, init: RequestInit | undefined, fallback: () => T | Promise<T>): Promise<T> {
  if (FORCE_MOCKS) {
    mark(endpoint, "mock", "NEXT_PUBLIC_USE_MOCKS=1");
    return fallback();
  }
  try {
    const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    if (!res.ok) throw new HttpError(res.status);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json")) throw new Error(`unexpected ${ct || "content-type"}`);
    const data = (await res.json()) as T;
    mark(endpoint, "live");
    return data;
  } catch (err) {
    // 4xx other than 404 is a real client error the caller should see.
    if (err instanceof HttpError && err.status >= 400 && err.status < 500 && err.status !== 404) throw err;
    mark(endpoint, "mock", err instanceof Error ? err.message : String(err));
    return fallback();
  }
}

export function getDashboard(id: PersonaId): Promise<DashboardData> {
  return request("persona", `/api/persona/${id}`, undefined, () => mockRuntimeDashboard(id));
}

export function getTrip(tripId: string): Promise<Trip> {
  return request("trips", `/api/trips/${encodeURIComponent(tripId)}`, undefined, () => {
    const exact = mockTrips.find((t) => t.id === tripId);
    if (exact) return exact;
    // Non-showcase mock rows have no path: reuse the persona's showcase route with the row's id.
    const pid = (tripId.split("-")[0] as PersonaId) in showcaseTripByPersona ? (tripId.split("-")[0] as PersonaId) : "maya";
    return { ...showcaseTripByPersona[pid], id: tripId };
  });
}

export function getAgentInitial(personaId: PersonaId): Promise<AgentPanelState> {
  return request("agent-initial", `/api/agent/initial?personaId=${personaId}`, undefined, () => mockRuntimeAgentInitial(personaId));
}

export function postAction(req: ActionRequest): Promise<ActionResponse> {
  return request("actions", "/api/actions", { method: "POST", body: JSON.stringify(req) }, () => mockAction(req));
}

export function postWhatIf(req: WhatIfRequest): Promise<EngineResult> {
  return request("whatif", "/api/whatif", { method: "POST", body: JSON.stringify(req) }, () => {
    const p = mockRuntimeDashboard(req.personaId).persona;
    return mockRunWhatIf(p, req.moveType, req.overrides);
  });
}

export function getTfs(): Promise<TfsData> {
  return request("tfs", "/api/tfs", undefined, () => mockTfs());
}

/** Parse a text/event-stream body into AgentStreamEvents (one JSON object per `data:` line). */
async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<AgentStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.search(/\r?\n\r?\n/)) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx).replace(/^\r?\n\r?\n/, "");
      const data = raw
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!data || data === "[DONE]") continue;
      try {
        yield JSON.parse(data) as AgentStreamEvent;
      } catch {
        // ignore keep-alive / malformed frames
      }
    }
  }
  const tail = buf.trim();
  if (tail.startsWith("data:")) {
    try {
      yield JSON.parse(tail.slice(5).trim()) as AgentStreamEvent;
    } catch {
      /* noop */
    }
  }
}

/** Stream the agent's reply. Falls back to a scripted mock stream when /api/agent is unavailable. */
export async function* streamAgent(req: AgentChatRequest, signal?: AbortSignal): AsyncGenerator<AgentStreamEvent> {
  if (!FORCE_MOCKS) {
    let res: Response | null = null;
    try {
      res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify(req),
        signal,
      });
    } catch (err) {
      if (signal?.aborted) return;
      mark("agent", "mock", err instanceof Error ? err.message : String(err));
    }
    if (res && res.ok && res.body && (res.headers.get("content-type") ?? "").includes("event-stream")) {
      mark("agent", "live");
      yield* parseSse(res.body);
      return;
    }
    if (res) mark("agent", "mock", `HTTP ${res.status}`);
  } else {
    mark("agent", "mock", "NEXT_PUBLIC_USE_MOCKS=1");
  }
  yield* mockStreamAgent(req, mockRuntimeDashboard(req.personaId));
}
