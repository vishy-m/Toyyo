// MapLibre fallback (no token): OpenFreeMap "liberty" tiles, deck.gl ScenegraphLayer car via
// MapboxOverlay, jumpTo chase cam, progressively updated traveled-route source, CSS light tint.
import * as maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ensureMaplibreWorker } from "./maplibre-worker";
import { ScenegraphLayer } from "@deck.gl/mesh-layers";
import { EVENT_STYLE, ROUTE_COLORS, mixAngle, speedingIntervals, type LightPreset, type LngLat } from "./timeline";
import { eventMarkerEl, type CameraMode, type CarState, type ReplayMap, type ReplayMapInit } from "./provider";

const TINT: Record<LightPreset, string> = {
  dawn: "linear-gradient(180deg, rgba(255,170,120,0.18), rgba(40,30,80,0.18))",
  day: "transparent",
  dusk: "linear-gradient(180deg, rgba(255,120,60,0.22), rgba(20,20,60,0.38))",
  night: "linear-gradient(180deg, rgba(5,10,35,0.55), rgba(5,8,25,0.62))",
};

export function createMaplibreReplay(init: ReplayMapInit): ReplayMap {
  ensureMaplibreWorker();
  const { timeline: tl, container } = init;
  const first = tl.sample(0);
  container.replaceChildren(); // StrictMode remounts reuse the element
  const map = new maplibregl.Map({
    container,
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: first.lngLat,
    zoom: 12,
    pitch: 45,
    bearing: first.bearing,
    maxPitch: 75,
    attributionControl: { compact: true },
  });

  const tint = document.createElement("div");
  tint.className = "nm-tint";
  tint.style.background = TINT[init.light];
  container.appendChild(tint);

  // Non-interleaved: deck 9.4 interleaved mode throws on MapLibre 6 (transform API change).
  const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
  const modelUrl = new URL(init.modelUrl, window.location.origin).href;
  const sizeScale = init.displayLengthM / init.modelUnitLength;
  const cam = { bearing: first.bearing, center: first.lngLat as LngLat, zoom: 17, snap: true };
  const markers: { marker: maplibregl.Marker; el: HTMLElement }[] = [];
  let lastTrailIdx = -1;
  let destroyed = false;
  let introRunning = false;
  let lastHighlighted: number | null = null;

  const speeding = speedingIntervals(tl.events, tl.duration).map(([a, b]) => [tl.sample(a).index, tl.sample(b).index]);
  const isSpeedingIdx = (i: number) => speeding.some(([a, b]) => i >= a && i <= b);

  const ready = new Promise<void>((resolve, reject) => {
    map.on("error", (e) => {
      const msg = String((e as unknown as { error?: Error }).error?.message ?? "");
      if (/style/i.test(msg)) {
        init.onError(new Error(msg));
        reject(new Error(msg));
      }
    });
    map.on("load", () => {
      if (destroyed) return;
      map.addControl(overlay as unknown as maplibregl.IControl);
      map.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: tl.coords } } });
      map.addSource("trail", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "route-ghost", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-opacity": 0.35, "line-width": 4, "line-dasharray": [1.2, 1.6] } });
      map.addLayer({ id: "trail-glow", type: "line", source: "trail", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 18, "line-blur": 12, "line-opacity": 0.5 } });
      map.addLayer({ id: "trail-line", type: "line", source: "trail", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 6 } });
      tl.events.forEach((e, i) => {
        if (e.type === "speeding-end") return;
        const st = EVENT_STYLE[e.type];
        const el = eventMarkerEl(e, st.color, st.label, () => init.onEventClick(e, i));
        el.dataset.idx = String(i);
        markers.push({ marker: new maplibregl.Marker({ element: el }).setLngLat(e.lngLat).addTo(map), el });
      });
      const moved = (ev: { originalEvent?: unknown }) => {
        if (ev.originalEvent && !introRunning) init.onUserInteract();
      };
      map.on("dragstart", moved);
      map.on("rotatestart", moved);
      map.on("pitchstart", moved);
      map.on("wheel", moved);
      resolve();
    });
  });

  function setCar(car: CarState) {
    if (destroyed) return;
    overlay.setProps({
      layers: [
        new ScenegraphLayer({
          id: "car",
          data: [car],
          scenegraph: modelUrl,
          getPosition: (d: CarState) => [d.lngLat[0], d.lngLat[1], 0],
          // Model faces +Z with Y up: roll 90 stands it up, yaw follows compass bearing.
          getOrientation: (d: CarState) => [0, -d.bearing - init.mapBearingOffset, 90],
          sizeScale: sizeScale * 1.6,
          _lighting: "pbr",
          updateTriggers: { getPosition: car.lngLat, getOrientation: car.bearing },
        }),
      ],
    });
  }

  function setCamera(mode: CameraMode, car: CarState, dt: number) {
    if (mode === "free" || introRunning || destroyed) return;
    const k = cam.snap ? 1 : 1 - Math.exp(-dt * 4);
    const kb = cam.snap ? 1 : 1 - Math.exp(-dt * 1.6);
    cam.snap = false;
    cam.center = [cam.center[0] + (car.lngLat[0] - cam.center[0]) * k, cam.center[1] + (car.lngLat[1] - cam.center[1]) * k];
    if (mode === "chase") {
      cam.bearing = mixAngle(cam.bearing, car.bearing, kb);
      map.jumpTo({ center: cam.center, bearing: cam.bearing, pitch: 68, zoom: 17.4 });
    } else {
      cam.bearing = mixAngle(cam.bearing, 0, kb);
      map.jumpTo({ center: cam.center, bearing: cam.bearing, pitch: 20, zoom: 15.2 });
    }
  }

  function setTrail(fraction: number) {
    const src = map.getSource("trail") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const target = fraction * tl.totalDist;
    let idx = 0;
    while (idx < tl.cumDist.length - 1 && tl.cumDist[idx + 1] <= target) idx++;
    if (idx === lastTrailIdx) return;
    lastTrailIdx = idx;
    // Split into runs of same colour.
    const features: GeoJSON.Feature[] = [];
    let run: LngLat[] = [tl.coords[0]];
    let runSpeed = isSpeedingIdx(0);
    for (let i = 1; i <= idx + 1 && i < tl.coords.length; i++) {
      const sp = isSpeedingIdx(i);
      run.push(tl.coords[i]);
      if (sp !== runSpeed || i === idx + 1 || i === tl.coords.length - 1) {
        features.push({ type: "Feature", properties: { color: runSpeed ? ROUTE_COLORS.speeding : ROUTE_COLORS.normal }, geometry: { type: "LineString", coordinates: run } });
        run = [tl.coords[i]];
        runSpeed = sp;
      }
    }
    src.setData({ type: "FeatureCollection", features });
  }

  return {
    provider: "maplibre",
    ready,
    setCar,
    setCamera,
    snapCamera: () => { cam.snap = true; },
    setLight: (p) => { tint.style.background = TINT[p]; },
    setTrail,
    highlightEvent: (index) => {
      if (index === lastHighlighted) return;
      lastHighlighted = index;
      for (const m of markers) m.el.classList.toggle("is-active", index !== null && m.el.dataset.idx === String(index));
    },
    overview: (animate) => {
      const b = new maplibregl.LngLatBounds();
      tl.coords.forEach((c) => b.extend(c));
      map.fitBounds(b, { padding: 80, pitch: 40, duration: animate ? 1400 : 0 });
    },
    introTo: (car, durationMs) =>
      new Promise<void>((resolve) => {
        cam.center = car.lngLat;
        cam.bearing = car.bearing;
        if (durationMs <= 0) { cam.snap = true; resolve(); return; }
        introRunning = true;
        map.flyTo({ center: car.lngLat, zoom: 17.4, pitch: 68, bearing: car.bearing, duration: durationMs, essential: true });
        map.once("moveend", () => { introRunning = false; resolve(); });
      }),
    resize: () => map.resize(),
    destroy: () => {
      destroyed = true;
      markers.forEach((m) => m.marker.remove());
      try { map.removeControl(overlay as unknown as maplibregl.IControl); } catch { /* noop */ }
      map.remove();
      tint.remove();
    },
  };
}
