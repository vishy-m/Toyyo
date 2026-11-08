import { z } from "zod";
import type { DecisionPath } from "../engines/repair-advisor";

export const actionPlanSchema = z.strictObject({
  objective: z.string().min(1).max(180),
  tasks: z.array(z.strictObject({
    id: z.string().min(1).max(40),
    title: z.string().min(1).max(80),
    detail: z.string().min(1).max(180),
  })).min(3).max(5),
  emailDraft: z.string().min(1).max(1800),
  voicemailScript: z.string().min(1).max(900),
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
  task: "quote" | "availability" | "warranty" | "follow_up" | "callback";
  channel: "email" | "voicemail" | "both";
  tone: "concise" | "friendly" | "formal";
  followUp: "none" | "once" | "remind" | "ask";
}): ActionPlan {
  const path = input.recommendation === "keep" ? "repair and keep the vehicle" : input.recommendation === "trade" ? "compare a trade-in path" : "repair and review refinancing";
  const task = { quote: "request a written quote", availability: "ask about availability", warranty: "confirm warranty details", follow_up: "follow up on a quote", callback: "request a callback" }[input.task];
  return {
    objective: `${task[0].toUpperCase()}${task.slice(1)} and confirm whether it still makes sense to ${path}.`,
    tasks: [
      { id: "review", title: "Review details", detail: "Confirm the vehicle, request, provider, and contact method." },
      { id: "draft", title: "Prepare outreach", detail: `Create ${input.channel === "both" ? "email and voicemail drafts" : `a ${input.channel} draft`}.` },
      { id: "approve", title: "Get approval", detail: "Wait for explicit approval before contacting anyone." },
      { id: "send", title: "Send outreach", detail: `Use ${input.channel === "both" ? "both approved channels" : `the approved ${input.channel} channel`}.` },
    ],
    emailDraft: `Subject: Service request for ${input.vehicle.year} Toyota ${input.vehicle.model}\n\nHello ${input.provider},\n\nI’m ${input.name}. My vehicle has ${input.vehicle.mileage.toLocaleString()} miles. Issue: ${input.issue}\n\nI’d like to ${task}. My current planning estimate is $${Math.round(input.estimate).toLocaleString()}. Please reply with the requested details. Do not begin work without my approval.\n\nThank you,\n${input.name}`,
    voicemailScript: `Hello, this is an automated message sent with ${input.name}'s permission for ${input.provider}. ${input.name} has a ${input.vehicle.year} Toyota ${input.vehicle.model} with ${input.vehicle.mileage.toLocaleString()} miles. The issue is ${input.issue}. They would like to ${task}. Please call them back with the requested details. Do not begin work without their approval. Thank you.`,
  };
}
