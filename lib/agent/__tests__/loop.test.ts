import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStreamEvent } from "../../types";
const model = vi.hoisted(() => ({ stream: vi.fn(), enabled: true, replies: [] as { stop_reason: string; content: Record<string, unknown>[] }[] }));
vi.mock("../client", () => ({
  getClient: () => model.enabled ? { beta: { messages: { stream: model.stream } } } : null,
  modelConfig: () => ({ model: "claude-opus-5-5", thinking: { type: "adaptive" }, output_config: { effort: "low" }, fallbacks: "default" }),
  friendlyError: () => "Live assistant unavailable.",
}));
vi.mock("../../engines", async () => {
  const { getPersona } = await import("../../data");
  const { fakeDashboard } = await import("../../server/__tests__/fixtures");
  return {
    buildDashboard: (id: Parameters<typeof getPersona>[0], runtime: Parameters<typeof fakeDashboard>[1]) => fakeDashboard(id, runtime, getPersona(id)),
    runWhatIf: (id: Parameters<typeof getPersona>[0], type: keyof ReturnType<typeof fakeDashboard>["engines"], _overrides: unknown, runtime: Parameters<typeof fakeDashboard>[1]) => fakeDashboard(id, runtime, getPersona(id)).engines[type],
  };
});
import { runAgent } from "../loop";
import { agentTools, executeTool } from "../tools";
import { getInitialPanel, optionImpactLabel } from "../recommendations";
import { option as engineOption } from "../../server/__tests__/fixtures";
import { getState, resetPersona } from "../../server/store";
import { getDashboard } from "../../server/dashboard";

function textReply(text: string, stop_reason = "end_turn") { return { stop_reason, content: [{ type: "text", text }] }; }
function toolReply(...tools: { name: string; input: unknown }[]) { return { stop_reason: "tool_use", content: tools.map((tool, index) => ({ type: "tool_use", id: `tool-${index}`, ...tool })) }; }
async function run(message = "Explain my options") {
  const events: AgentStreamEvent[] = [];
  await runAgent({ personaId: "maya", message }, event => events.push(event));
  return events;
}
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.stubEnv("AGENT_PROVIDER", "anthropic");
  resetPersona("maya");
  model.enabled = true;
  model.replies = [];
  model.stream.mockReset().mockImplementation(() => {
    const reply = model.replies.shift();
    if (!reply) throw new Error("No mock response");
    return { on: (_event: string, callback: (text: string) => void) => { for (const block of reply.content) if (block.type === "text") callback(String(block.text)); }, finalMessage: async () => reply };
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
describe("manual agent loop", () => {
  it("returns every tool result in a single message, including failures", async () => {
    model.replies.push(toolReply({ name: "get_customer_snapshot", input: {} }, { name: "unknown_tool", input: {} }), textReply("A TFS specialist can help."));
    const events = await run();
    const messages = model.stream.mock.calls[1][0].messages;
    expect(messages[2].role).toBe("user");
    expect(messages[2].content).toHaveLength(2);
    expect(messages[2].content[1].is_error).toBe(true);
    expect(events.filter(event => event.type === "done")).toHaveLength(1);
    expect(events.filter(event => event.type === "tool")).toHaveLength(4);
  });
  it("never executes a tool or emits refused content from a refused turn", async () => {
    model.replies.push({ ...toolReply({ name: "set_whatif", input: { control: "monthlyMiles", value: 900 } }), stop_reason: "refusal" });
    const events = await run();
    expect(events.map(event => event.type)).toEqual(["error", "done"]);
  });
  it("regenerates unsupported numbers once, then emits only engine template guidance", async () => {
    model.replies.push(textReply("Save $999,999."), textReply("Save $888,888."));
    const events = await run();
    expect(model.stream).toHaveBeenCalledTimes(2);
    const text = events.filter(event => event.type === "text").map(event => event.delta).join("");
    expect(text).not.toMatch(/999,999|888,888/);
    expect(text).toContain("$1,120");
    expect(events.find(event => event.type === "recommendations")).toMatchObject({ recommendations: [{ grounded: false }] });
  });
  it("continues pause_turn and handles max_tokens without executing partial tools", async () => {
    model.replies.push(textReply("", "pause_turn"), textReply("", "max_tokens"));
    const events = await run();
    expect(model.stream).toHaveBeenCalledTimes(2);
    expect(events.some(event => event.type === "error")).toBe(true);
    expect(events.at(-1)).toEqual({ type: "done" });
  });
  it("offline mileage what-if uses the same tools, UI actions and grounded templates", async () => {
    model.enabled = false;
    const events = await run("What if I drive 900 miles a month?");
    expect(events).toContainEqual({ type: "ui_action", action: { kind: "set_whatif", control: "monthlyMiles", value: 900 } });
    expect(events).toContainEqual({ type: "tool", name: "compute_lease_end_options", status: "done" });
    expect(events.at(-1)).toEqual({ type: "done" });
  });
  it("validates every tool and rejects cross-persona and revoked banking access", async () => {
    expect(agentTools.every(tool => tool.strict && tool.input_schema.additionalProperties === false)).toBe(true);
    const context = { personaId: "maya" as const, emit: () => {}, evidence: [] };
    expect((await executeTool("get_customer_snapshot", { personaId: "raj" }, context)).isError).toBe(true);
    getState("maya").consent.banking = false;
    expect((await executeTool("get_cashflow_summary", {}, context)).isError).toBe(true);
    expect((await executeTool("set_whatif", { control: "paymentDueDay", value: 32 }, context)).isError).toBe(true);
  });
});
describe("initial recommendation cache", () => {
  it("falls back offline and returns a cached panel without calling the model", async () => {
    model.enabled = false;
    const initial = await getInitialPanel("maya");
    const cached = await getInitialPanel("maya");
    expect(cached).toEqual(initial);
    expect(initial.recommendations[0].grounded).toBe(false);
    expect(model.stream).not.toHaveBeenCalled();
  });
  it("deduplicates concurrent generation, uses structured output and caches grounded copy", async () => {
    const option = getDashboard("maya").engines.payment.options[0];
    model.replies.push(textReply(JSON.stringify({ recommendations: [{ optionId: option.id, title: option.title, action: "Review with a specialist", why: "Estimated savings of $1,120.", impactLabel: `$${option.monthlyCost} savings`, urgencyLabel: null }] })));
    const [first, second] = await Promise.all([getInitialPanel("maya"), getInitialPanel("maya")]);
    expect(first).toEqual(second);
    expect(first.recommendations[0].grounded).toBe(true);
    expect(first.recommendations[0].impactLabel).toBe(optionImpactLabel(option));
    expect(model.stream).toHaveBeenCalledTimes(1);
    expect(model.stream.mock.calls[0][0].output_config.format.type).toBe("json_schema");
    await getInitialPanel("maya");
    expect(model.stream).toHaveBeenCalledTimes(1);
  });
  it("refreshes cached copy when engine fields change without a runtime reset", async () => {
    model.enabled = false;
    const before = await getInitialPanel("maya");
    const previous = engineOption.savingsVsBaseline;
    try {
      engineOption.savingsVsBaseline = previous! + 100;
      const after = await getInitialPanel("maya");
      expect(after.recommendations[0].impactLabel).toBe(optionImpactLabel(engineOption));
      expect(after.recommendations[0].impactLabel).not.toBe(before.recommendations[0].impactLabel);
    } finally { engineOption.savingsVsBaseline = previous; }
  });
});
