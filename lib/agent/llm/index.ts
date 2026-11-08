import { getClient } from "../client";
import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import { grokProvider } from "./grok";
import type { LlmProvider } from "./types";

export function providerConfig() {
  const provider = process.env.AGENT_PROVIDER ?? "gemini";
  return { provider, model: process.env.AGENT_MODEL ?? (provider === "anthropic" ? "claude-opus-5-5" : "gemma-4-31b-it") };
}
export function getProvider(): LlmProvider | null {
  const { provider, model } = providerConfig();
  const grokKey = process.env.XAI_API_KEY?.trim();
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
