import { getClient } from "../client";
import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import type { LlmProvider } from "./types";

export function providerConfig() {
  const provider = process.env.AGENT_PROVIDER ?? "gemini";
  return { provider, model: process.env.AGENT_MODEL ?? (provider === "anthropic" ? "claude-opus-5-5" : "gemma-4-31b-it") };
}
export function getProvider(): LlmProvider | null {
  const { provider, model } = providerConfig();
  if (provider === "anthropic") {
    const client = getClient();
    return client ? anthropicProvider(client) : null;
  }
  if (provider !== "gemini") throw new Error("Unknown AGENT_PROVIDER");
  const key = process.env.GEMINI_API_KEY ?? process.env.GEMINI_API;
  return key ? geminiProvider(key, model) : null;
}
