import { describe, expect, it } from "vitest";
import { analyzeRepairDecision, classifyRepair, vehicleValue } from "../repair-advisor";

describe("repair advisor", () => {
  it("classifies known problems and preserves a manual quote", () => {
    expect(classifyRepair("Brakes squeal when stopping", 2018).category).toBe("brakes");
    expect(classifyRepair("Something feels odd", 2018, 725)).toMatchObject({ estimate: 725, source: "shop quote", needsInspection: false });
  });

  it("reduces value with age and mileage", () => {
    expect(vehicleValue(2024, "Camry", 20_000).privateSale).toBeGreaterThan(vehicleValue(2014, "Camry", 150_000).privateSale);
  });

  it("returns three transparent paths", () => {
    const result = analyzeRepairDecision({
      vehicle: { year: 2016, model: "Camry", mileage: 110_000 },
      issue: "brakes are grinding",
      loanBalance: 3_000,
      currentPayment: 320,
      currentApr: 10,
      savings: 8_000,
      monthlySurplus: 900,
      downPayment: 3_000,
      credit: "good",
      keepYears: 3,
    });
    expect(result.options.map((option) => option.path)).toEqual(["keep", "trade", "refinance"]);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("recommends repairing an affordable minor problem instead of a lower-looking unrelated payment", () => {
    const result = analyzeRepairDecision({
      vehicle: { year: 2018, model: "Camry", mileage: 80_000 },
      issue: "The windshield wiper blade is broken",
      loanBalance: 8_000,
      currentPayment: 350,
      currentApr: 6.5,
      savings: 4_000,
      monthlySurplus: 600,
      downPayment: 2_000,
      credit: "good",
      keepYears: 3,
    });
    expect(result.recommendation).toBe("keep");
    expect(result.reasons.join(" ")).toContain("Repairing is favored");
  });

  it("recommends trade only when a major repair burden and vehicle risk justify it", () => {
    const result = analyzeRepairDecision({
      vehicle: { year: 2012, model: "Camry", mileage: 175_000 },
      issue: "Transmission is slipping and will not shift",
      manualQuote: 5_600,
      loanBalance: 0,
      currentPayment: 0,
      currentApr: 0,
      savings: 12_000,
      monthlySurplus: 1_500,
      downPayment: 4_000,
      credit: "excellent",
      keepYears: 3,
    });
    expect(result.recommendation).toBe("trade");
  });

  it("treats refinance as repair plus refinance and uses the estimate in that path", () => {
    const input = {
      vehicle: { year: 2019, model: "Camry", mileage: 75_000 }, issue: "Brake pads squeal", manualQuote: 700,
      loanBalance: 14_000, currentPayment: 520, currentApr: 14, savings: 6_000, monthlySurplus: 800,
      downPayment: 2_000, credit: "good" as const, keepYears: 3,
    };
    const result = analyzeRepairDecision(input);
    const refinance = result.options.find((option) => option.path === "refinance")!;
    expect(refinance.title).toBe("Repair + refinance");
    expect(refinance.upfront).toBe(1050);
    expect(result.recommendation).toBe("refinance");
  });

  it("does not recommend replacement from an unknown symptom before inspection", () => {
    const result = analyzeRepairDecision({
      vehicle: { year: 2010, model: "Camry", mileage: 180_000 }, issue: "It feels strange sometimes",
      loanBalance: 0, currentPayment: 0, currentApr: 0, savings: 20_000, monthlySurplus: 2_000,
      downPayment: 5_000, credit: "excellent", keepYears: 3,
    });
    expect(result.estimate.needsInspection).toBe(true);
    expect(result.recommendation).toBe("keep");
  });

  it("includes the hard-coded symptom response in the plan and its risk score", () => {
    const base = {
      vehicle: { year: 2016, model: "Camry", mileage: 128_000 }, issue: "Engine is overheating",
      manualQuote: 1900, loanBalance: 0, currentPayment: 0, currentApr: 0, savings: 7500,
      monthlySurplus: 900, downPayment: 3000, credit: "good" as const, keepYears: 3,
    };
    const withoutResearch = analyzeRepairDecision(base);
    const withResearch = analyzeRepairDecision({ ...base, researchSeverity: "high", researchVerdict: "Stop the engine before heat causes major damage" });
    expect(withResearch.score).toBeGreaterThan(withoutResearch.score);
    expect(withResearch.reasons[0]).toContain("Stop the engine");
  });
});
