import { describe, expect, it } from "vitest";
import { POST } from "./route";

async function research(issue: string) {
  const response = await POST(new Request("http://localhost/api/repair-research", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ issue, vehicle: { year: 2023, model: "Camry SE", mileage: 41_200 } }) }));
  return { response, body: await response.json() };
}
describe("hard-coded repair research", () => {
  it("maps grinding brakes to safety guidance and stable links", async () => {
    const { response, body } = await research("The brakes grind when I stop");
    expect(response.status).toBe(200); expect(body.scenarioId).toBe("brakes-grinding"); expect(body.guidance.severity).toBe("high"); expect(body.links.length).toBeGreaterThanOrEqual(3);
  });
  it("maps a wiper issue to a tutorial-friendly response", async () => {
    const { body } = await research("The driver side windshield wiper is broken");
    expect(body.scenarioId).toBe("wiper-problem"); expect(body.guidance.allowTutorials).toBe(true);
  });
  it("uses a safe inspection fallback for unmatched descriptions", async () => {
    const { body } = await research("It makes an unusual sound sometimes");
    expect(body.scenarioId).toBe("inspection-needed"); expect(body.guidance.severity).toBe("medium");
  });
});
