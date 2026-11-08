import Anthropic from "@anthropic-ai/sdk";
import type { BetaOutputConfig } from "@anthropic-ai/sdk/resources/beta/messages/messages";

export function getClient() {
  return process.env.ANTHROPIC_API_KEY ? new Anthropic({ maxRetries: 1, timeout: 45000 }) : null;
}
export function modelConfig() {
  const requested = process.env.AGENT_EFFORT ?? "low";
  const effort: BetaOutputConfig["effort"] = ["low", "medium", "high", "xhigh", "max"].includes(requested) ? requested as BetaOutputConfig["effort"] : "low";
  return {
    model: process.env.AGENT_MODEL ?? "claude-opus-5-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" as const },
    output_config: { effort },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const,
  };
}
export function friendlyError(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    if (error.status === 429) return "The live assistant is busy. Your calculated options are still available.";
    return "The live assistant is temporarily unavailable. Your calculated options are still available.";
  }
  if (error instanceof Anthropic.RateLimitError) return "The live assistant is busy. Your calculated options are still available.";
  if (error instanceof Anthropic.APIError) return "The live assistant is temporarily unavailable. Your calculated options are still available.";
  return "The live assistant could not finish. Your calculated options are still available.";
}
