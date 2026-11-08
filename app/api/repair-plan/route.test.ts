import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const input = {
  vehicle: { year: 2023, model: "Camry SE", mileage: 41_200 },
  issue: "The driver-side windshield wiper is torn",
  manualQuote: 95,
  loanBalance: 18_500,
  currentPayment: 445,
  currentApr: 6.4,
  savings: 6_200,
  monthlySurplus: 900,
  downPayment: 2_500,
  credit: "good",
  keepYears: 3,
};

afterEach(() => vi.unstubAllEnvs());

describe("repair planning workflow", () => {
  it("returns a ranked deterministic fallback without an Anthropic key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const response = await POST(new Request("http://localhost/api/repair-plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.provider).toBe("local-fallback");
    expect(body.recommendation).toBe("keep");
    expect(body.candidates).toHaveLength(3);
    expect(body.candidates.find((candidate: { path: string }) => candidate.path === "keep").score).toBeGreaterThan(0);
  });

  it("rejects incomplete planning data", async () => {
    const response = await POST(new Request("http://localhost/api/repair-plan", { method: "POST", body: JSON.stringify({ issue: "brakes grind" }) }));
    expect(response.status).toBe(400);
  });
});
