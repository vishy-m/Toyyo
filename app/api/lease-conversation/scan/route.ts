import { listPersonas } from "@/lib/data";
import { evaluateLease } from "@/lib/server/lease-conversation";

/** Call from a scheduler with CRON_SECRET as new mileage or trip data arrives. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const results = await Promise.allSettled(listPersonas().filter(persona => persona.contract.kind === "lease").map(persona => evaluateLease(persona.id)));
  return Response.json({ results: results.map((result, index) => ({ personaId: listPersonas().filter(persona => persona.contract.kind === "lease")[index].id, stage: result.status === "fulfilled" ? result.value.stage : "error" })) });
}
