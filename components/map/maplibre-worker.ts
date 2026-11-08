// MapLibre 6 ships an ESM worker resolved via import.meta.url, which Turbopack does not emit.
// Point it at a same-origin blob that imports the exact-version worker from unpkg.
import * as maplibregl from "maplibre-gl";

const VERSION = "6.16.0";
let done = false;

export function ensureMaplibreWorker() {
  if (done || typeof window === "undefined") return;
  done = true;
  try {
    const v = maplibregl.getVersion?.() || VERSION;
    const src = `import "https://unpkg.com/maplibre-gl@${v}/dist/maplibre-gl-worker.mjs";`;
    maplibregl.setWorkerUrl(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
  } catch {
    /* keep default */
  }
}
