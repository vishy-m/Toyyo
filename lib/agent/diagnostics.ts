import type { PersonaId } from "../types";
import { providerConfig } from "./llm";

interface RunDiagnostic {
  kind: "initial" | "chat";
  personaId: PersonaId;
  provider: string;
  model: string;
  groundingRetries: number;
  fallback: boolean;
  elapsedMs: number;
}
const root = globalThis as typeof globalThis & { __nextMoveAgentDiagnostics?: RunDiagnostic[] };
// Bounded, server-only demo diagnostics; never store prompts, responses or keys.
export const agentDiagnostics = root.__nextMoveAgentDiagnostics ??= [];
export function startDiagnostic(kind: RunDiagnostic["kind"], personaId: PersonaId) {
  const started = Date.now();
  const record: RunDiagnostic = { kind, personaId, ...providerConfig(), groundingRetries: 0, fallback: false, elapsedMs: 0 };
  return { record, finish() {
    record.elapsedMs = Date.now() - started;
    agentDiagnostics.push(record);
    if (agentDiagnostics.length > 100) agentDiagnostics.shift();
    console.info("[agent/diagnostic]", JSON.stringify(record));
  } };
}
