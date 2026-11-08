"use client";

// Hosts task 04's <TripHeatmap/> (deck.gl trails). It needs paths, so this slot fetches every
// listed trip (small simplified paths; showcase trips are full-res), cached per persona.
// While that loads, a 2D "where you drive" radar from topDestinations holds the space.

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { getTrip } from "@/lib/client/api";
import type { DrivingSummary, PersonaId, Trip } from "@/lib/types";

const TripHeatmap = dynamic(() => import("@/components/map/TripHeatmap"), { ssr: false, loading: () => null });

const tripCache = new Map<string, Promise<Trip[]>>();
function loadFullTrips(key: string, ids: string[]): Promise<Trip[]> {
  let p = tripCache.get(key);
  if (!p) {
    p = (async () => {
      const out: Trip[] = [];
      const queue = [...ids];
      await Promise.all(
        Array.from({ length: 8 }, async () => {
          while (queue.length) {
            const id = queue.shift()!;
            try {
              out.push(await getTrip(id));
            } catch {
              /* skip missing trip */
            }
          }
        }),
      );
      return out;
    })();
    tripCache.set(key, p);
  }
  return p;
}

type TripRow = Omit<Trip, "path" | "events">;

const CITY_CENTER: Record<string, [number, number]> = {
  Austin: [-97.7431, 30.2672],
  Houston: [-95.3698, 29.7604],
};

function milesBetween(a: [number, number], b: [number, number]) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

/**
 * Polar "radar" of where you drive: home at the center, true compass bearing, distance on a
 * square-root scale so the daily 10-mile places and the 400-mile road trip both stay readable.
 */
function Constellation({ destinations, city }: { destinations: DrivingSummary["topDestinations"]; city: string }) {
  const home = CITY_CENTER[city] ?? destinations[0]?.lngLat ?? [-97.74, 30.27];
  const W = 800;
  const H = 260;
  const cx = W / 2;
  const cy = H / 2 + 6;
  const RX = 330;
  const RY = 104;
  const MIN = 0.2;
  const atHome = destinations.filter((d) => milesBetween(home, d.lngLat) < 3);
  const away = destinations.filter((d) => milesBetween(home, d.lngLat) >= 3);
  const maxD = Math.max(20, ...away.map((d) => milesBetween(home, d.lngLat)));
  const r = (mi: number) => MIN + (1 - MIN) * Math.sqrt(mi / maxD);
  const place = (d: { lngLat: [number, number] }) => {
    const mi = milesBetween(home, d.lngLat);
    const ang = Math.atan2((d.lngLat[1] - home[1]) * 1.0, (d.lngLat[0] - home[0]) * Math.cos((home[1] * Math.PI) / 180));
    return { x: cx + Math.cos(ang) * r(mi) * RX, y: cy - Math.sin(ang) * r(mi) * RY, mi };
  };
  const maxTrips = Math.max(...destinations.map((d) => d.trips), 1);
  const rings = [10, 50, 200, 500].filter((m) => m < maxD * 1.05);
  const homeTrips = atHome.reduce((a, d) => a + d.trips, 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label={`Where you drive from ${city}: ${destinations.map((d) => `${d.label}, ${d.trips} trips`).join("; ")}`}>
      {rings.map((m) => (
        <g key={m}>
          <ellipse cx={cx} cy={cy} rx={r(m) * RX} ry={r(m) * RY} fill="none" stroke="var(--line)" strokeDasharray="2 5" />
          <text x={cx + r(m) * RX - 4} y={cy - 6} textAnchor="end" fill="var(--ink-3)" fontSize="10">
            {m} mi
          </text>
        </g>
      ))}
      {away.map((d) => {
        const p = place(d);
        const w = 1 + (d.trips / maxTrips) * 3.5;
        const right = p.x >= cx;
        return (
          <g key={d.label}>
            <line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--ink-2)" strokeOpacity={0.5} strokeWidth={w} strokeLinecap="round" />
            <circle cx={p.x} cy={p.y} r={4 + (d.trips / maxTrips) * 5} fill="var(--ink)" />
            <text x={p.x + (right ? 14 : -14)} y={p.y - 1} textAnchor={right ? "start" : "end"} fill="var(--ink)" fontSize="13" fontWeight={500}>
              {d.label.replace(new RegExp(`^${city}\\s+`), "")}
            </text>
            <text x={p.x + (right ? 14 : -14)} y={p.y + 15} textAnchor={right ? "start" : "end"} fill="var(--ink-3)" fontSize="11">
              {d.trips} {d.trips === 1 ? "trip" : "trips"}, {Math.round(p.mi)} mi
            </text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={16} fill="none" stroke="var(--accent)" strokeOpacity={0.35} />
      <circle cx={cx} cy={cy} r={7} fill="var(--accent)" />
      <text x={cx} y={cy + 32} textAnchor="middle" fill="var(--ink-2)" fontSize="12" fontWeight={500}>
        {city}
        {homeTrips ? `, ${homeTrips} trips` : ""}
      </text>
    </svg>
  );
}

export function TripHeatmapSlot({
  trips,
  onSelectTrip,
  topDestinations,
  city,
}: {
  trips: TripRow[];
  onSelectTrip: (id: string) => void;
  topDestinations: DrivingSummary["topDestinations"];
  city: string;
}) {
  const [full, setFull] = useState<{ key: string; trips: Trip[] } | null>(null);
  const personaId = (trips[0]?.personaId ?? "none") as PersonaId | "none";
  const key = `${personaId}:${trips.length}`;
  useEffect(() => {
    if (!trips.length) return;
    let alive = true;
    loadFullTrips(key, trips.map((t) => t.id)).then((t) => alive && setFull({ key, trips: t }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const ready = full && full.key === key && full.trips.length > 0;
  return (
    <div className="relative h-[260px] overflow-hidden rounded-lg border border-line bg-[var(--glass-hi)] sm:h-[340px]">
      {ready ? (
        <TripHeatmap trips={trips} fullTrips={full.trips} onSelectTrip={onSelectTrip} className="absolute inset-0 h-full w-full" />
      ) : (
        <Constellation destinations={topDestinations} city={city} />
      )}
    </div>
  );
}
