import type { DashboardData } from "../types";

type TripRow = DashboardData["trips"][number];
const eventCount = (trip: TripRow) => trip.hardBrakes + trip.fastAccels + trip.harshCorners;

/** The most instructive replayable drive: the most events, then the lowest score. */
export function mostInstructive(trips: TripRow[]) {
  return trips.filter((trip) => trip.showcase).sort((a, b) => eventCount(b) - eventCount(a) || a.score - b.score)[0];
}
