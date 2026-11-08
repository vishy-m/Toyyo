"use client";
// 2D SVG route map used when WebGL or the map provider is unavailable.
import { useMemo } from "react";
import type { Trip } from "@/lib/types";
import { EVENT_STYLE, ROUTE_COLORS, speedingIntervals } from "./timeline";

export default function RouteFallback({ trip, reason, className }: { trip: Pick<Trip, "path" | "events" | "destinationLabel">; reason?: string; className?: string }) {
  const { d, speedD, pts, w, h, s0, s1 } = useMemo(() => {
    const w = 800, h = 500, pad = 40;
    const lngs = trip.path.map((p) => p[0]);
    const lats = trip.path.map((p) => p[1]);
    const minX = Math.min(...lngs), maxX = Math.max(...lngs), minY = Math.min(...lats), maxY = Math.max(...lats);
    const kx = Math.cos(((minY + maxY) / 2) * (Math.PI / 180));
    const sx = (w - 2 * pad) / Math.max(1e-6, (maxX - minX) * kx);
    const sy = (h - 2 * pad) / Math.max(1e-6, maxY - minY);
    const sc = Math.min(sx, sy);
    const ox = (w - (maxX - minX) * kx * sc) / 2, oy = (h - (maxY - minY) * sc) / 2;
    const proj = (lng: number, lat: number): [number, number] => [ox + (lng - minX) * kx * sc, h - oy - (lat - minY) * sc];
    const d = trip.path.map((p, i) => `${i ? "L" : "M"}${proj(p[0], p[1]).map((v) => v.toFixed(1)).join(",")}`).join("");
    const ints = speedingIntervals(trip.events, trip.path[trip.path.length - 1]?.[2] ?? 0);
    const speedD = ints
      .map(([a, b]) => trip.path.filter((p) => p[2] >= a && p[2] <= b).map((p, i) => `${i ? "L" : "M"}${proj(p[0], p[1]).join(",")}`).join(""))
      .join("");
    const pts = trip.events.filter((e) => e.type !== "speeding-end").map((e) => ({ e, xy: proj(e.lngLat[0], e.lngLat[1]) }));
    const s0 = trip.path[0] ? proj(trip.path[0][0], trip.path[0][1]) : null;
    const s1 = trip.path.length ? proj(trip.path[trip.path.length - 1][0], trip.path[trip.path.length - 1][1]) : null;
    return { d, speedD, pts, w, h, s0, s1 };
  }, [trip]);

  return (
    <div className={`relative flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,#1b2335,#07090f)] ${className ?? ""}`}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-full max-h-full w-full" role="img" aria-label={`2D route map to ${trip.destinationLabel}`}>
        <defs>
          <filter id="nm-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <path d={d} fill="none" stroke={ROUTE_COLORS.normal} strokeWidth={10} opacity={0.35} filter="url(#nm-glow)" />
        <path d={d} fill="none" stroke={ROUTE_COLORS.normal} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        {speedD && <path d={speedD} fill="none" stroke={ROUTE_COLORS.speeding} strokeWidth={5} strokeLinecap="round" />}
        {pts.map(({ e, xy }, i) => (
          <g key={i}>
            <circle cx={xy[0]} cy={xy[1]} r={11} fill={EVENT_STYLE[e.type].color} opacity={0.3} />
            <circle cx={xy[0]} cy={xy[1]} r={5} fill={EVENT_STYLE[e.type].color} stroke="#fff" strokeWidth={1.5}>
              <title>{`${EVENT_STYLE[e.type].label}: ${e.scoreDelta} pts`}</title>
            </circle>
          </g>
        ))}
        {s0 && <circle cx={s0[0]} cy={s0[1]} r={7} fill="#0b0f19" stroke="#fff" strokeWidth={3} />}
        {s1 && <circle cx={s1[0]} cy={s1[1]} r={7} fill="#fff" />}
      </svg>
      {reason && <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/70 backdrop-blur">{reason}</p>}
    </div>
  );
}
