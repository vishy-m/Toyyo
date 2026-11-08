import { GoogleGenAI, type Content, type GenerateContentResponse, type Part } from "@google/genai";
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
    if (signal?.aborted || ![429, 503].includes(status)) throw error;
    await delay(400, undefined, { signal });
    return operation();
  }
}
export function geminiProvider(apiKey: string, model: string, client: GeminiClient = new GoogleGenAI({ apiKey, httpOptions: { timeout: 45000, retryOptions: { attempts: 1 } } })): LlmProvider {
  return {
    streamTurn: ({ system, messages, tools, signal }) => retryOnce(async () => {
      const stream = await client.models.generateContentStream({
        model, contents: geminiMessages(messages), config: {
          systemInstruction: system.map(block => block.text).join("\n\n"), abortSignal: signal,
          maxOutputTokens: 16000, automaticFunctionCalling: { disable: true },
          tools: [{ functionDeclarations: tools.map(tool => ({ name: tool.name, description: tool.description, parameters: geminiSchema(tool.input_schema) })) }],
        },
      });
      const chunks: GenerateContentResponse[] = [];
      for await (const chunk of stream) chunks.push(chunk);
      // A failed stream is discarded before retry, so no partial text/tools escape.
      return geminiTurn(chunks);
    }, signal),
    generateJson: (schema, { system, prompt, signal }) => retryOnce(async () => {
      const response = await client.models.generateContent({ model, contents: prompt, config: {
        systemInstruction: system.map(block => block.text).join("\n\n"), abortSignal: signal,
        maxOutputTokens: 16000, responseMimeType: "application/json", responseSchema: geminiSchema(schema),
      } });
      const turn = geminiTurn([response]);
      if (turn.finishReason !== "end_turn") throw new Error("Incomplete structured response");
      return turn.text;
    }, signal),
  };
}
