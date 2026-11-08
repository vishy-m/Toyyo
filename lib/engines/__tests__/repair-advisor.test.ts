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
});
