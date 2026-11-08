import { describe, expect, it, vi } from "vitest";
import { checkGrounding, extractNumbers } from "../grounding";
vi.spyOn(console, "warn").mockImplementation(() => {});
describe("numeric grounding", () => {
  it("extracts dollars, percentages, commas, shorthand and mileage", () => {
    const values = extractNumbers("Pay $1,120.45 at 6.9%, drive 900 miles or 1.5k mi; reserve $24k.");
    expect(values).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 1120.45, unit: "dollars" }),
      expect.objectContaining({ value: 6.9, unit: "percent" }),
      expect.objectContaining({ value: 900, unit: "miles" }),
      expect.objectContaining({ value: 1500, unit: "miles" }),
      expect.objectContaining({ value: 24000, unit: "dollars" }),
    ]));
  });
  it("checks both ends of ranges", () => {
    expect(checkGrounding("Drive 800–900 miles", { miles: 900 }).grounded).toBe(false);
    expect(checkGrounding("Rate 5–6%", { rate: 6 }).grounded).toBe(false);
    expect(checkGrounding("Pay $100–200", { amount: 100 }).grounded).toBe(false);
    expect(checkGrounding("Drive 800-900 miles", { miles: [800, 900] }).grounded).toBe(true);
    expect(checkGrounding("Pay $20–24k", { cost: [20000, 24000] }).grounded).toBe(true);
  });
  it("matches rounding, nested engine assumptions and percentages stored as ratios", () => {
    expect(checkGrounding("$1,120, 6.9%, 900.1 miles and 20%", { savings: 1120.4, apr: 6.94, miles: 900.14, nightPct: 0.2 }).grounded).toBe(true);
    expect(checkGrounding("$21,500", { assumptions: [{ label: "Price", value: "$21,500" }] }).grounded).toBe(true);
  });
  it("rejects invented values and does not accept IDs or dates as evidence", () => {
    expect(checkGrounding("Save $9,999 and drive 2026 miles", { savings: 120, id: "9999", startDate: "2026-10-27" }).violations).toHaveLength(2);
    expect(checkGrounding("An estimated 7.2 percent", { apr: 6.9 }).grounded).toBe(false);
  });
  it("allows text without financial or mileage numbers", () => {
    expect(checkGrounding("A TFS specialist can help compare your options.", {}).grounded).toBe(true);
  });
});
