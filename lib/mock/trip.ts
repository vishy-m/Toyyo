// Mock full trips (path + events) for the UI and for task 04's replay before /api/trips exists.
// Deterministic: no runtime randomness. Paths are hand-placed waypoints densified to ~200 points.

import type { PersonaId, Trip, TripCategory, TripEvent, TripEventType } from "@/lib/types";

type LngLat = [number, number];

interface TripSpec {
  id: string;
  personaId: PersonaId;
  start: string; // ISO
  durationS: number;
  waypoints: LngLat[];
  points?: number;
  category: TripCategory;
  destinationLabel: string;
  highwayPct: number;
  nightPct: number;
  speedingPct: number;
  score: number;
  events: { at: number; type: TripEventType; scoreDelta: number }[]; // `at` = fraction of the trip 0..1
}

const R = 3958.8; // earth radius, miles
function haversine(a: LngLat, b: LngLat) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Densify a polyline to `n` points evenly spaced by distance; time follows an ease-in/out speed profile. */
function densify(waypoints: LngLat[], n: number, durationS: number): { path: Trip["path"]; miles: number } {
  const cum = [0];
  for (let i = 1; i < waypoints.length; i++) cum.push(cum[i - 1] + haversine(waypoints[i - 1], waypoints[i]));
  const total = cum[cum.length - 1];
  const path: Trip["path"] = [];
  let seg = 1;
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1);
    const d = f * total;
    while (seg < cum.length - 1 && cum[seg] < d) seg++;
    const a = waypoints[seg - 1];
    const b = waypoints[seg];
    const span = cum[seg] - cum[seg - 1] || 1;
    const u = Math.min(1, Math.max(0, (d - cum[seg - 1]) / span));
    // gentle lateral wobble so straight segments don't look ruler-drawn
    const wob = Math.sin(f * Math.PI * 9) * 0.00035 * Math.sin(f * Math.PI);
    const lng = a[0] + (b[0] - a[0]) * u + wob;
    const lat = a[1] + (b[1] - a[1]) * u - wob * 0.6;
    // time: slow start / slow end (city), faster middle (highway)
    const eased = f < 0.1 ? f * 1.6 : f > 0.9 ? 0.16 + 0.68 + (f - 0.9) * 1.6 : 0.16 + (f - 0.1) * 0.85;
    path.push([round(lng, 6), round(lat, 6), Math.round(eased * durationS)]);
  }
  return { path, miles: round(total, 1) };
}

function round(v: number, p: number) {
  const m = 10 ** p;
  return Math.round(v * m) / m;
}

function build(spec: TripSpec): Trip {
  const { path, miles } = densify(spec.waypoints, spec.points ?? 200, spec.durationS);
  const events: TripEvent[] = spec.events.map((e) => {
    const idx = Math.min(path.length - 1, Math.round(e.at * (path.length - 1)));
    const p = path[idx];
    return { t: p[2], type: e.type, scoreDelta: e.scoreDelta, lngLat: [p[0], p[1]] };
  });
  const end = new Date(new Date(spec.start).getTime() + spec.durationS * 1000).toISOString();
  return {
    id: spec.id,
    personaId: spec.personaId,
    start: spec.start,
    end,
    miles,
    highwayPct: spec.highwayPct,
    nightPct: spec.nightPct,
    speedingPct: spec.speedingPct,
    hardBrakes: events.filter((e) => e.type === "hard-brake").length,
    fastAccels: events.filter((e) => e.type === "fast-accel").length,
    harshCorners: events.filter((e) => e.type === "harsh-corner").length,
    category: spec.category,
    destinationLabel: spec.destinationLabel,
    score: spec.score,
    showcase: true,
    path,
    events,
  };
}

/** Maya: downtown Austin → Round Rock on I-35, evening commute with one hard brake and a speeding stretch. */
export const mockTrip: Trip = build({
  id: "maya-trip-showcase-i35",
  personaId: "maya",
  start: "2026-10-21T17:42:00-05:00",
  durationS: 1740,
  category: "commute",
  destinationLabel: "Round Rock (I-35 north)",
  highwayPct: 0.82,
  nightPct: 0.1,
  speedingPct: 0.07,
  score: 74,
  waypoints: [
    [-97.7431, 30.2672],
    [-97.7365, 30.264],
    [-97.7318, 30.276],
    [-97.723, 30.2905],
    [-97.7155, 30.308],
    [-97.7085, 30.326],
    [-97.699, 30.342],
    [-97.693, 30.36],
    [-97.6862, 30.38],
    [-97.68, 30.403],
    [-97.6745, 30.426],
    [-97.672, 30.448],
    [-97.676, 30.47],
    [-97.679, 30.492],
    [-97.6812, 30.5083],
  ],
  events: [
    { at: 0.12, type: "fast-accel", scoreDelta: -1 },
    { at: 0.38, type: "hard-brake", scoreDelta: -3 },
    { at: 0.55, type: "speeding-start", scoreDelta: -2 },
    { at: 0.66, type: "speeding-end", scoreDelta: 0 },
    { at: 0.86, type: "hard-brake", scoreDelta: -2 },
  ],
});

/** Raj: Austin → Big Bend NP via Fredericksburg and Fort Stockton. Long road trip, clean driving. */
const rajTrip = build({
  id: "raj-trip-showcase-bigbend",
  personaId: "raj",
  start: "2026-10-10T06:15:00-05:00",
  durationS: 7 * 3600 + 20 * 60,
  points: 240,
  category: "road-trip",
  destinationLabel: "Big Bend NP",
  highwayPct: 0.91,
  nightPct: 0.04,
  speedingPct: 0.02,
  score: 93,
  waypoints: [
    [-97.7431, 30.2672],
    [-98.0, 30.27],
    [-98.4116, 30.2752],
    [-98.8719, 30.2752],
    [-99.7723, 30.4894],
    [-100.6435, 30.5666],
    [-101.7329, 30.7124],
    [-102.8793, 30.8949],
    [-103.2496, 30.2066],
    [-103.2, 29.85],
    [-103.206, 29.328],
  ],
  events: [
    { at: 0.2, type: "speeding-start", scoreDelta: -1 },
    { at: 0.24, type: "speeding-end", scoreDelta: 0 },
    { at: 0.93, type: "harsh-corner", scoreDelta: -1 },
  ],
});

/** Jordan: late-night Houston loop, several hard brakes (the trip that hurt the score most). */
const jordanTrip = build({
  id: "jordan-trip-showcase-night",
  personaId: "jordan",
  start: "2026-10-18T23:38:00-05:00",
  durationS: 1260,
  category: "other",
  destinationLabel: "Galleria area",
  highwayPct: 0.35,
  nightPct: 1,
  speedingPct: 0.14,
  score: 52,
  waypoints: [
    [-95.3698, 29.7604],
    [-95.381, 29.7585],
    [-95.3925, 29.7552],
    [-95.405, 29.749],
    [-95.42, 29.744],
    [-95.4355, 29.7415],
    [-95.4488, 29.7398],
    [-95.4613, 29.739],
  ],
  events: [
    { at: 0.08, type: "fast-accel", scoreDelta: -2 },
    { at: 0.22, type: "hard-brake", scoreDelta: -4 },
    { at: 0.4, type: "speeding-start", scoreDelta: -3 },
    { at: 0.52, type: "speeding-end", scoreDelta: 0 },
    { at: 0.61, type: "harsh-corner", scoreDelta: -2 },
    { at: 0.78, type: "hard-brake", scoreDelta: -4 },
  ],
});

/** Garcias: daycare run across central Austin, smooth. */
const garciaTrip = build({
  id: "garcia-trip-showcase-daycare",
  personaId: "garcia",
  start: "2026-10-22T07:48:00-05:00",
  durationS: 960,
  category: "childcare",
  destinationLabel: "Daycare (Hyde Park)",
  highwayPct: 0.1,
  nightPct: 0,
  speedingPct: 0,
  score: 95,
  waypoints: [
    [-97.7055, 30.2985],
    [-97.712, 30.3005],
    [-97.7205, 30.3042],
    [-97.7268, 30.3098],
    [-97.7299, 30.3155],
  ],
  events: [{ at: 0.5, type: "hard-brake", scoreDelta: -1 }],
});

export const mockTrips: Trip[] = [mockTrip, garciaTrip, jordanTrip, rajTrip];

// The four carousel cases have no hand-written offline replay; they reuse the generic sample route
// (the live /api/trips endpoint serves their real routes).
export const showcaseTripByPersona: Record<PersonaId, Trip> = {
  maya: mockTrip,
  garcia: garciaTrip,
  jordan: jordanTrip,
  raj: rajTrip,
  nora: { ...mockTrip, personaId: "nora" },
  eli: { ...mockTrip, personaId: "eli" },
  ava: { ...mockTrip, personaId: "ava" },
  theo: { ...mockTrip, personaId: "theo" },
  ryan: { ...mockTrip, personaId: "ryan" },
  devon: { ...mockTrip, personaId: "devon" },
  priya: { ...mockTrip, personaId: "priya" },
};
