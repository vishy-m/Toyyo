export interface SystemBlock { type: "text"; text: string; cache_control?: { type: "ephemeral" } }
export interface ToolDefinition {
  name: string;
  description?: string;
  strict: true;
  input_schema: { type: "object"; [key: string]: unknown };
}
export interface ToolCall { id: string; name: string; input: unknown }
export interface ToolResult { id: string; name: string; value: unknown; isError: boolean }
export type LlmMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; nativeContent: unknown }
  | { role: "tool"; results: ToolResult[] };
export type FinishReason = "end_turn" | "tool_use" | "refusal" | "max_tokens" | "pause_turn" | "error";
export interface Turn {
  text: string;
  deltas: string[];
  calls: ToolCall[];
  finishReason: FinishReason;
  message: Extract<LlmMessage, { role: "assistant" }>;
}
export interface TurnInput { system: SystemBlock[]; messages: LlmMessage[]; tools: ToolDefinition[]; signal?: AbortSignal }
export interface JsonPrompt { system: SystemBlock[]; prompt: string; signal?: AbortSignal }
export interface LlmProvider {
  // Retain deltas inside the turn until the caller has checked safety and grounding.
  streamTurn(input: TurnInput): Promise<Turn>;
  generateJson(schema: Record<string, unknown>, prompt: JsonPrompt): Promise<string>;
}
