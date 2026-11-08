// Mapbox GL v3 replay: Standard style, native `model` source/layer for the car (setModels per frame),
// free-camera chase cam, glowing trimmed route. Pattern from Mapbox's
// "Add 3D model and animate along route" example.
import mapboxgl from "mapbox-gl";
import { EVENT_STYLE, ROUTE_COLORS, mixAngle, offsetLngLat, routeGradient, type LightPreset } from "./timeline";
import { eventMarkerEl, mapboxToken, type CameraMode, type CarState, type ReplayMap, type ReplayMapInit } from "./provider";

type ModelSourceLike = { setModels(models: Record<string, unknown>): void };

const CHASE = { back: 110, up: 88, ahead: 30 }; // high enough to clear typical low-rise buildings // meters
const OVERHEAD = { back: 120, up: 820 };

export function createMapboxReplay(init: ReplayMapInit): ReplayMap {
  const { timeline: tl, container } = init;
  mapboxgl.accessToken = mapboxToken();
  container.replaceChildren(); // StrictMode remounts reuse the element
  const first = tl.sample(0);

  const map = new mapboxgl.Map({
    container,
    style: "mapbox://styles/mapbox/standard",
    center: first.lngLat,
    zoom: 12.2,
    pitch: 45,
    bearing: first.bearing - 20,
    antialias: true,
    attributionControl: false,
    config: {
      basemap: {
        lightPreset: init.light,
        showPointOfInterestLabels: false,
        showTransitLabels: false,
        // Road-name labels render above every slot (incl. "top") and would cover the car.
        showRoadLabels: false,
      },
    },
  });
  map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
  if (process.env.NODE_ENV !== "production") (window as unknown as { __nmReplayMap?: mapboxgl.Map }).__nmReplayMap = map;

  const modelUri = new URL(init.modelUrl, window.location.origin).href;
  const s = init.displayLengthM / init.modelUnitLength; // model scale at street zoom

  // Smoothed camera state (mercator units) so mode switches and chase are fluid.
  const cam = { x: 0, y: 0, z: 0, bearing: first.bearing, init: false, snap: true };
  let lastTrail = -1;
  let lastHighlighted: number | null = null;
  let destroyed = false;
  let modelSource: ModelSourceLike | null = null;
  let introRunning = false;
  const markers: { marker: mapboxgl.Marker; el: HTMLElement }[] = [];

  const ready = new Promise<void>((resolve, reject) => {
    map.on("error", (e) => {
      const err = (e as { error?: Error }).error ?? new Error("Mapbox error");
      // Tile / sprite hiccups are non-fatal; only surface auth/style failures.
      if (/401|403|style|token|access/i.test(String(err.message))) {
        init.onError(err);
        reject(err);
      } else if (process.env.NODE_ENV !== "production") {
        console.warn("[RideReplay] mapbox:", err.message, (err as { cause?: unknown }).cause ?? "");
      }
    });
    map.on("style.load", () => {
      if (destroyed) return;
      try {
        map.addSource("route", {
          type: "geojson",
          lineMetrics: true,
          data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: tl.coords } },
        });
        map.addLayer({
          id: "route-ghost",
          type: "line",
          source: "route",
          slot: "middle",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": ROUTE_COLORS.ghost, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 16, 5], "line-dasharray": [1.2, 1.6], "line-emissive-strength": 1 },
        });
        map.addLayer({
          id: "route-glow",
          type: "line",
          source: "route",
          slot: "middle",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-gradient": routeGradient(tl) as mapboxgl.ExpressionSpecification,
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 8, 16, 26],
            "line-blur": ["interpolate", ["linear"], ["zoom"], 10, 6, 16, 18],
            "line-opacity": 0.55,
            "line-emissive-strength": 1,
            "line-trim-offset": [0, 1],
          },
        });
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          slot: "middle",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-gradient": routeGradient(tl) as mapboxgl.ExpressionSpecification,
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 16, 8],
            "line-emissive-strength": 1,
            "line-trim-offset": [0, 1],
          },
        });

        map.addSource("car", {
          type: "model",
          models: {
            car: { uri: modelUri, position: first.lngLat, orientation: [0, 0, first.bearing + init.mapBearingOffset] },
          },
        } as unknown as mapboxgl.SourceSpecification);
        map.addLayer({
          id: "car",
          type: "model",
          source: "car",
          slot: "top",
          paint: {
            "model-type": "location-indicator",
            "model-scale": [
              "interpolate", ["exponential", 2], ["zoom"],
              8, ["literal", [s * 96, s * 96, s * 96]],
              14, ["literal", [s * 2.2, s * 2.2, s * 2.2]],
              16, ["literal", [s, s, s]],
              20, ["literal", [s * 0.8, s * 0.8, s * 0.8]],
            ],
            "model-emissive-strength": ["match", ["get", "part"], "taillight", ["coalesce", ["get", "brake"], 1], "headlight", 1.4, 0],
            "model-color": ["match", ["get", "part"], "paint", init.paintHex, "#ffffff"],
            "model-color-mix-intensity": ["match", ["get", "part"], "paint", 1, 0],
            "model-cast-shadows": true,
          },
        } as unknown as mapboxgl.LayerSpecification);

        tl.events.forEach((e, i) => {
          if (e.type === "speeding-end") return;
          const st = EVENT_STYLE[e.type];
          const el = eventMarkerEl(e, st.color, st.label, () => init.onEventClick(e, i));
          const marker = new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat(e.lngLat).addTo(map);
          markers.push({ marker, el });
          el.dataset.idx = String(i);
        });

        for (const ev of ["dragstart", "rotatestart", "pitchstart", "wheel"] as const) {
          map.on(ev, userMoved as (e: unknown) => void);
        }
        resolve();
      } catch (err) {
        init.onError(err as Error);
        reject(err);
      }
    });
  });

  function userMoved(e: { originalEvent?: unknown }) {
    if (e.originalEvent && !introRunning) init.onUserInteract();
  }

  function setCar(car: CarState) {
    // The model source is instantiated asynchronously (lazy 3D module); resolve it lazily.
    if (!modelSource) {
      const src = map.getSource("car") as unknown as Partial<ModelSourceLike> | undefined;
      if (!src || typeof src.setModels !== "function") return;
      modelSource = src as ModelSourceLike;
    }
    modelSource.setModels({
      car: {
        uri: modelUri,
        position: car.lngLat,
        orientation: [0, 0, car.bearing + init.mapBearingOffset],
        materialOverrideNames: ["taillight", "headlight", "paint"],
        featureProperties: { brake: 1 + car.braking * 7 },
      },
    });
  }

  let pull = 1;
  function setCamera(mode: CameraMode, car: CarState, dt: number, rate = 1) {
    if (mode === "free" || introRunning || destroyed) return;
    const fc = map.getFreeCameraOptions();
    if (!cam.init && fc.position) {
      cam.x = fc.position.x; cam.y = fc.position.y; cam.z = fc.position.z; cam.init = true;
    }
    const k = cam.snap ? 1 : 1 - Math.exp(-dt * (mode === "chase" ? 3.2 : 2.2));
    const kb = cam.snap ? 1 : 1 - Math.exp(-dt * 1.6);
    let targetLL, alt, look;
    // Fast playback (road trips) pulls the camera back so tiles keep up.
    const targetPull = 1 + Math.max(0, Math.log2(Math.max(1, rate) / 60)) * 1.3;
    pull += (targetPull - pull) * (1 - Math.exp(-dt * 0.8));
    if (mode === "chase") {
      cam.bearing = mixAngle(cam.bearing, car.bearing, kb);
      targetLL = offsetLngLat(car.lngLat, cam.bearing + 180, CHASE.back * pull);
      alt = CHASE.up * pull;
      // Portrait containers: look slightly behind the car so it sits above the HUD.
      const el = map.getContainer();
      const portrait = el.clientHeight > el.clientWidth * 1.1;
      look = offsetLngLat(car.lngLat, cam.bearing, portrait ? -45 * pull : CHASE.ahead);
    } else {
      cam.bearing = mixAngle(cam.bearing, 0, kb);
      targetLL = offsetLngLat(car.lngLat, 180, OVERHEAD.back * pull);
      alt = OVERHEAD.up * pull;
      look = car.lngLat;
    }
    const t = mapboxgl.MercatorCoordinate.fromLngLat(targetLL, alt);
    cam.x += (t.x - cam.x) * k;
    cam.y += (t.y - cam.y) * k;
    cam.z += (t.z - cam.z) * k;
    cam.snap = false;
    fc.position = new mapboxgl.MercatorCoordinate(cam.x, cam.y, cam.z);
    fc.lookAtPoint(look);
    map.setFreeCameraOptions(fc);
  }

  function setTrail(fraction: number) {
    if (!map.getLayer("route-line")) return;
    const f = Math.min(0.99999, Math.max(0, fraction));
    if (Math.abs(f - lastTrail) < 0.0004) return;
    lastTrail = f;
    map.setPaintProperty("route-line", "line-trim-offset", [f, 1]);
    map.setPaintProperty("route-glow", "line-trim-offset", [f, 1]);
  }

  function setLight(preset: LightPreset) {
    try {
      map.setConfigProperty("basemap", "lightPreset", preset);
    } catch {
      /* style not ready */
    }
  }

  function highlightEvent(index: number | null) {
    if (index === lastHighlighted) return;
    lastHighlighted = index;
    for (const m of markers) m.el.classList.toggle("is-active", index !== null && m.el.dataset.idx === String(index));
  }

  function overview(animate: boolean) {
    const b = new mapboxgl.LngLatBounds();
    tl.coords.forEach((c) => b.extend(c));
    map.fitBounds(b, { padding: 80, pitch: 50, bearing: tl.sample(0).bearing - 20, duration: animate ? 1400 : 0 });
    cam.init = false;
  }

  function introTo(car: CarState, durationMs: number) {
    return new Promise<void>((resolve) => {
      const target = offsetLngLat(car.lngLat, car.bearing, CHASE.ahead * 0.5);
      cam.bearing = car.bearing;
      if (durationMs <= 0) {
        cam.init = false;
        cam.snap = true;
        resolve();
        return;
      }
      introRunning = true;
      map.flyTo({ center: target, zoom: 17.2, pitch: 70, bearing: car.bearing, duration: durationMs, curve: 1.6, essential: true });
      map.once("moveend", () => {
        introRunning = false;
        cam.init = false; // re-read the camera so chase starts from exactly here
        resolve();
      });
    });
  }

  return {
    provider: "mapbox",
    ready,
    setCar,
    setCamera,
    snapCamera: () => { cam.snap = true; },
    setLight,
    setTrail,
    highlightEvent,
    overview,
    introTo,
    resize: () => map.resize(),
    destroy: () => {
      destroyed = true;
      markers.forEach((m) => m.marker.remove());
      map.remove();
    },
  };
}
