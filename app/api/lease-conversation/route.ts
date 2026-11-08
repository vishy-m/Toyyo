import { z } from "zod";
import { approveLease, evaluateLease, getLeaseConversation, replyToLease, updateLeaseMileage } from "@/lib/server/lease-conversation";
import { errorResponse, json, readBody } from "@/lib/server/http";
import { personaIdSchema } from "@/lib/server/schemas";

const requestSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("evaluate"), personaId: personaIdSchema }),
  z.strictObject({ action: z.literal("reply"), personaId: personaIdSchema, text: z.string().trim().min(1).max(500) }),
  z.strictObject({ action: z.literal("approve"), personaId: personaIdSchema }),
  z.strictObject({ action: z.literal("mileage"), personaId: personaIdSchema, odometer: z.number().int().min(0).max(500000) }),
]);
export async function GET(request: Request) {
  try { return json(getLeaseConversation(personaIdSchema.parse(new URL(request.url).searchParams.get("personaId")))); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const body = await readBody(request, requestSchema);
    return json(body.action === "evaluate" ? await evaluateLease(body.personaId) : body.action === "approve" ? await approveLease(body.personaId) : body.action === "mileage" ? await updateLeaseMileage(body.personaId, body.odometer) : await replyToLease(body.personaId, body.text));
  } catch (error) { return errorResponse(error); }
}
