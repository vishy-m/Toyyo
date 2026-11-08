// Mock DashboardData builder (stand-in for GET /api/persona/[id]).

import type {
  CashflowSummary,
  DashboardData,
  DrivingSummary,
  Persona,
  PersonaId,
  Preferences,
  RankedMove,
  Trip,
  TripCategory,
  TripInsight,
} from "@/lib/types";
import { mockDrivingBase, mockEngines } from "./engine";
import { mockPersonas } from "./personas";
import { showcaseTripByPersona } from "./trip";

type TripRow = Omit<Trip, "path" | "events">;

// Small seeded PRNG so mock trip lists are stable across reloads (no hydration drift).
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tripPlan: Record<PersonaId, { cat: TripCategory; label: string; miles: [number, number]; night?: number; score: [number, number] }[]> = {
  maya: [
    { cat: "commute", label: "Round Rock (I-35 north)", miles: [16, 19], score: [72, 88] },
    { cat: "commute", label: "Downtown Austin", miles: [16, 19], score: [75, 90] },
    { cat: "road-trip", label: "Dallas", miles: [190, 198], score: [80, 92] },
    { cat: "errand", label: "Mueller", miles: [3, 7], score: [84, 96] },
  ],
  garcia: [
    { cat: "childcare", label: "Daycare (Hyde Park)", miles: [3, 5], score: [90, 99] },
    { cat: "errand", label: "H-E-B (Mueller)", miles: [2, 6], score: [88, 98] },
    { cat: "road-trip", label: "Big Bend NP", miles: [420, 440], score: [88, 95] },
    { cat: "other", label: "Pediatrician (North Loop)", miles: [4, 7], score: [90, 97] },
  ],
  jordan: [
    { cat: "other", label: "Galleria area", miles: [6, 9], night: 0.9, score: [48, 66] },
    { cat: "commute", label: "UH campus", miles: [5, 8], night: 0.2, score: [60, 74] },
    { cat: "errand", label: "Montrose", miles: [2, 5], night: 0.6, score: [55, 72] },
    { cat: "other", label: "Midtown", miles: [3, 6], night: 1, score: [50, 64] },
  ],
  raj: [
    { cat: "trailhead", label: "Pedernales Falls trailhead", miles: [38, 46], score: [82, 92] },
    { cat: "road-trip", label: "Big Bend NP", miles: [440, 460], score: [88, 95] },
    { cat: "commute", label: "Domain office", miles: [12, 15], score: [80, 92] },
    { cat: "trailhead", label: "Enchanted Rock", miles: [86, 92], score: [84, 93] },
    { cat: "road-trip", label: "Fredericksburg", miles: [78, 84], score: [85, 94] },
  ],
};

function stripTrip(t: Trip): TripRow {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { path, events, ...row } = t;
  return row;
}

export function mockTripRows(id: PersonaId): TripRow[] {
  const rand = mulberry32(id.length * 7919 + id.charCodeAt(0));
  const plan = tripPlan[id];
  const rows: TripRow[] = [stripTrip(showcaseTripByPersona[id])];
  const snapshot = new Date("2026-10-26T18:00:00-05:00").getTime();
  for (let i = 0; i < 17; i++) {
    const spec = plan[Math.floor(rand() * plan.length)];
    const miles = Math.round((spec.miles[0] + rand() * (spec.miles[1] - spec.miles[0])) * 10) / 10;
    const score = Math.round(spec.score[0] + rand() * (spec.score[1] - spec.score[0]));
    const start = new Date(snapshot - (i + 1) * 86400000 * (0.7 + rand() * 4) - rand() * 36000000);
    const durMin = Math.max(8, Math.round(miles * (spec.cat === "road-trip" ? 1.05 : 2.1)));
    const hard = score < 70 ? 2 + Math.floor(rand() * 4) : score < 85 ? Math.floor(rand() * 3) : Math.floor(rand() * 1.3);
    rows.push({
      id: `${id}-trip-${String(i + 1).padStart(3, "0")}`,
      personaId: id,
      start: start.toISOString(),
      end: new Date(start.getTime() + durMin * 60000).toISOString(),
      miles,
      highwayPct: spec.cat === "road-trip" ? 0.9 : spec.cat === "commute" ? 0.7 : 0.25,
      nightPct: spec.night ?? 0.05,
      speedingPct: score < 70 ? 0.12 : 0.03,
      hardBrakes: hard,
      fastAccels: Math.floor(hard / 2),
      harshCorners: spec.cat === "trailhead" ? 1 : 0,
      category: spec.cat,
      destinationLabel: spec.label,
      score,
      showcase: false,
    });
  }
  return rows;
}

const drivingExtras: Record<PersonaId, Pick<DrivingSummary, "scoreFactors" | "smoothStreak" | "lifestyleTags" | "topDestinations" | "categoryMiles">> = {
  maya: {
    scoreFactors: [
      { factor: "Hard braking", impact: -8, detail: "I-35 stop-and-go near 51st St" },
      { factor: "Speeding", impact: -6, detail: "7% of highway miles over the limit" },
      { factor: "Smooth acceleration", impact: 4, detail: "Gentle starts on most trips" },
    ],
    smoothStreak: 3,
    lifestyleTags: ["commuter", "weekend Dallas trips"],
    topDestinations: [
      { label: "Round Rock", trips: 38, lngLat: [-97.6789, 30.5083] },
      { label: "Dallas", trips: 4, lngLat: [-96.797, 32.7767] },
      { label: "Mueller", trips: 9, lngLat: [-97.7055, 30.2985] },
    ],
    categoryMiles: { commute: 3150, errand: 210, childcare: 0, "road-trip": 1560, trailhead: 0, other: 430 },
  },
  garcia: {
    scoreFactors: [
      { factor: "Smooth braking", impact: 5, detail: "Very few hard stops" },
      { factor: "Daytime driving", impact: 3, detail: "98% of miles in daylight" },
      { factor: "Short trips", impact: -2, detail: "Many sub-5-mile runs" },
    ],
    smoothStreak: 14,
    lifestyleTags: ["family", "camping 2×/yr"],
    topDestinations: [
      { label: "Daycare (Hyde Park)", trips: 52, lngLat: [-97.7299, 30.3155] },
      { label: "Big Bend NP", trips: 1, lngLat: [-103.206, 29.328] },
    ],
    categoryMiles: { commute: 0, errand: 420, childcare: 610, "road-trip": 860, trailhead: 0, other: 0 },
  },
  jordan: {
    scoreFactors: [
      { factor: "Late-night driving", impact: -11, detail: "41% of miles after 11 pm" },
      { factor: "Hard braking", impact: -9, detail: "3.1 hard brakes per trip" },
      { factor: "Speeding", impact: -6, detail: "12% of miles over the limit" },
    ],
    smoothStreak: 0,
    lifestyleTags: ["night-driver", "city"],
    topDestinations: [
      { label: "Galleria area", trips: 21, lngLat: [-95.4613, 29.739] },
      { label: "UH campus", trips: 30, lngLat: [-95.3422, 29.7199] },
    ],
    categoryMiles: { commute: 900, errand: 520, childcare: 0, "road-trip": 0, trailhead: 0, other: 920 },
  },
  raj: {
    scoreFactors: [
      { factor: "Highway cruising", impact: 6, detail: "Steady speeds on long drives" },
      { factor: "Harsh cornering", impact: -4, detail: "Ranch roads near trailheads" },
      { factor: "Speeding", impact: -2, detail: "2% of miles over the limit" },
    ],
    smoothStreak: 9,
    lifestyleTags: ["road-tripper", "off-road"],
    topDestinations: [
      { label: "Big Bend NP", trips: 2, lngLat: [-103.206, 29.328] },
      { label: "Pedernales Falls", trips: 6, lngLat: [-98.2577, 30.3082] },
      { label: "Enchanted Rock", trips: 3, lngLat: [-98.8197, 30.4961] },
    ],
    categoryMiles: { commute: 820, errand: 140, childcare: 0, "road-trip": 1340, trailhead: 850, other: 0 },
  },
};

function monthsTrail(avg: number, seed: number) {
  const months = ["May", "Jun", "Jul", "Aug", "Sep", "Oct"];
  const rand = mulberry32(seed);
  return months.map((m) => ({ month: m, miles: Math.round(avg * (0.86 + rand() * 0.28)) }));
}

export function mockDriving(id: PersonaId): DrivingSummary {
  const base = mockDrivingBase[id];
  const ex = drivingExtras[id];
  const monthly = monthsTrail(base.avgMonthlyMiles, id.charCodeAt(1) * 31);
  return {
    windowDays: 90,
    totalMiles: base.avgMonthlyMiles * 3,
    avgMonthlyMiles: base.avgMonthlyMiles,
    monthlyMiles: monthly,
    categoryMiles: ex.categoryMiles,
    topDestinations: ex.topDestinations,
    score: base.score,
    scoreFactors: ex.scoreFactors,
    smoothStreak: ex.smoothStreak,
    lifestyleTags: ex.lifestyleTags,
  };
}

const cashflows: Record<PersonaId, CashflowSummary> = {
  maya: { payday: "semimonthly-1-15", avgBalance: 3400, paymentDueDay: 18, latePaymentsLast12: 0, recurringShortfall: false },
  garcia: { payday: "semimonthly-1-15", avgBalance: 2600, paymentDueDay: 18, latePaymentsLast12: 0, recurringShortfall: false },
  jordan: { payday: "biweekly-fri", avgBalance: 560, paymentDueDay: 3, latePaymentsLast12: 2, recurringShortfall: false },
  raj: { payday: "biweekly-fri", avgBalance: 6200, paymentDueDay: 18, latePaymentsLast12: 0, recurringShortfall: false },
};

const rankPlan: Record<PersonaId, string[]> = {
  maya: ["lease-end:buyout", "insurance:ubi", "protection:extended"],
  garcia: ["payment:refinance", "protection:extended", "insurance:ubi"],
  jordan: ["insurance:ubi-coached", "payment:due-date", "payment:refinance"],
  raj: ["lease-end:upgrade", "protection:tire-wheel", "insurance:ubi"],
};

const insights: Record<PersonaId, TripInsight[]> = {
  maya: [
    { id: "maya-i1", text: "You've driven to Dallas 4 times this quarter, about 1,560 miles of your lease allowance.", relatedMove: "lease-end" },
    { id: "maya-i2", text: "Your worst trip this month was an I-35 evening commute: 2 hard brakes near 51st St.", relatedMove: "insurance", relatedTripId: "maya-trip-showcase-i35" },
  ],
  garcia: [
    { id: "garcia-i1", text: "The hybrid saved you about $214 in fuel over 90 days vs a comparable gas SUV." },
    { id: "garcia-i2", text: "14 smooth trips in a row: daycare runs are your best driving.", relatedMove: "insurance" },
  ],
  jordan: [
    { id: "jordan-i1", text: "41% of your miles are after 11 pm. Shifting a few trips earlier lifts your score fastest.", relatedMove: "insurance", relatedTripId: "jordan-trip-showcase-night" },
    { id: "jordan-i2", text: "Your payment is due the 3rd but payday lands on Fridays; two late fees this year.", relatedMove: "payment" },
  ],
  raj: [
    { id: "raj-i1", text: "6 trailhead trips this quarter: 18% of your miles are on unpaved or ranch roads.", relatedMove: "protection" },
    { id: "raj-i2", text: "You're on pace to finish the lease about 26,000 miles under the allowance.", relatedMove: "lease-end", relatedTripId: "raj-trip-showcase-bigbend" },
  ],
};

export function mockDashboard(
  id: PersonaId,
  runtime: { preferences?: Preferences; consent?: Persona["consent"] } = {},
): DashboardData {
  const base = mockPersonas[id];
  const persona: Persona = {
    ...base,
    consent: runtime.consent ?? base.consent,
    preferences: runtime.preferences ?? base.preferences,
  };
  const engines = mockEngines(persona);
  const prefs = persona.preferences;
  const dismissed = new Set(prefs.dismissed.map((d) => d.optionId));
  const ranked: RankedMove[] = rankPlan[id]
    .filter((oid) => !dismissed.has(oid))
    .filter((oid) => !prefs.suppressedMoveTypes.includes(oid.split(":")[0] as never))
    .map((oid, i) => ({
      rank: i + 1,
      optionId: oid,
      moveType: oid.split(":")[0] as RankedMove["moveType"],
      score: Math.round((0.92 - i * 0.17) * 100) / 100,
      breakdown: { impact: 0.9 - i * 0.15, preferenceFit: 0.8 - i * 0.1, urgency: i === 0 ? 1.2 : 1, confidence: 0.9 },
    }));
  const driving = mockDriving(id);
  return {
    persona,
    driving: persona.consent.driving ? driving : { ...driving, scoreFactors: [], topDestinations: [], lifestyleTags: [] },
    cashflow: persona.consent.banking ? cashflows[id] : null,
    engines,
    ranked,
    tripInsights: persona.consent.driving ? insights[id] : [],
    trips: persona.consent.driving ? mockTripRows(id) : [],
    preferences: prefs,
  };
}
