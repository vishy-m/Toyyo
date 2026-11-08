// Map provider abstraction for the ride replay. Mapbox GL v3 (native model layer + free camera)
// is primary; MapLibre + OpenFreeMap + deck.gl ScenegraphLayer is the no-token fallback.
// Switch with NEXT_PUBLIC_MAP_PROVIDER=mapbox|maplibre (missing Mapbox token also falls back).
import type { TripEvent } from "@/lib/types";
import type { LightPreset, LngLat, Timeline } from "./timeline";

export type CameraMode = "chase" | "overhead" | "free";
export type ProviderName = "mapbox" | "maplibre";

export interface CarState {
  lngLat: LngLat;
  bearing: number;
  braking: number; // 0..1, drives brake-light glow
}

export interface ReplayMapInit {
  container: HTMLElement;
  timeline: Timeline;
  modelUrl: string;
  /** Model length in model units (Kenney ≈ 2.6) and the on-map length we want in meters. */
  modelUnitLength: number;
  displayLengthM: number;
  mapBearingOffset: number;
  paintHex: string;
  light: LightPreset;
  reducedMotion: boolean;
  /** User grabbed the camera (drag/rotate/zoom); the shell switches to Free mode. */
  onUserInteract(): void;
  onEventClick(e: TripEvent, index: number): void;
  onError(err: Error): void;
}

export interface ReplayMap {
  readonly provider: ProviderName;
  /** Resolves once the style, route and car are on the map. */
  ready: Promise<void>;
  setCar(car: CarState): void;
  /** Called every frame with the frame delta (s) and playback rate (× real time; faster pulls the camera back). Free mode leaves the camera alone. */
  setCamera(mode: CameraMode, car: CarState, dt: number, rate?: number): void;
  /** Snap the smoothed camera onto its target (seek / mode cut / reduced motion). */
  snapCamera(): void;
  setLight(preset: LightPreset): void;
  /** Traveled share of the route (distance fraction 0..1). */
  setTrail(fraction: number): void;
  /** Highlight (pulse) one event marker, or none. */
  highlightEvent(index: number | null): void;
  /** Fly to show the whole route. */
  overview(animate: boolean): void;
  /** Cinematic move from wherever the camera is to the chase position. */
  introTo(car: CarState, durationMs: number): Promise<void>;
  resize(): void;
  destroy(): void;
}

export function mapboxToken(): string {
  return process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
}

export function chosenProvider(): ProviderName {
  const p = (process.env.NEXT_PUBLIC_MAP_PROVIDER ?? "mapbox").toLowerCase();
  if (p === "maplibre") return "maplibre";
  return mapboxToken().startsWith("pk.") ? "mapbox" : "maplibre";
}

export async function createReplayMap(init: ReplayMapInit, provider: ProviderName = chosenProvider()): Promise<ReplayMap> {
  if (provider === "mapbox") {
    const { createMapboxReplay } = await import("./mapbox-replay");
    return createMapboxReplay(init);
  }
  const { createMaplibreReplay } = await import("./maplibre-replay");
  return createMaplibreReplay(init);
}

export function webglAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Event marker DOM (shared by both providers). Styling lives in replay.css. */
export function eventMarkerEl(e: TripEvent, color: string, label: string, onClick: () => void): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "nm-evt";
  el.style.setProperty("--evt", color);
  el.setAttribute("aria-label", `${label} at ${Math.round(e.t)} seconds`);
  el.innerHTML = `<span class="nm-evt-ring"></span><span class="nm-evt-dot"></span>`;
  el.addEventListener("click", (ev) => {
    ev.stopPropagation();
    onClick();
  });
  return el;
}
