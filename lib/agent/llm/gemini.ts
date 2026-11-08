import { GoogleGenAI, ThinkingLevel, type Content, type GenerateContentResponse, type Part } from "@google/genai";
import { setTimeout as delay } from "node:timers/promises";
import { geminiSchema } from "./schema";
import type { FinishReason, LlmMessage, LlmProvider, Turn } from "./types";

export type GeminiClient = Pick<GoogleGenAI, "models">;
const blockedReasons = new Set(["SAFETY", "RECITATION", "LANGUAGE", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "IMAGE_RECITATION"]);
export function geminiMessages(messages: LlmMessage[]): Content[] {
  return messages.map(message => {
    if (message.role === "user") return { role: "user", parts: [{ text: message.text }] };
    // Preserve every native part, including opaque thought signatures required by Gemini.
    if (message.role === "assistant") return { role: "model", parts: message.nativeContent as Part[] };
    return { role: "user", parts: message.results.map(result => ({ functionResponse: {
      id: result.id, name: result.name, response: { [result.isError ? "error" : "output"]: result.value },
    } })) };
  });
}
export function geminiTurn(chunks: GenerateContentResponse[]): Turn {
  const parts: Part[] = [];
  const deltas: string[] = [];
  let reason: string | undefined;
  let blocked = false;
  for (const chunk of chunks) {
    if (chunk.promptFeedback?.blockReason) blocked = true;
    const candidate = chunk.candidates?.[0];
    if (candidate?.finishReason) {
      reason = candidate.finishReason;
      if (blockedReasons.has(reason)) blocked = true;
    }
    for (const part of candidate?.content?.parts ?? []) {
      parts.push(part);
      if (part.text && !part.thought) deltas.push(part.text);
    }
  }
  const calls = parts.flatMap((part, index) => part.functionCall ? [{ id: part.functionCall.id ?? `call-${index}`, name: part.functionCall.name ?? "", input: part.functionCall.args ?? {} }] : []);
  const finishReason: FinishReason = blocked ? "refusal" : reason === "MAX_TOKENS" ? "max_tokens"
    : reason === "STOP" ? calls.length ? "tool_use" : "end_turn" : "error";
  return { text: deltas.join(""), deltas, calls, finishReason, message: { role: "assistant", nativeContent: parts } };
}
async function retryOnce<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try { return await operation(); }
  catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
    // Gemma answers the same request with an immediate 500 often enough that one retry is worth it.
    if (signal?.aborted || ![429, 500, 503].includes(status)) throw error;
    await delay(400, undefined, { signal });
    return operation();
  }
}
/** Gemma 4 31B and 26B on this key: 30 RPM, 16K TPM, 14.4K RPD. Output stays small so one tool round-trip fits. */
export const GEMMA_TPM = 16_000;
export const GEMMA_RPM = 30;
export const GEMMA_RPD = 14_400;
export const GEMMA_OUTPUT_TOKENS = 1024;
const minuteMs = 60_000;
const dayMs = 86_400_000;
type Charge = { at: number; tokens: number };
const charges: Charge[] = [];
let queue: Promise<void> = Promise.resolve();

export function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}
/** Milliseconds to wait before spending `estimate` tokens. -1 means the request can never fit. */
export function gemmaWaitMs(now: number, history: Charge[], estimate: number) {
  if (estimate > GEMMA_TPM) return -1;
  const recent = history.filter(item => now - item.at < minuteMs);
  const today = history.filter(item => now - item.at < dayMs);
  if (today.length >= GEMMA_RPD) return -1;
  const used = recent.reduce((sum, item) => sum + item.tokens, 0);
  if (used + estimate <= GEMMA_TPM && recent.length < GEMMA_RPM) return 0;
  if (!recent.length) return 0;
  const oldest = recent.reduce((min, item) => Math.min(min, item.at), now);
  return Math.max(250, oldest + minuteMs - now);
}
function pruneCharges(now: number) {
  const cutoff = now - dayMs;
  while (charges.length && charges[0].at < cutoff) charges.shift();
}
function enqueue(estimate: number, signal?: AbortSignal) {
  const job = queue.then(async () => {
    for (;;) {
      if (signal?.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
      const now = Date.now();
      pruneCharges(now);
      const wait = gemmaWaitMs(now, charges, estimate);
      if (wait < 0) throw Object.assign(new Error("Gemma request exceeds the 16K token quota"), { name: "GemmaQuotaError" });
      if (wait === 0) {
        const charge: Charge = { at: now, tokens: estimate };
        charges.push(charge);
        return charge;
      }
      await delay(wait, undefined, { signal });
    }
  });
  queue = job.then(() => undefined, () => undefined);
  return job;
}
function billedTokens(chunks: GenerateContentResponse[]) {
  let total = 0;
  for (const chunk of chunks) {
    const count = chunk.usageMetadata?.totalTokenCount;
    if (typeof count === "number") total = Math.max(total, count);
  }
  return total;
}
async function paceGemma(model: string, estimate: number, signal: AbortSignal | undefined, run: () => Promise<GenerateContentResponse[]>) {
  // Vitest drives multi-step loops with no usage metadata, so the reserved estimate would fill the minute.
  if (!model.startsWith("gemma-") || process.env.VITEST === "true") return run();
  const charge = await enqueue(estimate, signal);
  const chunks = await run();
  const actual = billedTokens(chunks);
  if (actual > 0) charge.tokens = actual;
  return chunks;
}
function outputConfig(model: string) {
  return model.startsWith("gemma-")
    ? { maxOutputTokens: GEMMA_OUTPUT_TOKENS, thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } }
    : { maxOutputTokens: 16000 };
}
function gemmaEstimate(model: string, parts: string[]) {
  if (!model.startsWith("gemma-")) return 0;
  return parts.reduce((sum, part) => sum + estimateTokens(part), 0) + GEMMA_OUTPUT_TOKENS;
}

export function geminiProvider(apiKey: string, model: string, client: GeminiClient = new GoogleGenAI({ apiKey, httpOptions: { timeout: 45000, retryOptions: { attempts: 1 } } })): LlmProvider {
  return {
    streamTurn: ({ system, messages, tools, signal }) => retryOnce(async () => {
      const systemInstruction = system.map(block => block.text).join("\n\n");
      const declarations = tools.map(tool => ({ name: tool.name, description: tool.description, parameters: geminiSchema(tool.input_schema) }));
      const chunks = await paceGemma(model, gemmaEstimate(model, [systemInstruction, JSON.stringify(messages), JSON.stringify(declarations)]), signal, async () => {
        const stream = await client.models.generateContentStream({
          model, contents: geminiMessages(messages), config: {
            systemInstruction, abortSignal: signal,
            ...outputConfig(model), automaticFunctionCalling: { disable: true },
            tools: [{ functionDeclarations: declarations }],
          },
        });
        const received: GenerateContentResponse[] = [];
        for await (const chunk of stream) received.push(chunk);
        // A failed stream throws before paceGemma records a smaller actual, so the estimate stays reserved.
        return received;
      });
      return geminiTurn(chunks);
    }, signal),
    generateJson: (schema, { system, prompt, signal }) => retryOnce(async () => {
      const systemInstruction = system.map(block => block.text).join("\n\n");
      const responseSchema = geminiSchema(schema);
      const chunks = await paceGemma(model, gemmaEstimate(model, [systemInstruction, prompt, JSON.stringify(responseSchema)]), signal, async () => {
        const response = await client.models.generateContent({ model, contents: prompt, config: {
          systemInstruction, abortSignal: signal,
          ...outputConfig(model), responseMimeType: "application/json", responseSchema,
        } });
        return [response];
      });
      const turn = geminiTurn(chunks);
      if (turn.finishReason !== "end_turn") throw new Error("Incomplete structured response");
      return turn.text;
    }, signal),
  };
}
