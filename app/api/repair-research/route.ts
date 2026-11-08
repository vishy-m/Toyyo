import { z } from "zod";
import { researchRepair } from "../../../lib/engines/repair-research";

const requestSchema = z.strictObject({
  issue: z.string().trim().min(5).max(500),
  vehicle: z.strictObject({ year: z.number().int().min(1990).max(2028), model: z.string().trim().min(1).max(80), mileage: z.number().int().min(0).max(500_000) }),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    return Response.json({ ...researchRepair(input.issue, input.vehicle), provider: "demo-knowledge-base" });
  } catch {
    return Response.json({ error: "Describe the issue and vehicle first." }, { status: 400 });
  }
}
