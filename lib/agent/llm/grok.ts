import type { LlmMessage, LlmProvider, TurnInput } from "./types";

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
