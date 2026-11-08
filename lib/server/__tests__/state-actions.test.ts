import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../engines", async () => {
  const { getPersona } = await import("../../data");
  const { fakeDashboard } = await import("./fixtures");
  return { buildDashboard: (id: Parameters<typeof getPersona>[0], runtime: Parameters<typeof fakeDashboard>[1]) => fakeDashboard(id, runtime, getPersona(id)) };
});
import { getPersona } from "../../data";
import { applyAction } from "../actions";
import { getState, resetPersona } from "../store";
import { getDashboard, agentContext } from "../dashboard";
import { actionSchema, chatSchema, whatIfSchema } from "../schemas";
import { boostPriority } from "../learning";

describe("runtime actions", () => {
  beforeEach(() => { resetPersona("maya"); resetPersona("garcia"); });
  it("isolates customers and seed data; weights normalize", () => {
    const state = getState("maya");
    const seed = getPersona("maya").preferences.priorityWeights.monthlyPayment;
    boostPriority(state.preferences, "monthlyPayment");
    expect(Object.values(state.preferences.priorityWeights).reduce((a,b) => a+b,0)).toBeCloseTo(1);
    expect(getPersona("maya").preferences.priorityWeights.monthlyPayment).toBe(seed);
    expect(getState("garcia").acceptedOptionIds.size).toBe(0);
  });
  it("accept is idempotent and produces exact engine math for both handoff modes", () => {
    const body = { kind: "accept", personaId: "maya", optionId: "payment:refinance", mode: "self-service" } as const;
    const response = applyAction(body);
    expect(response.packet?.numbers).toContainEqual({ label: "Savings", value: "$1,120 (baseline - cost)" });
    expect(applyAction(body).packet?.id).toBe(response.packet?.id);
    applyAction({ ...body, mode: "specialist-callback" });
    expect(getState("maya").packets).toHaveLength(2);
    expect(getState("maya").preferences.accepted).toHaveLength(1);
  });
  it("routes hardship to specialists and redacts revoked data from existing handoffs", () => {
    const action = { kind: "accept", personaId: "maya", optionId: "payment:hardship", mode: "self-service" } as const;
    expect(() => applyAction(action)).toThrow("A TFS specialist");
    expect(getState("maya").packets).toHaveLength(0);
    applyAction({ ...action, mode: "specialist-callback" });
    applyAction({ kind: "set_consent", personaId: "maya", source: "banking", value: false });
    expect(getState("maya").packets[0].numbers).toEqual([]);
    expect(getState("maya").packets[0].consentedData).not.toContain("banking");
  });
  it("dismissal learns and suppresses the appropriate option or type", () => {
    const before = getState("maya").preferences.priorityWeights.monthlyPayment;
    applyAction({ kind: "dismiss", personaId: "maya", optionId: "payment:refinance", reason: "too-expensive" });
    expect(getState("maya").preferences.priorityWeights.monthlyPayment).toBeGreaterThan(before);
    expect(getDashboard("maya").ranked).toHaveLength(0);
    applyAction({ kind: "dismiss", personaId: "maya", optionId: "lease-end:buyout", reason: "not-relevant" });
    expect(getState("maya").preferences.suppressedMoveTypes).toContain("lease-end");
  });
  it("seeds driving learning once, honors deletion and strips revoked data", () => {
    getDashboard("maya"); getDashboard("maya");
    const learned = getState("maya").preferences.learned.filter(item => item.source === "driving");
    expect(learned).toHaveLength(1);
    applyAction({ kind: "delete_learned", personaId: "maya", learnedId: learned[0].id });
    expect(getDashboard("maya").preferences.learned.filter(item => item.source === "driving")).toHaveLength(0);
    applyAction({ kind: "set_consent", personaId: "maya", source: "driving", value: false });
    applyAction({ kind: "set_consent", personaId: "maya", source: "banking", value: false });
    const dashboard = getDashboard("maya");
    expect(dashboard.cashflow).toBeNull();
    expect(dashboard.trips).toEqual([]);
    expect(agentContext(dashboard).driving).toBeNull();
    expect(getState("maya").panel).toBeUndefined();
  });
  it("validates request bodies including unknown keys and nonfinite/out-of-range values", () => {
    expect(chatSchema.safeParse({ personaId: "nope", message: "hello" }).success).toBe(false);
    expect(actionSchema.safeParse({ kind: "set_style", personaId: "maya" }).success).toBe(false);
    expect(whatIfSchema.safeParse({ personaId: "maya", moveType: "lease-end", overrides: { monthlyMiles: -1 } }).success).toBe(false);
    expect(whatIfSchema.safeParse({ personaId: "maya", moveType: "payment", overrides: { paymentDueDay: 32 } }).success).toBe(false);
    expect(chatSchema.safeParse({ personaId: "maya", message: "hello", secret: true }).success).toBe(false);
  });
});
