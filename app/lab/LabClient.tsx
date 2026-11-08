"use client";
// Task 04 sandbox: mounts HeroCar / RideReplay / TripHeatmap with real data (API) or fixtures.
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useUiStore } from "@/lib/client/ui-store";
import type { Hotspot, MoveOption, PersonaId, Trip, Vehicle } from "@/lib/types";
import { FIXTURE_TRIP } from "@/components/map/fixtures";
import maya from "@/data/personas/maya.json";
import garcia from "@/data/personas/garcia.json";
import jordan from "@/data/personas/jordan.json";
import raj from "@/data/personas/raj.json";
import nora from "@/data/personas/nora.json";
import eli from "@/data/personas/eli.json";
import ava from "@/data/personas/ava.json";
import ryan from "@/data/personas/ryan.json";
import devon from "@/data/personas/devon.json";
import priya from "@/data/personas/priya.json";
import theo from "@/data/personas/theo.json";

const RideReplay = dynamic(() => import("@/components/map/RideReplay"), { ssr: false });
const HeroCar = dynamic(() => import("@/components/three/HeroCar"), { ssr: false });
const TripHeatmap = dynamic(() => import("@/components/map/TripHeatmap"), { ssr: false });

type Tab = "replay" | "car" | "heatmap";
const VEHICLES: Record<PersonaId, Vehicle> = {
  maya: maya.vehicle as Vehicle,
  garcia: garcia.vehicle as Vehicle,
  jordan: jordan.vehicle as Vehicle,
  raj: raj.vehicle as Vehicle,
  nora: nora.vehicle as Vehicle,
  eli: eli.vehicle as Vehicle,
  ava: ava.vehicle as Vehicle,
  theo: theo.vehicle as Vehicle,
  ryan: ryan.vehicle as Vehicle,
  devon: devon.vehicle as Vehicle,
  priya: priya.vehicle as Vehicle,
};
const UPGRADES: Partial<Record<PersonaId, NonNullable<MoveOption["upgradeModel"]>>> = {
  raj: { name: "4Runner TRD Off-Road", modelAsset: "/models/4runner.glb", bodyStyle: "suv" },
  garcia: { name: "Highlander Hybrid", modelAsset: "/models/highlander.glb", bodyStyle: "suv" },
};
const TRIPS = [
  { id: "maya-001", label: "Maya · Round Rock commute" },
  { id: "fixture-maya-commute", label: "Fixture · Maya I-35 (dusk)" },
  { id: "jordan-001", label: "Jordan · night, 7 events" },
  { id: "garcia-001", label: "Garcias · daycare" },
  { id: "raj-008", label: "Raj · Enchanted Rock" },
  { id: "raj-018", label: "Raj · Big Bend road trip" },
  { id: "nora-001", label: "Nora · Boerne errand run" },
  { id: "eli-001", label: "Eli · San Juan workshop commute" },
  { id: "ava-001", label: "Ava · Dallas commute" },
  { id: "theo-001", label: "Theo · Fort Worth commute" },
  { id: "ryan-001", label: "Ryan · Richardson to Plano commute" },
  { id: "devon-001", label: "Devon · Dallas studio commute" },
  { id: "priya-001", label: "Priya · Plano to Dallas commute" },
];
const PERSONAS: PersonaId[] = ["maya", "garcia", "jordan", "raj", "nora", "eli", "ava", "theo", "ryan", "devon", "priya"];

export default function LabClient() {
  const [tab, setTab] = useState<Tab>("replay");
  const [open, setOpen] = useState(true);
  const [tripId, setTripId] = useState(TRIPS[0].id);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [persona, setPersona] = useState<PersonaId>("maya");
  const [preview, setPreview] = useState(false);
  const [heatTrips, setHeatTrips] = useState<Trip[]>([]);
  const reducedMotion = useUiStore((s) => s.reducedMotion);
  const setReducedMotion = useUiStore((s) => s.setReducedMotion);
  const dispatch = useUiStore((s) => s.dispatchUiAction);
  const activeHotspot = useUiStore((s) => s.activeHotspot);
  const [provider] = useState<"mapbox" | "maplibre" | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const p = new URLSearchParams(window.location.search).get("provider");
    return p === "maplibre" || p === "mapbox" ? p : undefined;
  });

  useEffect(() => {
    if (tripId === FIXTURE_TRIP.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sandbox: fixture needs no fetch
      setTrip(FIXTURE_TRIP);
      return;
    }
    let off = false;
    fetch(`/api/trips/${tripId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((t: Trip) => !off && setTrip(t))
      .catch(() => !off && setTrip(FIXTURE_TRIP));
    return () => {
      off = true;
    };
  }, [tripId]);

  useEffect(() => {
    if (tab !== "heatmap" || heatTrips.length) return;
    // Full showcase trips for the heatmap demo (list view has no paths).
    Promise.all(["maya-001", "maya-018", "raj-003", "raj-008", "raj-018", "garcia-055", "garcia-001"].map((id) => fetch(`/api/trips/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null))).then((ts) =>
      setHeatTrips(ts.filter(Boolean) as Trip[]),
    );
  }, [tab, heatTrips.length]);

  const vehicle = VEHICLES[persona];
  const upgrade = preview ? UPGRADES[persona] : undefined;
  const hotspotLabels = useMemo<Partial<Record<Hotspot, string>>>(
    () => (persona === "maya" ? { odometer: "41,200 mi · ~4,000 over allowance", "driver-seat": "Drive score 84" } : {}),
    [persona],
  );

  return (
    <main className="min-h-screen bg-[#05070c] px-4 py-5 text-white sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="mr-auto text-lg font-semibold tracking-tight">
            3D Lab <span className="text-white/40">· task 04 sandbox</span>
          </h1>
          <nav className="flex rounded-full border border-white/10 bg-white/5 p-0.5 text-sm" aria-label="Lab sections">
            {(["replay", "car", "heatmap"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-full px-3 py-1.5 capitalize ${tab === t ? "bg-white text-black" : "text-white/70"}`}>
                {t}
              </button>
            ))}
          </nav>
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input type="checkbox" checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} /> Reduced motion
          </label>
        </header>

        {tab === "replay" && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select value={tripId} onChange={(e) => setTripId(e.target.value)} className="rounded-full border border-white/15 bg-black px-3 py-1.5" aria-label="Trip">
                {TRIPS.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              <button className="rounded-full border border-white/15 px-3 py-1.5" onClick={() => setOpen((v) => !v)}>{open ? "Unmount" : "Mount"} replay</button>
              <button
                className="rounded-full border border-white/15 px-3 py-1.5"
                onClick={() => {
                  if (!trip) return;
                  const ev = trip.events.find((e) => e.type === "hard-brake") ?? trip.events[0];
                  setOpen(true);
                  dispatch({ kind: "open_trip_replay", tripId: trip.id, focusEventT: ev?.t });
                }}
              >
                Agent: jump to first hard brake
              </button>
            </div>
            <div className="h-[72vh] min-h-[460px]">{open && trip && <RideReplay key={`${trip.id}-${provider ?? "env"}`} trip={trip} provider={provider} onClose={() => setOpen(false)} />}</div>
          </section>
        )}

        {tab === "car" && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {PERSONAS.map((p) => (
                <button key={p} onClick={() => { setPersona(p); setPreview(false); }} className={`rounded-full border px-3 py-1.5 capitalize ${persona === p ? "border-white bg-white text-black" : "border-white/15"}`}>
                  {p}
                </button>
              ))}
              <button disabled={!UPGRADES[persona]} onClick={() => setPreview((v) => !v)} className="rounded-full border border-white/15 px-3 py-1.5 disabled:opacity-40">
                {preview ? "Hide" : "Show"} upgrade preview
              </button>
              {(["odometer", "tires", "engine", "driver-seat"] as Hotspot[]).map((h) => (
                <button key={h} onClick={() => dispatch({ kind: "focus_vehicle_hotspot", hotspot: h })} className="rounded-full border border-white/15 px-3 py-1.5">
                  Agent: {h}
                </button>
              ))}
              <span className="text-white/40">active: {activeHotspot ?? "none"}</span>
            </div>
            <div className="h-[62vh] min-h-[380px]">
              <HeroCar vehicle={vehicle} upgradePreview={upgrade} hotspotLabels={hotspotLabels} />
            </div>
          </section>
        )}

        {tab === "heatmap" && (
          <section className="space-y-3">
            <p className="text-xs text-white/50">{heatTrips.length} trips loaded</p>
            <div className="h-[68vh] min-h-[420px]">
              <TripHeatmap trips={heatTrips} fullTrips={heatTrips} onSelectTrip={(id) => { setTripId(id); setTab("replay"); setOpen(true); }} />
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
