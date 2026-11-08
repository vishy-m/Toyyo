import { getClient } from "../client";
import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import { grokAgentProvider, grokProvider } from "./grok";
import type { LlmProvider } from "./types";

/** AGENT_PROVIDER picks the copilot's model. Unset, Grok runs it when XAI_API_KEY is set, otherwise Gemini. */
export function providerConfig() {
  const provider = process.env.AGENT_PROVIDER?.trim() || (process.env.XAI_API_KEY?.trim() ? "grok" : "gemini");
  const model = process.env.AGENT_MODEL ?? (provider === "anthropic" ? "claude-opus-5-5"
    : provider === "grok" ? process.env.XAI_MODEL?.trim() || "grok-4.3" : "gemma-4-31b-it");
  return { provider, model };
}
export function getProvider(): LlmProvider | null {
  const { provider, model } = providerConfig();
  const grokKey = process.env.XAI_API_KEY?.trim();
  if (provider === "grok") {
    if (grokKey) return grokAgentProvider(grokKey, model);
    console.warn("[agent] AGENT_PROVIDER=grok needs XAI_API_KEY; answering with calculated fallback guidance.");
    return null;
  }
  const fallback = grokKey ? grokProvider(grokKey, process.env.XAI_MODEL || "grok-4.3") : null;
  if (provider === "anthropic") {
    const client = getClient();
    return client ? anthropicProvider(client) : null;
  }
  if (provider !== "gemini") throw new Error("Unknown AGENT_PROVIDER");
  const key = process.env.GEMINI_API_KEY?.trim() || process.env.GEMINI_API?.trim();
  if (!key) return fallback;
  const primary = geminiProvider(key, model);
  if (!fallback) return primary;
  return {
    streamTurn: input => primary.streamTurn(input).catch(() => fallback.streamTurn(input)),
    generateJson: (schema, input) => primary.generateJson(schema, input).catch(() => fallback.generateJson(schema, input)),
  };
}
