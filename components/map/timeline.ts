// Pure helpers for trip playback: sampling position/bearing/speed at a trip time,
// colored route segments, lighting presets and event bookkeeping. No DOM, no map.
import type { Trip, TripEvent, TripEventType } from "@/lib/types";

export type LightPreset = "dawn" | "day" | "dusk" | "night";
export type LngLat = [number, number];

const R = 6371008.8; // earth radius, meters
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function distanceM(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearingDeg(a: LngLat, b: LngLat): number {
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]));
  const x = Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) - Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Point `meters` away from `p` along compass `bearing`. */
export function offsetLngLat(p: LngLat, bearing: number, meters: number): LngLat {
  const br = toRad(bearing);
  const lat1 = toRad(p[1]);
  const lng1 = toRad(p[0]);
  const d = meters / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lng2 = lng1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [toDeg(lng2), toDeg(lat2)];
}

export const mix = (a: number, b: number, t: number) => a * (1 - Math.min(1, Math.max(0, t))) + b * Math.min(1, Math.max(0, t));

/** Shortest-path angle interpolation in degrees. */
export function mixAngle(a: number, b: number, t: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return (a + d * Math.min(1, Math.max(0, t)) + 360) % 360;
}

export interface TripSample {
  lngLat: LngLat;
  bearing: number;
  speedMph: number;
  miles: number; // traveled so far
  fraction: number; // 0..1 of route distance (for line-trim)
  index: number;
}

export interface Timeline {
  trip: Trip;
  duration: number; // seconds
  coords: LngLat[];
  times: number[];
  cumDist: number[]; // meters
  totalDist: number;
  segSpeedMph: number[]; // smoothed speed per segment
  events: TripEvent[]; // sorted, includes speeding markers
  sample(t: number): TripSample;
  timeAtFraction(f: number): number;
}

export function buildTimeline(trip: Trip): Timeline {
  // Drop duplicate consecutive points (zero length segments break bearings).
  const pts = trip.path.filter((p, i, arr) => i === 0 || p[0] !== arr[i - 1][0] || p[1] !== arr[i - 1][1] || p[2] !== arr[i - 1][2]);
  if (pts.length < 2) {
    const p = pts[0] ?? [-97.7431, 30.2672, 0];
    pts.splice(0, pts.length, p, [p[0] + 0.0001, p[1], (p[2] ?? 0) + 1]);
  }
  const coords = pts.map((p) => [p[0], p[1]] as LngLat);
  const times = pts.map((p) => p[2]);
  const cumDist = [0];
  for (let i = 1; i < coords.length; i++) cumDist.push(cumDist[i - 1] + distanceM(coords[i - 1], coords[i]));
  const totalDist = cumDist[cumDist.length - 1] || 1;
  const duration = Math.max(1, times[times.length - 1] - times[0]);
  const t0 = times[0];

  const rawSpeed: number[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const dt = Math.max(0.5, times[i + 1] - times[i]);
    rawSpeed.push(((cumDist[i + 1] - cumDist[i]) / dt) * 2.23694);
  }
  // 5-tap moving average so the HUD doesn't flicker.
  const segSpeedMph = rawSpeed.map((_, i) => {
    let s = 0, n = 0;
    for (let k = -2; k <= 2; k++) {
      const v = rawSpeed[i + k];
      if (v !== undefined) { s += v; n++; }
    }
    return Math.min(95, s / n);
  });

  // Bearing per segment, looking a little ahead (~25 m) so corners read naturally.
  const segBearing: number[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    let j = i + 1;
    while (j < coords.length - 1 && cumDist[j] - cumDist[i] < 25) j++;
    segBearing.push(bearingDeg(coords[i], coords[j]));
  }

  const events = [...trip.events].sort((a, b) => a.t - b.t);

  let cursor = 0;
  function findSeg(t: number) {
    const tt = t + t0;
    if (tt <= times[0]) return 0;
    if (tt >= times[times.length - 1]) return times.length - 2;
    if (times[cursor] > tt) cursor = 0;
    while (cursor < times.length - 2 && times[cursor + 1] < tt) cursor++;
    return cursor;
  }

  function sample(t: number): TripSample {
    const i = findSeg(t);
    const ta = times[i], tb = times[i + 1];
    const f = tb === ta ? 0 : Math.min(1, Math.max(0, (t + t0 - ta) / (tb - ta)));
    const a = coords[i], b = coords[i + 1];
    const d = cumDist[i] + (cumDist[i + 1] - cumDist[i]) * f;
    return {
      lngLat: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f],
      bearing: segBearing[i],
      speedMph: segSpeedMph[i],
      miles: d / 1609.344,
      fraction: d / totalDist,
      index: i,
    };
  }

  function timeAtFraction(fr: number): number {
    const target = Math.min(1, Math.max(0, fr)) * totalDist;
    let i = 0;
    while (i < cumDist.length - 2 && cumDist[i + 1] < target) i++;
    const seg = cumDist[i + 1] - cumDist[i] || 1;
    const f = (target - cumDist[i]) / seg;
    return times[i] + (times[i + 1] - times[i]) * f - t0;
  }

  return { trip, duration, coords, times, cumDist, totalDist, segSpeedMph, events, sample, timeAtFraction };
}

/** Trip-local hour (personas live in Texas, so use America/Chicago regardless of the viewer's TZ). */
export function localHour(iso: string, offsetSeconds = 0): number {
  const d = new Date(new Date(iso).getTime() + offsetSeconds * 1000);
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(d);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 12) % 24;
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return h + m / 60;
  } catch {
    return d.getHours() + d.getMinutes() / 60;
  }
}

export function lightPresetForHour(h: number): LightPreset {
  if (h >= 5.5 && h < 7.5) return "dawn";
  if (h >= 7.5 && h < 17.75) return "day";
  if (h >= 17.75 && h < 19.75) return "dusk";
  return "night";
}

export function formatClock(iso: string, offsetSeconds = 0): string {
  const d = new Date(new Date(iso).getTime() + offsetSeconds * 1000);
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).format(d);
  } catch {
    return d.toLocaleTimeString();
  }
}

export function formatElapsed(s: number): string {
  const sec = Math.max(0, Math.round(s));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = String(sec % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export const EVENT_STYLE: Record<TripEventType, { label: string; color: string; short: string }> = {
  "hard-brake": { label: "Hard brake", color: "#FF3B4E", short: "Brake" },
  "fast-accel": { label: "Fast acceleration", color: "#FFB020", short: "Accel" },
  "harsh-corner": { label: "Harsh corner", color: "#C77DFF", short: "Corner" },
  "speeding-start": { label: "Speeding", color: "#FF8A1F", short: "Speed" },
  "speeding-end": { label: "Back under the limit", color: "#FF8A1F", short: "Speed" },
};

export const ROUTE_COLORS = {
  normal: "#4FD1FF",
  speeding: "#FF8A1F",
  ghost: "rgba(255,255,255,0.22)",
};

/** Speeding intervals in trip seconds, paired from speeding-start / speeding-end events. */
export function speedingIntervals(events: TripEvent[], duration: number): [number, number][] {
  const out: [number, number][] = [];
  let open: number | null = null;
  for (const e of events) {
    if (e.type === "speeding-start") open = e.t;
    if (e.type === "speeding-end") {
      out.push([open ?? Math.max(0, e.t - 60), e.t]);
      open = null;
    }
  }
  if (open !== null) out.push([open, duration]);
  return out;
}

/**
 * `line-gradient` expression over line-progress (distance fraction) that colors speeding
 * stretches orange and the rest cyan.
 */
export function routeGradient(tl: Timeline): unknown[] {
  const stops: [number, string][] = [[0, ROUTE_COLORS.normal]];
  const eps = 0.0005;
  for (const [a, b] of speedingIntervals(tl.events, tl.duration)) {
    const fa = tl.sample(a).fraction;
    const fb = tl.sample(b).fraction;
    if (fb <= fa) continue;
    stops.push([Math.max(eps, fa - eps), ROUTE_COLORS.normal], [fa + eps, ROUTE_COLORS.speeding], [Math.max(fa + 2 * eps, fb - eps), ROUTE_COLORS.speeding], [Math.min(1, fb + eps), ROUTE_COLORS.normal]);
  }
  stops.push([1, ROUTE_COLORS.normal]);
  // Interpolate requires strictly ascending stops.
  const clean: [number, string][] = [];
  for (const s of stops) if (!clean.length || s[0] > clean[clean.length - 1][0]) clean.push(s);
  return ["interpolate", ["linear"], ["line-progress"], ...clean.flat()];
}

/** Sum of score deltas for events reached by trip time t. */
export function scoreDeltaAt(events: TripEvent[], t: number): number {
  let s = 0;
  for (const e of events) if (e.t <= t) s += e.scoreDelta;
  return s;
}

/** Events that get a callout (speeding-start is announced with the end's score delta). */
const pts = (n: number) => {
  const v = Math.round(Math.abs(n) * 10) / 10;
  return `${n < 0 ? "−" : n > 0 ? "+" : ""}${v} score pt${v === 1 ? "" : "s"}`;
};

export function calloutText(e: TripEvent, events: TripEvent[]): string {
  const st = EVENT_STYLE[e.type];
  let delta = e.scoreDelta;
  if (e.type === "speeding-start") {
    const end = events.find((x) => x.type === "speeding-end" && x.t > e.t);
    delta = end?.scoreDelta ?? 0;
    return `${st.label}, ${delta ? pts(delta) : "watch the limit"}`;
  }
  if (e.type === "speeding-end") return `${st.label}, ${e.scoreDelta ? `${pts(e.scoreDelta)} for the stretch` : "nice"}`;
  return `${st.label}, ${pts(delta)}`;
}
