import { z } from "zod";
import { approveLease, evaluateLease, getLeaseConversation, replyToLease, updateLeaseMileage } from "../../../lib/server/lease-conversation";
import { errorResponse, json, readBody } from "../../../lib/server/http";
import { personaIdSchema } from "../../../lib/server/schemas";

function authorized(request: Request) {
  const secret = process.env.LEASE_DEMO_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}
const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

const requestSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("evaluate"), personaId: personaIdSchema }),
  z.strictObject({ action: z.literal("reply"), personaId: personaIdSchema, text: z.string().trim().min(1).max(500) }),
  z.strictObject({ action: z.literal("approve"), personaId: personaIdSchema }),
  z.strictObject({ action: z.literal("mileage"), personaId: personaIdSchema, odometer: z.number().int().min(0).max(500000) }),
]);
export async function GET(request: Request) {
  if (!authorized(request)) return unauthorized();
  try { return json(getLeaseConversation(personaIdSchema.parse(new URL(request.url).searchParams.get("personaId")))); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  if (!authorized(request)) return unauthorized();
  try {
    const body = await readBody(request, requestSchema);
    return json(body.action === "evaluate" ? await evaluateLease(body.personaId) : body.action === "approve" ? await approveLease(body.personaId) : body.action === "mileage" ? await updateLeaseMileage(body.personaId, body.odometer) : await replyToLease(body.personaId, body.text));
  } catch (error) { return errorResponse(error); }
}
