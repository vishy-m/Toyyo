import { listPersonas } from "@/lib/data";
import { computeTfsMetrics } from "@/lib/engines";
import { errorResponse, json } from "@/lib/server/http";
import { getState } from "@/lib/server/store";
import type { TfsData } from "@/lib/types";
export async function GET() {
  try {
    const personas = listPersonas();
    const packets = personas.flatMap(persona => getState(persona.id).packets);
    const data: TfsData = { packets, metrics: personas.map(persona => computeTfsMetrics(persona.id, getState(persona.id).acceptedOptionIds.size > 0, packets.filter(packet => packet.personaId === persona.id))) };
    return json(data);
  } catch (error) { return errorResponse(error); }
}
