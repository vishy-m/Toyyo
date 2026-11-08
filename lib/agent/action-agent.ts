import { z } from "zod";
import type { DecisionPath } from "../engines/repair-advisor";

export type ActionTaskStatus = "pending" | "running" | "needs_approval" | "completed";

export interface ActionTask {
  id: string;
  title: string;
  detail: string;
  status: ActionTaskStatus;
}

export const actionPlanSchema = z.strictObject({
  objective: z.string().min(1).max(180),
  tasks: z.array(z.strictObject({
    id: z.string().min(1).max(40),
    title: z.string().min(1).max(80),
    detail: z.string().min(1).max(180),
  })).min(3).max(5),
  draft: z.string().min(1).max(1800),
});

export type ActionPlan = z.infer<typeof actionPlanSchema>;

export const demoProviders: Record<string, { name: string; detail: string }[]> = {
  Austin: [
    { name: "North Austin Toyota Service", detail: "Toyota service · 6.2 mi" },
    { name: "Lone Star Auto Care", detail: "Independent shop · 3.8 mi" },
    { name: "Capitol Car Clinic", detail: "ASE-certified · 5.1 mi" },
  ],
  Houston: [
    { name: "Gulf Coast Toyota Service", detail: "Toyota service · 7.4 mi" },
    { name: "Bayou Auto Care", detail: "Independent shop · 4.2 mi" },
    { name: "Inner Loop Garage", detail: "ASE-certified · 5.9 mi" },
  ],
  Dallas: [
    { name: "North Dallas Toyota Service", detail: "Toyota service · 6.8 mi" },
    { name: "Metroplex Auto Care", detail: "Independent shop · 4.5 mi" },
    { name: "Dallas Car Clinic", detail: "ASE-certified · 5.3 mi" },
  ],
};

export function fallbackActionPlan(input: {
  name: string;
  vehicle: { year: number; model: string; mileage: number };
  issue: string;
  estimate: number;
  recommendation: DecisionPath;
  provider: string;
}): ActionPlan {
  const path = input.recommendation === "keep" ? "repair and keep the vehicle" : input.recommendation === "trade" ? "compare a trade-in path" : "repair and review refinancing";
  return {
    objective: `Get a written quote and confirm whether it still makes sense to ${path}.`,
    tasks: [
      { id: "review", title: "Review plan details", detail: "Confirm the vehicle, symptom, estimate, and selected provider." },
      { id: "draft", title: "Prepare quote request", detail: "Create a concise request for diagnosis, price, timing, and warranty." },
      { id: "send", title: "Send action brief", detail: "Email the formatted request to the configured Action Agent inbox." },
    ],
    draft: `Subject: Written estimate request for ${input.vehicle.year} Toyota ${input.vehicle.model}\n\nHello ${input.provider},\n\nI’m ${input.name}. My ${input.vehicle.year} Toyota ${input.vehicle.model} has ${input.vehicle.mileage.toLocaleString()} miles. The issue is: ${input.issue}\n\nMy current planning estimate is $${Math.round(input.estimate).toLocaleString()}. Could you confirm the likely diagnosis, diagnostic fee, written repair estimate, earliest availability, parts and labor warranty, and any exclusions?\n\nPlease do not begin work without my approval.\n\nThank you,\n${input.name}`,
  };
}
