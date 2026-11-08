import { setTimeout as delay } from "node:timers/promises";
import type { FinishReason, LlmMessage, LlmProvider, Turn, TurnInput } from "./types";

type ResponseBody = {
  status?: string;
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
};

function transcript(messages: LlmMessage[]) {
  return messages.map(message => {
    if (message.role === "user") return `User: ${message.text}`;
    if (message.role === "tool") return `Calculated tool results: ${JSON.stringify(message.results)}`;
    const text = "text" in message ? message.text : Array.isArray(message.nativeContent)
      ? message.nativeContent.map((part: { text?: string }) => part.text ?? "").join("") : "";
    return `Assistant: ${text}`;
  }).join("\n\n");
}

/** Text-only fallback: the lease workflow and all side effects stay in deterministic code. */
async function grokText(key: string, model: string, instructions: string, input: string, signal?: AbortSignal) {
  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, store: false, max_output_tokens: 1200,
      input: [{ role: "system", content: instructions }, { role: "user", content: input }] }),
    signal,
  });
  if (!response.ok) throw new Error(`Grok request failed (${response.status})`);
  const body = await response.json() as ResponseBody;
  if (body.status !== "completed") throw new Error("Grok response incomplete");
  const text = body.output?.filter(item => item.type === "message")
    .flatMap(item => item.content ?? []).filter(item => item.type === "output_text")
    .map(item => item.text ?? "").join("").trim();
  if (!text) throw new Error("Grok returned no answer");
  return text;
}

export function grokProvider(key: string, model = "grok-4.3"): LlmProvider {
  return {
    async streamTurn({ system, messages, signal }: TurnInput) {
      const text = await grokText(key, model,
        `${system.map(block => block.text).join("\n\n")}\n\nAnswer using only the supplied account data. You cannot execute tools or approve a lease. If a calculation is missing, say so.`,
        transcript(messages), signal);
      return { text, deltas: [text], calls: [], finishReason: "end_turn" as const,
        message: { role: "assistant" as const, nativeContent: [{ text }] } };
    },
    async generateJson(schema, { system, prompt, signal }) {
      const text = await grokText(key, model,
        `${system.map(block => block.text).join("\n\n")}\nReturn only valid JSON matching this schema: ${JSON.stringify(schema)}`,
        prompt, signal);
      JSON.parse(text);
      return text;
    },
  };
}

type ChatToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type AssistantMessage = { role: "assistant"; content: string | null; tool_calls?: ChatToolCall[] };
type ChatMessage = { role: "system" | "user"; content: string } | AssistantMessage | { role: "tool"; tool_call_id: string; content: string };
type ChatBody = { choices?: { finish_reason?: string; message?: { content?: string | null; tool_calls?: ChatToolCall[] } }[] };

const GROK_TURN_TIMEOUT_MS = 60_000;

/** Toyyo history and tool round-trips as xAI chat-completions messages. */
export function grokMessages(system: string, messages: LlmMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: system }];
  const callIds = new Set<string>();
  for (const message of messages) {
    if (message.role === "user") out.push({ role: "user", content: message.text });
    else if (message.role === "assistant") {
      if ("text" in message) { out.push({ role: "assistant", content: message.text }); continue; }
      const native = message.nativeContent as Partial<AssistantMessage> | undefined;
      const toolCalls = native?.tool_calls ?? [];
      toolCalls.forEach(call => callIds.add(call.id));
      out.push({ role: "assistant", content: native?.content ?? (toolCalls.length ? null : ""), ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
    } else if (message.results.every(result => callIds.has(result.id))) {
      for (const result of message.results) out.push({ role: "tool", tool_call_id: result.id, content: JSON.stringify(result.isError ? { error: result.value } : result.value) });
    } else out.push({ role: "user", content: `Calculated tool results: ${JSON.stringify(message.results)}` });
  }
  return out;
}

function toolInput(raw: string): unknown {
  // Unparseable arguments stay a string: the tool's schema rejects it and the model sees an error result.
  try { return JSON.parse(raw || "{}"); } catch { return raw; }
}

export function grokTurn(body: ChatBody): Turn {
  const choice = body.choices?.[0];
  const text = choice?.message?.content ?? "";
  const toolCalls = choice?.message?.tool_calls ?? [];
  const calls = toolCalls.map(call => ({ id: call.id, name: call.function.name, input: toolInput(call.function.arguments) }));
  const reason = choice?.finish_reason;
  const finishReason: FinishReason = reason === "content_filter" ? "refusal" : reason === "length" ? "max_tokens"
    : calls.length ? "tool_use" : reason === "stop" || reason === "end_turn" ? "end_turn" : "error";
  const message: AssistantMessage = { role: "assistant", content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) };
  return { text, deltas: text ? [text] : [], calls, finishReason, message: { role: "assistant", nativeContent: message } };
}

async function grokChat(key: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<ChatBody> {
  const timeout = AbortSignal.timeout(GROK_TURN_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  for (let attempt = 0; ; attempt++) {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: combined,
    });
    if (response.ok) return await response.json() as ChatBody;
    // One retry for rate limits and transient server errors; anything else (bad key, bad model) fails fast.
    if (attempt > 0 || ![429, 500, 502, 503].includes(response.status)) throw Object.assign(new Error(`Grok request failed (${response.status})`), { status: response.status });
    await delay(500, undefined, { signal: combined });
  }
}

/** Grok as the copilot: native tool calls into the same deterministic tools and grounding checks as Gemini. */
export function grokAgentProvider(key: string, model = "grok-4.3"): LlmProvider {
  return {
    async streamTurn({ system, messages, tools, signal }: TurnInput) {
      const functions = tools.map(tool => ({ type: "function", function: {
        name: tool.name, description: tool.description,
        parameters: Object.fromEntries(Object.entries(tool.input_schema).filter(([key]) => key !== "$schema")),
      } }));
      return grokTurn(await grokChat(key, {
        model, messages: grokMessages(system.map(block => block.text).join("\n\n"), messages),
        ...(functions.length ? { tools: functions, tool_choice: "auto" } : {}),
      }, signal));
    },
    // Structured JSON (recommendation copy) keeps the existing Responses API path.
    generateJson: (schema, prompt) => grokProvider(key, model).generateJson(schema, prompt),
  };
}
