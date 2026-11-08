"use client";
// Overview of all trips as animated, category-colored trails (deck.gl TripsLayer on MapboxOverlay).
// Hover → glowing route + tooltip, click → onSelectTrip(id). Mount with next/dynamic({ ssr: false }).
import "mapbox-gl/dist/mapbox-gl.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { useShouldReduceMotion } from "@animate-ui/react/utils/motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { TripsLayer } from "@deck.gl/geo-layers";
import { PathLayer } from "@deck.gl/layers";
import type { Trip, TripCategory } from "@/lib/types";
import { useUiStore } from "@/lib/client/ui-store";
import { chosenProvider, mapboxToken, webglAvailable } from "./provider";

export interface TripHeatmapProps {
  trips: Omit<Trip, "path" | "events">[];
  fullTrips?: Trip[];
  onSelectTrip(id: string): void;
  className?: string;
}

export const CATEGORY_COLORS: Record<TripCategory, [number, number, number]> = {
  commute: [79, 209, 255],
  errand: [167, 139, 250],
  childcare: [244, 114, 182],
  "road-trip": [255, 138, 31],
  trailhead: [52, 211, 153],
  other: [203, 213, 225],
};
const LOOP = 100; // normalized time units per animation loop
const TRAIL = 38;
const LOOP_SECONDS = 9;

interface Row {
  id: string;
  category: TripCategory;
  label: string;
  miles: number;
  score: number;
  start: string;
  path: [number, number][];
  timestamps: number[];
}

type AnyMap = {
  addControl(c: unknown): unknown;
  removeControl(c: unknown): unknown;
  fitBounds(b: [[number, number], [number, number]], o: Record<string, unknown>): unknown;
  on(ev: string, cb: (...a: unknown[]) => void): unknown;
  remove(): void;
  resize(): void;
  getCanvas(): HTMLCanvasElement;
  setConfigProperty?(a: string, b: string, c: unknown): unknown;
};

export default function TripHeatmap({ trips, fullTrips, onSelectTrip, className }: TripHeatmapProps) {
  const reducedMotion = useShouldReduceMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AnyMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const hoverRef = useRef<string | null>(null);
  const wakeRef = useRef<() => void>(() => {});
  const [hovered, setHovered] = useState<Row | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [hidden, setHidden] = useState<Set<TripCategory>>(new Set());
  const st = useRef({ visible: true, t: 0, reduced: reducedMotion });
  useEffect(() => {
    st.current.reduced = reducedMotion;
  }, [reducedMotion]);

  const rows = useMemo<Row[]>(() => {
    const byId = new Map((fullTrips ?? []).map((t) => [t.id, t]));
    const list = trips.length ? trips : fullTrips ?? [];
    return list
      .map((meta) => {
        const full = byId.get(meta.id) ?? ("path" in meta ? (meta as Trip) : undefined);
        if (!full || full.path.length < 2) return null;
        const dur = Math.max(1, full.path[full.path.length - 1][2] - full.path[0][2]);
        const t0 = full.path[0][2];
        return {
          id: meta.id,
          category: meta.category,
          label: meta.destinationLabel,
          miles: meta.miles,
          score: meta.score,
          start: meta.start,
          path: full.path.map((p) => [p[0], p[1]] as [number, number]),
          timestamps: full.path.map((p) => ((p[2] - t0) / dur) * LOOP),
        } satisfies Row;
      })
      .filter(Boolean) as Row[];
  }, [trips, fullTrips]);

  const visibleRows = useMemo(() => rows.filter((r) => !hidden.has(r.category)), [rows, hidden]);
  const counts = useMemo(() => {
    const c = {} as Record<TripCategory, number>;
    for (const r of rows) c[r.category] = (c[r.category] ?? 0) + 1;
    return c;
  }, [rows]);

  const bounds = useMemo<[[number, number], [number, number]] | null>(() => {
    if (!visibleRows.length) return null;
    let a = 180, b = 90, c = -180, d = -90;
    for (const r of visibleRows) for (const [x, y] of r.path) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
    return [[a, b], [c, d]];
  }, [visibleRows]);

  // Map lifecycle.
  useEffect(() => {
    const el = mapEl.current;
    if (!el) return;
    if (!webglAvailable()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off capability probe on mount
      setStatus("error");
      return;
    }
    let cancelled = false;
    let map: AnyMap | null = null;
    // Interleaved on Mapbox (true 3D occlusion); deck 9.4 interleaved breaks on MapLibre 6.
    const overlay = new MapboxOverlay({ interleaved: chosenProvider() === "mapbox", layers: [] });
    overlayRef.current = overlay;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __nmHeat?: unknown }).__nmHeat = overlay;
    el.replaceChildren();
    (async () => {
      try {
        if (chosenProvider() === "mapbox") {
          const mapboxgl = (await import("mapbox-gl")).default;
          mapboxgl.accessToken = mapboxToken();
          const m = new mapboxgl.Map({
            container: el,
            style: "mapbox://styles/mapbox/standard",
            center: [-97.74, 30.27],
            zoom: 6,
            pitch: 45,
            bearing: -12,
            projection: "mercator", // deck.gl interleaved layers don't render on the globe projection
            attributionControl: false,
            config: { basemap: { lightPreset: "dusk", showPointOfInterestLabels: false, showTransitLabels: false } },
          });
          m.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
          map = m as unknown as AnyMap;
        } else {
          const maplibregl = await import("maplibre-gl");
          (await import("./maplibre-worker")).ensureMaplibreWorker();
          map = new maplibregl.Map({ container: el, style: "https://tiles.openfreemap.org/styles/liberty", center: [-97.74, 30.27], zoom: 6, pitch: 45, bearing: -12 }) as unknown as AnyMap;
        }
        if (cancelled) { map.remove(); return; }
        mapRef.current = map;
        map.on("load", () => {
          if (cancelled || !map) return;
          map.addControl(overlay);
          setStatus("ready");
        });
        map.on("error", (e) => {
          const msg = String((e as { error?: Error })?.error?.message ?? "");
          if (/401|403|style/i.test(msg) && !cancelled) setStatus("error");
        });
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      try { map?.removeControl(overlay); } catch { /* noop */ }
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Fit to trips when data or filters change.
  useEffect(() => {
    if (status !== "ready" || !bounds || !mapRef.current) return;
    mapRef.current.fitBounds(bounds, { padding: { top: 90, bottom: 70, left: 40, right: 40 }, pitch: 45, duration: st.current.reduced ? 0 : 1200, maxZoom: 12 });
  }, [status, bounds]);

  // Pause when off-screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      st.current.visible = e.isIntersecting;
      wakeRef.current();
    });
    io.observe(el);
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(el);
    return () => { io.disconnect(); ro.disconnect(); };
  }, []);

  // Animation loop: rebuild layers each frame (deck diffs props; data arrays are stable).
  useEffect(() => {
    if (status !== "ready") return;
    let raf = 0;
    let last = performance.now();
    const base = new PathLayer<Row>({
      id: "trip-base",
      data: visibleRows,
      getPath: (d) => d.path,
      getColor: (d) => [...CATEGORY_COLORS[d.category], 120],
      widthUnits: "pixels",
      getWidth: 2.5,
      capRounded: true,
      jointRounded: true,
      pickable: true,
      autoHighlight: false,
      onHover: (info) => {
        if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
        const r = (info.object as Row | undefined) ?? null;
        const id = r?.id ?? null;
        if (tipRef.current) {
          tipRef.current.style.transform = `translate(${info.x + 14}px, ${info.y + 14}px)`;
        }
        if (id !== hoverRef.current) {
          hoverRef.current = id;
          setHovered(r);
          const c = mapRef.current?.getCanvas();
          if (c) c.style.cursor = id ? "pointer" : "";
        }
      },
      onClick: (info) => {
        const r = info.object as Row | undefined;
        if (r) onSelectTrip(r.id);
      },
    });
    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // Paused while off-screen or while the 3D replay is open over the dashboard.
      if (!st.current.visible || document.hidden || useUiStore.getState().replay !== null) return;
      const reduced = st.current.reduced;
      st.current.t = reduced ? LOOP : (st.current.t + (dt * (LOOP + TRAIL)) / LOOP_SECONDS) % (LOOP + TRAIL);
      const hov = hoverRef.current ? visibleRows.find((r) => r.id === hoverRef.current) : undefined;
      overlayRef.current?.setProps({
        layers: [
          base,
          new TripsLayer<Row>({
            id: "trip-trails-glow",
            data: visibleRows,
            getPath: (d) => d.path,
            getTimestamps: (d) => d.timestamps,
            getColor: (d) => CATEGORY_COLORS[d.category],
            widthUnits: "pixels",
            getWidth: 14,
            capRounded: true,
            jointRounded: true,
            fadeTrail: !reduced,
            trailLength: reduced ? LOOP * 2 : TRAIL,
            currentTime: st.current.t,
            opacity: 0.22,
          }),
          new TripsLayer<Row>({
            id: "trip-trails",
            data: visibleRows,
            getPath: (d) => d.path,
            getTimestamps: (d) => d.timestamps,
            getColor: (d) => CATEGORY_COLORS[d.category],
            widthUnits: "pixels",
            getWidth: 5,
            capRounded: true,
            jointRounded: true,
            fadeTrail: !reduced,
            trailLength: reduced ? LOOP * 2 : TRAIL,
            currentTime: st.current.t,
            opacity: 0.95,
          }),
          ...(hov
            ? [
                new PathLayer<Row>({ id: "trip-hover-glow", data: [hov], getPath: (d) => d.path, getColor: [...CATEGORY_COLORS[hov.category], 90], widthUnits: "pixels", getWidth: 16, capRounded: true, jointRounded: true }),
                new PathLayer<Row>({ id: "trip-hover", data: [hov], getPath: (d) => d.path, getColor: [255, 255, 255, 240], widthUnits: "pixels", getWidth: 3, capRounded: true, jointRounded: true }),
              ]
            : []),
        ],
      });
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    const wake = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (st.current.visible && !document.hidden && useUiStore.getState().replay === null) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    wakeRef.current = wake;
    document.addEventListener("visibilitychange", wake);
    const unsubscribe = useUiStore.subscribe((next, previous) => {
      if (next.replay !== previous.replay) wake();
    });
    wake();
    return () => {
      cancelAnimationFrame(raf);
      wakeRef.current = () => {};
      document.removeEventListener("visibilitychange", wake);
      unsubscribe();
    };
  }, [status, visibleRows, onSelectTrip, reducedMotion, hovered]);

  const toggle = (c: TripCategory) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  return (
    <section ref={rootRef} className={`relative isolate h-full min-h-[360px] w-full overflow-hidden rounded-lg bg-[#07090f] text-white ${className ?? ""}`} aria-label="Map of all trips, colored by category">
      <div className="absolute inset-0">
        <div ref={mapEl} className="h-full w-full" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,7,12,0.55)_0%,rgba(5,7,12,0)_25%,rgba(5,7,12,0)_75%,rgba(5,7,12,0.55)_100%)]" />

      {status === "loading" && <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-2 text-sm text-white/75 backdrop-blur-md">Loading map…</p>}
      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          <div>
            <p className="mb-3 text-sm text-white/70">Map unavailable, pick a trip to replay</p>
            <ul className="flex max-w-md flex-wrap justify-center gap-2">
              {rows.map((r) => (
                <li key={r.id}><button onClick={() => onSelectTrip(r.id)} className="rounded-full border border-white/15 px-3 py-1.5 text-xs">{r.label}, {r.miles.toFixed(0)} mi</button></li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <header className="absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3 sm:p-4">
        <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-md">
          <p className="text-[11px] text-white/50">Places you&apos;ve been</p>
          <p className="text-sm font-semibold">{rows.length} trips, {Math.round(rows.reduce((s, r) => s + r.miles, 0)).toLocaleString("en-US")} mi</p>
        </div>
        <button
          type="button"
          onClick={() => bounds && mapRef.current?.fitBounds(bounds, { padding: 80, pitch: 45, bearing: -12, duration: reducedMotion ? 0 : 1000, maxZoom: 12 })}
          className="h-9 rounded-full border border-white/15 bg-black/40 px-3 text-xs font-medium text-white/85 backdrop-blur-md transition-[background-color] duration-200 ease-ui-color hover:bg-white/10"
        >
          Reset view
        </button>
      </header>

      <ul className="absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5 sm:bottom-4 sm:left-4" aria-label="Legend: trip categories (click to filter)">
        {(Object.keys(CATEGORY_COLORS) as TripCategory[]).filter((c) => counts[c]).map((c) => (
          <li key={c}>
            <button
              type="button"
              aria-pressed={!hidden.has(c)}
              onClick={() => toggle(c)}
              className={`flex h-8 items-center gap-1.5 rounded-full border border-white/12 bg-black/45 px-2.5 text-[11px] backdrop-blur-md transition-opacity duration-200 ease-ui-color ${hidden.has(c) ? "opacity-40" : ""}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: `rgb(${CATEGORY_COLORS[c].join(",")})`, boxShadow: `0 0 8px rgb(${CATEGORY_COLORS[c].join(",")})` }} />
              {(c.charAt(0).toUpperCase() + c.slice(1)).replace("-", " ")} <span className="text-white/45">{counts[c]}</span>
            </button>
          </li>
        ))}
      </ul>

      <div ref={tipRef} className={`pointer-events-none absolute left-0 top-0 z-10 transition-opacity duration-200 ease-ui-out ${hovered ? "opacity-100" : "opacity-0"}`}>
        {hovered && (
          <div className="rounded-lg border border-white/15 bg-black/70 px-3 py-2 text-xs shadow-2xl backdrop-blur-md">
            <p className="font-semibold">{hovered.label}</p>
            <p className="text-white/60">{(hovered.category.charAt(0).toUpperCase() + hovered.category.slice(1)).replace("-", " ")}, {hovered.miles.toFixed(1)} mi, score {hovered.score}</p>
            <p className="mt-0.5 text-white/45">Click to replay in 3D</p>
          </div>
        )}
      </div>
    </section>
  );
}
