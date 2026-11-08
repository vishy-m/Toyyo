import type Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam, BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { modelConfig } from "../client";
import type { FinishReason, LlmMessage, LlmProvider } from "./types";

function messagesForAnthropic(messages: LlmMessage[]): BetaMessageParam[] {
  return messages.map(message => {
    if (message.role === "user") return { role: "user", content: message.text };
    if (message.role === "assistant") return { role: "assistant", content: message.nativeContent as BetaContentBlockParam[] };
    return { role: "user", content: message.results.map(result => ({ type: "tool_result" as const, tool_use_id: result.id, content: JSON.stringify(result.value), is_error: result.isError })) };
  });
}
export function anthropicProvider(client: Anthropic): LlmProvider {
  return {
    async streamTurn({ system, messages, tools, signal }) {
      const deltas: string[] = [];
      const stream = client.beta.messages.stream({ ...modelConfig(), system, tools, messages: messagesForAnthropic(messages) }, { signal });
      stream.on("text", delta => deltas.push(delta));
      const response = await stream.finalMessage();
      const reason = response.stop_reason;
      const finishReason: FinishReason = reason === "stop_sequence" ? "end_turn" : reason === "model_context_window_exceeded" ? "max_tokens"
        : reason && ["end_turn", "tool_use", "refusal", "max_tokens", "pause_turn"].includes(reason) ? reason as FinishReason : "error";
      return {
        text: response.content.filter(block => block.type === "text").map(block => block.text).join(""), deltas,
        calls: response.content.filter(block => block.type === "tool_use").map(block => ({ id: block.id, name: block.name, input: block.input })),
        finishReason, message: { role: "assistant", nativeContent: response.content },
      };
    },
    async generateJson(schema, { system, prompt, signal }) {
      const config = modelConfig();
      const stream = client.beta.messages.stream({
        ...config, system, output_config: { ...config.output_config, format: { type: "json_schema", schema } },
        messages: [{ role: "user", content: prompt }],
      }, { signal });
      const response = await stream.finalMessage();
      if (response.stop_reason !== "end_turn") throw new Error("Incomplete structured response");
      return response.content.filter(block => block.type === "text").map(block => block.text).join("");
    },
  };
}
