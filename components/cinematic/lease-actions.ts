"use server";

import { HttpError } from "@/lib/server/http";
import {
  approveLease,
  evaluateLease,
  getLeaseConversation,
  replyToLease,
  updateLeaseMileage,
  type LeaseConversation,
} from "@/lib/server/lease-conversation";
import type { PersonaId } from "@/lib/types";

function unwrap(error: unknown): never {
  if (error instanceof HttpError) throw new Error(error.message);
  throw error;
}

/** In-app lease demo. The HTTP route stays behind LEASE_DEMO_SECRET. */
export async function loadLease(personaId: PersonaId): Promise<LeaseConversation> {
  try { return getLeaseConversation(personaId); }
  catch (error) { unwrap(error); }
}

export async function actLease(
  personaId: PersonaId,
  action: "evaluate" | "reply" | "approve" | "mileage",
  text?: string,
  odometer?: number,
): Promise<LeaseConversation> {
  try {
    if (action === "evaluate") return await evaluateLease(personaId);
    if (action === "approve") return await approveLease(personaId);
    if (action === "mileage") {
      if (odometer === undefined) throw new Error("An odometer reading is required.");
      return await updateLeaseMileage(personaId, odometer);
    }
    if (!text) throw new Error("A reply is required.");
    return await replyToLease(personaId, text);
  } catch (error) { unwrap(error); }
}
