import { describe, expect, it } from "vitest";
import type { RepairAdvisorInput } from "../../lib/engines/repair-advisor";
import { parseLifeScenario, projectFlexibleCash } from "../../lib/engines/repair-scenario";

const base: RepairAdvisorInput = {
  vehicle: { year: 2018, model: "Camry", mileage: 80_000 },
  issue: "brakes squeal",
  loanBalance: 8_000,
  currentPayment: 350,
  currentApr: 8,
  savings: 5_000,
  monthlySurplus: 700,
  downPayment: 2_000,
  credit: "good",
  keepYears: 3,
};

describe("what-if scenario math", () => {
  it("converts different annual raises into different monthly amounts", () => {
    expect(parseLifeScenario("I got a $5k annual raise", base, 800).input?.monthlySurplus).toBe(1117);
    expect(parseLifeScenario("I got a $10k annual raise", base, 800).input?.monthlySurplus).toBe(1533);
  });

  it("uses stated annual income for percentage raises", () => {
    const result = parseLifeScenario("I make $60k a year and got a 30% raise", base, 800);
    expect(result.input?.monthlySurplus).toBe(2200);
    expect(result.summary).toContain("$18,000/year");
  });

  it("accepts raises phrased before or after the amount", () => {
    expect(parseLifeScenario("My raise was $5k", base, 800).input?.monthlySurplus).toBe(1117);
    expect(parseLifeScenario("I make $60k and my raise was 10 percent", base, 800).input?.monthlySurplus).toBe(1200);
  });

  it("requires an income baseline for percentage changes", () => {
    expect(parseLifeScenario("I got a 30% raise", base, 800).error).toContain("current annual income");
  });

  it("combines recurring and one-time changes without mixing them", () => {
    const result = parseLifeScenario("I got a $12k raise, rent went up $300, and I had a $2k emergency", base, 800);
    expect(result.input?.monthlySurplus).toBe(1400);
    expect(result.input?.savings).toBe(3000);
  });

  it("moves the graph by the full monthly effect of an annual raise", () => {
    const option = { path: "trade" as const, title: "Trade in", monthly: 500, upfront: 2000, eligible: true, summary: "" };
    const raised = parseLifeScenario("I got a $12k annual raise", base, 800).input!;
    const baselineEnd = projectFlexibleCash([option], base).at(-1)!.trade;
    const raisedEnd = projectFlexibleCash([option], raised).at(-1)!.trade;
    expect(raisedEnd - baselineEnd).toBe(36_000);
  });
});
