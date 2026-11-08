import { beforeEach, describe, expect, it, vi } from "vitest";
import { listPersonas, getTrips } from "../../data";
import { computeTfsMetrics, runWhatIf } from "../../engines";
import { getDashboard, agentContext } from "../dashboard";
import { getState, resetPersona } from "../store";
import { applyAction } from "../actions";
import { executeTool } from "../../agent/tools";
import { getInitialPanel } from "../../agent/recommendations";

beforeEach(() => { for (const persona of listPersonas()) resetPersona(persona.id); });
describe("real engine backend integration", () => {
  it("builds all four dashboards, accepts their ranked moves and updates business metrics", () => {
    for (const persona of listPersonas()) {
      const dashboard = getDashboard(persona.id);
      const best = dashboard.ranked[0];
      expect(best).toBeDefined();
      const accepted = applyAction({ kind: "accept", personaId: persona.id, optionId: best.optionId, mode: "specialist-callback" });
      expect(accepted.packet?.numbers.length).toBeGreaterThan(0);
      expect(accepted.packet?.customerSummary).toContain("simulated");
      const metrics = computeTfsMetrics(persona.id, true, getState(persona.id).packets);
      expect(metrics.accepted).toBe(true);
      expect(metrics.openPackets).toBe(1);
    }
  });
  it("disables source tools, replay and initial cached copy when consent is revoked", async () => {
    vi.stubEnv("AGENT_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_API", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    try {
      const initial = await getInitialPanel("maya");
      expect(initial.recommendations.length).toBeGreaterThan(0);
      applyAction({ kind: "set_consent", personaId: "maya", source: "driving", value: false });
      applyAction({ kind: "set_consent", personaId: "maya", source: "banking", value: false });
      expect(getState("maya").panel).toBeUndefined();
      const dashboard = getDashboard("maya");
      expect(agentContext(dashboard).driving).toBeNull();
      expect(dashboard.cashflow).toBeNull();
      expect(dashboard.engines.insurance.limitedBy).toContain("driving");
      const context = { personaId: "maya" as const, emit: () => {}, evidence: [] };
      expect((await executeTool("open_trip_replay", { tripId: getTrips("maya")[0].id }, context)).isError).toBe(true);
      expect((await executeTool("get_driving_summary", {}, context)).isError).toBe(true);
      expect((await executeTool("get_cashflow_summary", {}, context)).isError).toBe(true);
      const fresh = await getInitialPanel("maya");
      expect(fresh.learned.every(item => item.source !== "driving")).toBe(true);
    } finally { vi.unstubAllEnvs(); }
  });
  it("what-if tools return exactly the shared engine output", async () => {
    const input = { overrides: { monthlyMiles: 900 } };
    const expected = runWhatIf("maya", "lease-end", input.overrides, getState("maya"));
    const result = await executeTool("compute_lease_end_options", input, { personaId: "maya", emit: () => {}, evidence: [] });
    expect(result).toEqual({ value: expected, isError: false });
  });
});
