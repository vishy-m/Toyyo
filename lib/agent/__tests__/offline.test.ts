import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTrips, listPersonas } from "../../data";
import { runWhatIf } from "../../engines";
import type { AgentStreamEvent, PersonaId } from "../../types";
import { getDashboard } from "../../server/dashboard";
import { getState, resetPersona } from "../../server/store";
import { checkGrounding, extractNumbers } from "../grounding";
import { offlineChat, runAgent } from "../loop";
import { offlineIntent } from "../offline-intents";
import { getInitialPanel, templateRecommendation } from "../recommendations";

beforeEach(() => {
  vi.stubEnv("AGENT_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("GEMINI_API", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  for (const persona of listPersonas()) resetPersona(persona.id);
});
afterEach(() => vi.unstubAllEnvs());

describe("fallback recommendations with real engines", () => {
  it.each(listPersonas().map(persona => persona.id))("preserves %s titles/model casing and uses natural actions and engine amounts", async id => {
    const dashboard = getDashboard(id);
    const panel = await getInitialPanel(id);
    expect(panel.recommendations).toHaveLength(3);
    for (const option of Object.values(dashboard.engines).flatMap(engine => engine.options).filter(option => option.eligible)) {
      const rec = templateRecommendation(option);
      expect(rec.title).toBe(option.title);
      expect(rec.action).not.toMatch(/\b(\w+)\s+\1\b/i);
      expect(rec.action).not.toMatch(/^Review (?:review|buy|explore|coach|refinance|keep|align)\b/i);
      if (option.id.startsWith("insurance:ubi-")) expect(rec.action).toMatch(/^Compare UBI /);
      for (const model of [dashboard.persona.vehicle.model, option.upgradeModel?.name].filter((model): model is string => !!model)) {
        expect(rec.action).not.toContain(model.toLowerCase());
        if (rec.action.toLowerCase().includes(model.toLowerCase())) expect(rec.action).toContain(model);
      }
      const expected = option.savingsVsBaseline !== undefined && option.savingsVsBaseline > 0
        ? option.savingsVsBaseline : option.monthlyCost ?? option.totalCost;
      const amounts = extractNumbers(rec.impactLabel).filter(number => number.unit === "dollars");
      expect(amounts.map(number => number.value)).toEqual(expected === undefined ? [] : [Math.round(expected)]);
      expect(checkGrounding(rec.impactLabel, option).grounded).toBe(true);
    }
    for (const rec of panel.recommendations) {
      const option = dashboard.engines[rec.moveType].options.find(option => option.id === rec.optionId)!;
      expect(rec).toEqual(templateRecommendation(option));
    }
  });
});

describe("offline intent routing", () => {
  it.each([
    ["what if I drive less", 900], ["drive 900 miles a month", 900],
    ["fewer miles", 900], ["less driving", 900], ["drive 1,250 miles per month", 1250],
    ["what if I drive 0 mi/mo?", 0], ["fewer miles: 750.5 miles each month", 750.5],
  ] as const)("runs the engine and moves the controls for '%s'", async (message, monthlyMiles) => {
    const events: AgentStreamEvent[] = [];
    const context = { personaId: "maya" as const, emit: (event: AgentStreamEvent) => events.push(event), evidence: [] as unknown[] };
    const expected = runWhatIf("maya", "lease-end", { monthlyMiles }, getState("maya"));
    await offlineChat({ personaId: "maya", message }, context);
    expect(context.evidence).toContainEqual(expected);
    expect(events).toContainEqual({ type: "ui_action", action: { kind: "set_whatif", control: "monthlyMiles", value: monthlyMiles } });
    expect(events).toContainEqual({ type: "ui_action", action: { kind: "open_move", moveType: "lease-end" } });
    const recs = events.find(event => event.type === "recommendations");
    expect(recs?.recommendations.length).toBeGreaterThan(0);
    const option = expected.options.find(option => option.id === recs?.recommendations[0].optionId)!;
    const text = events.filter(event => event.type === "text").map(event => event.delta).join("");
    expect(text).toContain(option.summary);
    expect(checkGrounding(text, expected).grounded).toBe(true);
    expect(recs?.recommendations[0]).toEqual(templateRecommendation(option));
  });

  it.each(listPersonas().map(persona => persona.id))("compares lease-end explicitly even when %s ranks another move first", async personaId => {
    const events: AgentStreamEvent[] = [];
    await runAgent({ personaId, message: "compare my lease-end options" }, event => events.push(event));
    expect(events).toContainEqual({ type: "ui_action", action: { kind: "open_move", moveType: "lease-end" } });
    expect(events).toContainEqual({ type: "tool", name: "compute_lease_end_options", status: "done" });
    expect(events.filter(event => event.type === "done")).toHaveLength(1);
  });

  it.each(listPersonas().map(persona => persona.id))("opens %s's worst showcase and focuses its worst recorded event", async personaId => {
    const trip = getTrips(personaId).filter(trip => trip.showcase && trip.path.length > 1).sort((a, b) => a.score - b.score)[0];
    const worst = [...trip.events].filter(event => event.scoreDelta < 0).sort((a, b) => a.scoreDelta - b.scoreDelta || a.t - b.t)[0];
    const events: AgentStreamEvent[] = [];
    await runAgent({ personaId, message: "show the trip that hurt my score most" }, event => events.push(event));
    expect(events).toContainEqual({ type: "ui_action", action: { kind: "open_trip_replay", tripId: trip.id, ...(worst ? { focusEventT: worst.t } : {}) } });
    expect(events.filter(event => event.type === "ui_action")).toHaveLength(1);
    expect(events.filter(event => event.type === "done")).toHaveLength(1);
  });

  it("honors revoked driving consent for replay", async () => {
    getState("maya").consent.driving = false;
    const events: AgentStreamEvent[] = [];
    await runAgent({ personaId: "maya", message: "show the trip that hurt my score most" }, event => events.push(event));
    expect(events.some(event => event.type === "ui_action")).toBe(false);
    expect(events.filter(event => event.type === "text").map(event => event.delta).join("")).toContain("driving consent");
  });

  it.each(["drive -10 miles a month", "drive 20,001 miles a month"])("rejects invalid mileage in '%s'", async message => {
    const events: AgentStreamEvent[] = [];
    await runAgent({ personaId: "maya", message }, event => events.push(event));
    expect(events.some(event => event.type === "ui_action")).toBe(false);
    expect(events.some(event => event.type === "tool" && event.name.startsWith("compute_"))).toBe(false);
  });

  it("does not confuse shorter explanations with mileage changes", () => {
    for (const personaId of ["maya", "garcia", "jordan", "raj"] as PersonaId[]) {
      expect(offlineIntent("less detail please", getDashboard(personaId)).overrides).toEqual({});
    }
  });
});
