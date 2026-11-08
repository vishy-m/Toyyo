import { afterEach, describe, expect, it, vi } from "vitest";
import { grokAgentProvider, grokMessages, grokProvider, grokTurn } from "../llm/grok";
import { getProvider, providerConfig } from "../llm";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Grok copilot with tools", () => {
  const tool = { name: "compute_lease_end_options", description: "Run the engine.", strict: true as const,
    input_schema: { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object" as const, properties: {} } };

  it("sends tools as functions over chat completions and returns the tool calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ finish_reason: "tool_calls", message: {
      content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: tool.name, arguments: "{\"overrides\":{}}" } }],
    } }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const turn = await grokAgentProvider("test-key", "grok-4.3").streamTurn({
      system: [{ type: "text", text: "Use only account data." }], messages: [{ role: "user", text: "What are my options?" }], tools: [tool],
    });
    expect(turn.finishReason).toBe("tool_use");
    expect(turn.calls).toEqual([{ id: "call_1", name: tool.name, input: { overrides: {} } }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.x.ai/v1/chat/completions");
    const request = JSON.parse(init.body as string);
    expect(request.model).toBe("grok-4.3");
    expect(request.messages[0]).toEqual({ role: "system", content: "Use only account data." });
    expect(request.tools[0]).toEqual({ type: "function", function: { name: tool.name, description: "Run the engine.", parameters: { type: "object", properties: {} } } });
  });

  it("returns tool results under the id of the call that asked for them", () => {
    const messages = grokMessages("sys", [
      { role: "user", text: "Options?" },
      { role: "assistant", nativeContent: { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "x", arguments: "{}" } }] } },
      { role: "tool", results: [{ id: "call_1", name: "x", value: { monthly: 412 }, isError: false }] },
    ]);
    expect(messages.at(-1)).toEqual({ role: "tool", tool_call_id: "call_1", content: "{\"monthly\":412}" });
  });

  it("ends the turn on a plain answer and maps limits and filters", () => {
    expect(grokTurn({ choices: [{ finish_reason: "stop", message: { content: "Four months left." } }] })).toMatchObject({ finishReason: "end_turn", text: "Four months left.", calls: [] });
    expect(grokTurn({ choices: [{ finish_reason: "length", message: { content: "Four" } }] }).finishReason).toBe("max_tokens");
    expect(grokTurn({ choices: [{ finish_reason: "content_filter", message: { content: "" } }] }).finishReason).toBe("refusal");
  });

  it("runs the copilot when XAI_API_KEY is set and no provider is named", () => {
    vi.stubEnv("AGENT_PROVIDER", ""); vi.stubEnv("AGENT_MODEL", undefined); vi.stubEnv("XAI_MODEL", ""); vi.stubEnv("XAI_API_KEY", "test-key");
    expect(providerConfig()).toEqual({ provider: "grok", model: "grok-4.3" });
    expect(getProvider()).not.toBeNull();
    vi.stubEnv("XAI_API_KEY", ""); vi.stubEnv("AGENT_PROVIDER", "grok");
    expect(getProvider()).toBeNull(); // named but unconfigured: calculated fallback, never a silent provider swap
  });
});

describe("Grok text-only fallback", () => {
  it("sends no tools, disables response storage, and returns a plain answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "completed", output: [
      { type: "message", content: [{ type: "output_text", text: "Your lease has four months left." }] },
    ] }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = await grokProvider("test-key").streamTurn({
      system: [{ type: "text", text: "Use only account data." }],
      messages: [{ role: "user", text: "When does my lease end?" }], tools: [{ name: "approve_lease", strict: true, input_schema: { type: "object" } }],
    });
    expect(result.finishReason).toBe("end_turn");
    expect(result.calls).toEqual([]);
    expect(result.text).toContain("four months");
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.store).toBe(false);
    expect(request.tools).toBeUndefined();
  });
  it("is available when Gemma has no key", () => {
    vi.stubEnv("AGENT_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_API", "");
    vi.stubEnv("XAI_API_KEY", "test-key");
    expect(getProvider()).not.toBeNull();
    vi.unstubAllEnvs();
  });
});
