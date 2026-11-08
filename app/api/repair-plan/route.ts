import { z } from "zod";
import { runPlanningWorkflow } from "../../../lib/agent/planning-workflow";

const requestSchema = z.object({
  vehicle: z.strictObject({ year: z.number().int().min(1990).max(2028), model: z.string().trim().min(1).max(80), mileage: z.number().int().min(0).max(500_000) }),
  issue: z.string().trim().min(5).max(500),
  manualQuote: z.number().nonnegative().optional(),
  loanBalance: z.number().nonnegative(), currentPayment: z.number().nonnegative(), currentApr: z.number().min(0).max(40),
  savings: z.number().nonnegative(), monthlySurplus: z.number().nonnegative(), downPayment: z.number().nonnegative(),
  credit: z.enum(["excellent", "good", "fair", "building"]), keepYears: z.number().int().min(1).max(10),
  researchSeverity: z.enum(["low", "medium", "high"]).optional(), researchVerdict: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    return Response.json(await runPlanningWorkflow(input));
  } catch {
    return Response.json({ error: "The planning details were incomplete." }, { status: 400 });
  }
}
