import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinishReason, GenerateContentResponse, Type, type Part } from "@google/genai";
import { z } from "zod";
const mock = vi.hoisted(() => ({ stream: vi.fn(), json: vi.fn() }));
vi.mock("@google/genai", async importOriginal => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  return { ...actual, GoogleGenAI: class { models = { generateContentStream: mock.stream, generateContent: mock.json }; } };
});
import { geminiSchema } from "../llm/schema";
import { estimateTokens, GEMMA_OUTPUT_TOKENS, GEMMA_RPD, GEMMA_RPM, GEMMA_TPM, geminiMessages, geminiProvider, geminiTurn, gemmaWaitMs } from "../llm/gemini";
import { getProvider, providerConfig } from "../llm";
import { systemPrompt } from "../prompt";
import { agentTools } from "../tools";
import { runAgent } from "../loop";
import { agentDiagnostics } from "../diagnostics";
import { getInitialPanel, topOptions, warmInitialPanels } from "../recommendations";
import { getDashboard } from "../../server/dashboard";
import { resetPersona, runtimeStore } from "../../server/store";
import type { AgentStreamEvent } from "../../types";

function chunk(parts: Part[], finishReason?: FinishReason) {
  return Object.assign(new GenerateContentResponse(), { candidates: [{ content: { role: "model", parts }, finishReason }] });
}
function reply(...chunks: GenerateContentResponse[]) { return (async function* () { yield* chunks; })(); }
function call(name: string, args: Record<string, unknown>, id = "test-call"): Part { return { functionCall: { name, args, id } }; }
async function run(message = "What if I drive 900 miles a month?") {
  const events: AgentStreamEvent[] = [];
  await runAgent({ personaId: "maya", message }, event => events.push(event));
  return events;
}
const input = { system: [{ type: "text" as const, text: "Rules" }], messages: [{ role: "user" as const, text: "Hello" }], tools: agentTools };
beforeEach(() => {
  vi.stubEnv("AGENT_PROVIDER", "gemini");
  vi.stubEnv("AGENT_MODEL", undefined);
  vi.stubEnv("GEMINI_API_KEY", "fake-key-for-mocked-client");
  mock.stream.mockReset(); mock.json.mockReset();
  for (const id of ["maya", "garcia", "jordan", "raj"] as const) resetPersona(id);
  runtimeStore.warmingSource = undefined;
  agentDiagnostics.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("Gemini schemas and configuration", () => {
  it("converts all 15 schemas, nested bounds, enums, literals and nullable fields without unsupported keys", () => {
    expect(agentTools).toHaveLength(16);
    for (const tool of agentTools) {
      const converted = geminiSchema(tool.input_schema);
      expect(converted.type).toBe(Type.OBJECT);
      expect(JSON.stringify(converted)).not.toMatch(/additionalProperties|\$schema/);
    }
    const result = geminiSchema(z.toJSONSchema(z.strictObject({
      name: z.string().min(1).max(10), source: z.literal("explicit"), choice: z.enum(["a", "b"]),
      note: z.string().nullable(), rows: z.array(z.strictObject({ value: z.number().min(0).max(100) })).min(1),
    })));
    expect(result.properties?.note).toEqual({ type: Type.STRING, nullable: true });
    expect(result.properties?.source?.enum).toEqual(["explicit"]);
    expect(result.properties?.choice?.enum).toEqual(["a", "b"]);
    expect(result.properties?.name).toMatchObject({ minLength: "1", maxLength: "10" });
    expect(result.properties?.rows).toMatchObject({ minItems: "1", items: { properties: { value: { minimum: 0, maximum: 100 } } } });
    expect(result.required).toEqual(["name", "source", "choice", "note", "rows"]);
    expect(() => geminiSchema({ $ref: "#/$defs/unknown" })).toThrow();
  });
  it("defaults to Gemma 4, supports the nonstandard key and model override", () => {
    vi.stubEnv("AGENT_PROVIDER", undefined);
    vi.stubEnv("GEMINI_API_KEY", undefined);
    vi.stubEnv("GEMINI_API", "fake-fallback-key");
    expect(providerConfig()).toEqual({ provider: "gemini", model: "gemma-4-31b-it" });
    expect(getProvider()).not.toBeNull();
    vi.stubEnv("AGENT_MODEL", "gemini-3.1-pro-preview");
    expect(providerConfig().model).toBe("gemini-3.1-pro-preview");
    vi.stubEnv("GEMINI_API", "");
    expect(getProvider()).toBeNull();
  });
});

describe("Gemini streaming and tool loop", () => {
  it("maps text deltas, hides thoughts and preserves signatures and parallel function calls", async () => {
    const parts: Part[] = [{ text: "private thought", thought: true }, { ...call("get_customer_snapshot", {}, "one"), thoughtSignature: "opaque-signature" }, call("get_driving_summary", {}, "two")];
    mock.stream.mockResolvedValue(reply(chunk([{ text: "Hello " }]), chunk(parts), chunk([{ text: "there." }], FinishReason.STOP)));
    const turn = await getProvider()!.streamTurn(input);
    expect(turn).toMatchObject({ deltas: ["Hello ", "there."], text: "Hello there.", finishReason: "tool_use", calls: [{ id: "one" }, { id: "two" }] });
    const messages = geminiMessages([turn.message, { role: "tool", results: turn.calls.map((tool, index) => ({ ...tool, value: index ? { error: "Denied" } : { score: 83 }, isError: !!index })) }]);
    expect(messages[0].parts).toContainEqual(parts[1]);
    expect(messages[1].parts).toHaveLength(2);
    expect(messages[1].parts?.[1].functionResponse).toMatchObject({ id: "two", name: "get_driving_summary", response: { error: { error: "Denied" } } });
    expect(mock.stream.mock.calls[0][0].config.tools[0].functionDeclarations).toHaveLength(16);
    expect(mock.stream.mock.calls[0][0]).toMatchObject({ model: "gemma-4-31b-it", config: { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: "MINIMAL" } } });
    expect(GEMMA_OUTPUT_TOKENS).toBe(1024);
  });
  it("returns all tool results together, validates inputs and keeps the SSE contract", async () => {
    mock.stream.mockResolvedValueOnce(reply(chunk([
      call("set_whatif", { control: "monthlyMiles", value: 900 }, "slider"),
      call("compute_lease_end_options", { overrides: { monthlyMiles: 900 } }, "compute"),
      call("open_move", { moveType: "lease-end" }, "open"),
      call("set_whatif", { control: "paymentDueDay", value: 99 }, "invalid"),
    ], FinishReason.STOP))).mockResolvedValueOnce(reply(chunk([{ text: "Compare these calculated options with a TFS specialist." }], FinishReason.STOP)));
    const events = await run();
    expect(events).toContainEqual({ type: "ui_action", action: { kind: "set_whatif", control: "monthlyMiles", value: 900 } });
    expect(events.filter(event => event.type === "tool")).toHaveLength(8);
    expect(events.filter(event => event.type === "done")).toHaveLength(1);
    expect(events.some(event => event.type === "error")).toBe(false);
    const results = mock.stream.mock.calls[1][0].contents.at(-1).parts;
    expect(results).toHaveLength(4);
    expect(results[3].functionResponse.response.error.error).toMatch(/Invalid tool input/);
  });
  it.each([FinishReason.SAFETY, FinishReason.BLOCKLIST, FinishReason.PROHIBITED_CONTENT, FinishReason.SPII, FinishReason.RECITATION])("never emits text or executes tools for blocked finish %s", async reason => {
    mock.stream.mockResolvedValue(reply(chunk([{ text: "Do not publish" }, call("set_whatif", { control: "monthlyMiles", value: 900 })], reason)));
    expect((await run()).map(event => event.type)).toEqual(["error", "done"]);
  });
  it("maps prompt blocking, token limits, missing and malformed finish reasons", () => {
    const blocked = Object.assign(new GenerateContentResponse(), { promptFeedback: { blockReason: "SAFETY" } });
    expect(geminiTurn([blocked]).finishReason).toBe("refusal");
    expect(geminiTurn([chunk([], FinishReason.MAX_TOKENS)]).finishReason).toBe("max_tokens");
    expect(geminiTurn([chunk([])]).finishReason).toBe("error");
    expect(geminiTurn([chunk([], FinishReason.MALFORMED_FUNCTION_CALL)]).finishReason).toBe("error");
  });
  it("buffers ungrounded text and retries once with the unchanged corrective prompt", async () => {
    mock.stream.mockResolvedValueOnce(reply(chunk([{ text: "Save $999,999." }], FinishReason.STOP)))
      .mockResolvedValueOnce(reply(chunk([{ text: "Review your options with a specialist." }], FinishReason.STOP)));
    const events = await run("Explain my options");
    expect(events.filter(event => event.type === "text").map(event => event.delta).join("")).toBe("Review your options with a specialist.");
    expect(mock.stream.mock.calls[1][0].config.systemInstruction).toContain("Unsupported numbers: $999,999");
    expect(agentDiagnostics.at(-1)).toMatchObject({ groundingRetries: 1, fallback: false });
  });
  it("caps repeated tool turns at eight", async () => {
    mock.stream.mockImplementation(() => Promise.resolve(reply(chunk([call("get_customer_snapshot", {})], FinishReason.STOP))));
    const events = await run("Explain my options");
    expect(mock.stream).toHaveBeenCalledTimes(8);
    expect(events.at(-2)).toMatchObject({ type: "error", message: expect.stringContaining("tool-step limit") });
    expect(events.at(-1)).toEqual({ type: "done" });
  });
  it("retries a failed partial stream without leaking or duplicating its tool actions", async () => {
    mock.stream.mockResolvedValueOnce((async function* () {
      yield chunk([call("set_whatif", { control: "monthlyMiles", value: 999 })]);
      throw Object.assign(new Error("Busy"), { status: 503 });
    })()).mockResolvedValueOnce(reply(chunk([{ text: "Ask a TFS specialist." }], FinishReason.STOP)));
    const events = await run();
    expect(mock.stream).toHaveBeenCalledTimes(2);
    expect(events.map(event => event.type)).toEqual(["text", "done"]);
  });
  it.each([429, 503])("retries HTTP %s once then uses the offline intent router", async status => {
    mock.stream.mockRejectedValue(Object.assign(new Error("Busy"), { status }));
    const events = await run();
    expect(mock.stream).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual({ type: "ui_action", action: { kind: "set_whatif", control: "monthlyMiles", value: 900 } });
    expect(events.filter(event => event.type === "done")).toHaveLength(1);
    expect(agentDiagnostics.at(-1)?.fallback).toBe(true);
  });
});

describe("Gemini initial structured copy and cache", () => {
  function copyForMaya() {
    return { recommendations: topOptions(getDashboard("maya")).map(option => ({ optionId: option.id, title: option.title, action: "Review with a TFS specialist.", why: option.summary, impactLabel: "Ignore this chip", urgencyLabel: null })) };
  }
  it("validates structured copy, grounds engine numbers, deduplicates and invalidates after model changes", async () => {
    mock.json.mockImplementation(async () => chunk([{ text: JSON.stringify(copyForMaya()) }], FinishReason.STOP));
    const [first, second] = await Promise.all([getInitialPanel("maya"), getInitialPanel("maya")]);
    expect(first).toEqual(second);
    expect(first.recommendations.every(rec => rec.grounded && rec.impactLabel !== "Ignore this chip")).toBe(true);
    expect(mock.json).toHaveBeenCalledTimes(1);
    expect(mock.json.mock.calls[0][0].config).toMatchObject({ responseMimeType: "application/json", responseSchema: { type: Type.OBJECT } });
    vi.stubEnv("AGENT_MODEL", "gemini-3.1-pro-preview");
    await getInitialPanel("maya");
    expect(mock.json).toHaveBeenCalledTimes(2);
  });
  it("rejects malformed structured output and uses templates", async () => {
    mock.json.mockResolvedValue(chunk([{ text: '{"recommendations":[]}' }], FinishReason.STOP));
    expect((await getInitialPanel("maya")).recommendations.every(rec => !rec.grounded)).toBe(true);
  });
  it("regenerates ungrounded structured copy once before using templates", async () => {
    const bad = copyForMaya();
    bad.recommendations[0].why = "Save $999,999.";
    mock.json.mockResolvedValue(chunk([{ text: JSON.stringify(bad) }], FinishReason.STOP));
    const panel = await getInitialPanel("maya");
    expect(mock.json).toHaveBeenCalledTimes(2);
    expect(mock.json.mock.calls[1][0].config.systemInstruction).toContain("Your previous draft contained ungrounded numbers");
    expect(panel.recommendations[0].grounded).toBe(false);
    expect(panel.recommendations[0].why).not.toContain("999,999");
    expect(agentDiagnostics.at(-1)).toMatchObject({ groundingRetries: 1, fallback: true });
  });
  it("rejects blocked structured text even when it contains valid JSON", async () => {
    mock.json.mockResolvedValue(chunk([{ text: JSON.stringify(copyForMaya()) }], FinishReason.SAFETY));
    expect((await getInitialPanel("maya")).recommendations.every(rec => !rec.grounded)).toBe(true);
    expect(mock.json).toHaveBeenCalledTimes(1);
  });
  it("retries one structured HTTP 500 and keeps the grounded copy", async () => {
    mock.json.mockRejectedValueOnce(Object.assign(new Error("Internal"), { status: 500 }))
      .mockResolvedValueOnce(chunk([{ text: JSON.stringify(copyForMaya()) }], FinishReason.STOP));
    const panel = await getInitialPanel("maya");
    expect(mock.json).toHaveBeenCalledTimes(2);
    expect(panel.recommendations.every(rec => rec.grounded)).toBe(true);
  });
  it("tries a Gemma 503 again on the next view", async () => {
    mock.json.mockRejectedValue(Object.assign(new Error("Busy"), { status: 503 }));
    const first = await getInitialPanel("maya");
    expect(first.recommendations.every(rec => !rec.grounded)).toBe(true);
    await getInitialPanel("maya");
    expect(mock.json).toHaveBeenCalledTimes(4);
  });
  it("retries structured rate limits once and caches the offline result", async () => {
    mock.json.mockRejectedValue(Object.assign(new Error("Busy"), { status: 429 }));
    const first = await getInitialPanel("maya");
    expect(first.recommendations.every(rec => !rec.grounded)).toBe(true);
    expect(await getInitialPanel("maya")).toEqual(first);
    expect(mock.json).toHaveBeenCalledTimes(2);
  });
  it("does not prebuild Gemma panels, and warms the eleven Gemini panels once per model", async () => {
    runtimeStore.warming = true;
    mock.json.mockRejectedValue(new Error("Offline"));
    await Promise.all([warmInitialPanels(), warmInitialPanels()]);
    expect(mock.json).not.toHaveBeenCalled();
    vi.stubEnv("AGENT_MODEL", "gemini-3.1-pro-preview");
    await Promise.all([warmInitialPanels(), warmInitialPanels()]);
    expect(mock.json).toHaveBeenCalledTimes(11);
    await warmInitialPanels();
    expect(mock.json).toHaveBeenCalledTimes(11);
  });
  it("keeps a Gemma tool round-trip inside the 16K token minute", () => {
    const tools = JSON.stringify(agentTools.map(tool => tool.input_schema));
    for (const id of ["maya", "devon", "ryan", "priya"] as const) {
      const system = systemPrompt(getDashboard(id)).map(block => block.text).join("\n\n");
      expect(system).not.toMatch(/"engines":/);
      const call = estimateTokens(system) + estimateTokens(tools) + GEMMA_OUTPUT_TOKENS;
      expect(call * 2).toBeLessThanOrEqual(GEMMA_TPM);
    }
  });
  it("waits out the Gemma minute and refuses a request that cannot fit", () => {
    expect(gemmaWaitMs(1_000_000, [], 1_000)).toBe(0);
    expect(gemmaWaitMs(1_000_000, [{ at: 990_000, tokens: GEMMA_TPM - 100 }], 200)).toBe(50_000);
    expect(gemmaWaitMs(1_000_000, [], GEMMA_TPM + 1)).toBe(-1);
    expect(gemmaWaitMs(1_000_000, Array.from({ length: GEMMA_RPM }, (_, index) => ({ at: 1_000_000 - index, tokens: 1 })), 10)).toBeGreaterThan(0);
    expect(gemmaWaitMs(1_000_000, Array.from({ length: GEMMA_RPD }, () => ({ at: 1_000_000, tokens: 1 })), 10)).toBe(-1);
  });
  it("passes cancellation into the SDK without retrying a cancelled operation", async () => {
    const abort = new AbortController(); abort.abort();
    mock.stream.mockRejectedValue(Object.assign(new Error("Cancelled"), { status: 503 }));
    await expect(geminiProvider("fake", "test").streamTurn({ ...input, signal: abort.signal })).rejects.toThrow("Cancelled");
    expect(mock.stream).toHaveBeenCalledTimes(1);
    expect(mock.stream.mock.calls[0][0].config.abortSignal).toBe(abort.signal);
  });
});
