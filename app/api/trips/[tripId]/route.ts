import { getTrip } from "@/lib/data";
import { errorResponse, HttpError, json } from "@/lib/server/http";
import { getState } from "@/lib/server/store";
export async function GET(_request: Request, context: { params: Promise<{ tripId: string }> }) {
  try {
    const trip = getTrip((await context.params).tripId);
    if (!trip) throw new HttpError(404, "Trip not found.");
    if (!getState(trip.personaId).consent.driving) throw new HttpError(403, "Driving data consent is off.");
    return json(trip);
  } catch (error) { return errorResponse(error); }
}
