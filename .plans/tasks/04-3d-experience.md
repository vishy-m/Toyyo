# Task 04: 3D hero car + 3D ride replay (Claude subagent)

Read first: `.plans/tasks/README.md` (ownership, runtime rules, the component props you promise), `lib/types.ts` (`Vehicle`, `Trip`, `TripEvent`, `Hotspot`), `lib/client/ui-store.ts`, and spec §5.5 (3D and interactive layer), §8 (3D assets table + pipeline), §10 (3D map + replay architecture: Mapbox native `model` layer + free camera, MapLibre fallback).

**You own:** `components/three/**`, `components/map/**`, `public/models/**`, `scripts/models/**`, `app/lab/**`. Edit nothing else.
Build and iterate in a sandbox page **`app/lab/page.tsx`** (http://localhost:3000/lab) that mounts your components with fixture data, so you never block on, or break, the main dashboard (task 03 owns it). Until task 01's real trips land, use a fixture: put a `Trip` with a realistic ~300-point path through Austin (I-35 / downtown) and a few events in `components/map/fixtures.ts`.

## Deliverables

### 1. 3D models: `scripts/models/*` + `public/models/*.glb`
- The Toyota models in spec §8 are on Sketchfab (CC BY 4.0), but **downloading needs a Sketchfab login/API token, which we don't have yet**. So:
  1. Try to fetch the **Kenney Car Kit (CC0)** from kenney.nl (look for the direct zip link on https://kenney.nl/assets/car-kit) and extract a sedan, an SUV and a pickup GLB into `public/models/` as `sedan.glb`, `suv.glb`, `truck.glb`. Keep downloads in their own scratch directory and only copy the GLBs you need.
  2. If that fails, build a good-looking procedural car per body style in three.js (rounded body, cabin glass, wheels, lights) as the fallback. The UI must look intentional either way.
  3. Write `scripts/models/optimize.sh`, which runs `npx gltf-transform optimize in.glb out.glb --compress draco --texture-compress webp --simplify --simplify-ratio 0.5` for any GLB dropped into `scripts/models/raw/`, plus a `public/models/manifest.json` mapping persona vehicles and upgrade targets (`camry`, `rav4`, `corolla`/`prius`, `tacoma`, `4runner`, `highlander`, `map-car`) → file, scale, rotation offset, paint material name, and license credit. Missing hero models fall back to the body-style GLB, so the user can later drop the Sketchfab downloads in and they just work.
  4. A `components/three/ModelCredits.tsx` footer list generated from the manifest.

### 2. `components/three/HeroCar.tsx` (default export; props per README)
react-three-fiber + drei: studio look (`Environment` preset, `ContactShadows`, soft reflective floor), slow idle auto-rotate, drag to orbit (zoom-limited), `dpr={[1, 1.5]}`, frameloop paused when off-screen.
- **Paint swap**: apply `vehicle.paintHex` to the paint material (from the manifest), with an eased color tween on persona change.
- **Hotspots** (`odometer`, `tires`, `engine`, `driver-seat`): pulsing dots via drei `Html`; click → camera flight (~1.2 s eased, `CameraControls`) + `useUiStore.setHotspot`; also react to `activeHotspot` changes from the agent. A small glass tooltip with the key number: read it from props. Add an optional `hotspotLabels?: Partial<Record<Hotspot, string>>` prop and document it in STATUS.md for task 03.
- **Persona transition**: when `vehicle.modelAsset` changes, the old car drives off screen and the new one rolls in (wheels spin).
- **Upgrade preview**: when `upgradePreview` is set, the second model slides in beside the current one.
- Reset-view button, legend, keyboard accessible. `reducedMotion` → no auto-rotate, cuts instead of flights. WebGL failure → static fallback image/silhouette.

### 3. `components/map/RideReplay.tsx` (default export; props per README)
Follow the official Mapbox pattern (spec §10; https://docs.mapbox.com/mapbox-gl-js/example/add-3d-model-and-animate-along-route/):
- `mapbox-gl` 3.33, style `mapbox://styles/mapbox/standard`, token `process.env.NEXT_PUBLIC_MAPBOX_TOKEN`, `lightPreset` from the trip start hour (dawn/day/dusk/night), pitch ~60.
- Car = native `model` source + `model` layer (`model-type: 'location-indicator'`, zoom-interpolated `model-scale`), updated each frame with `modelSource.setModels(...)` from the route sampled by distance/time (turf), position and bearing eased with a `mix()` low-pass.
- **Chase cam** via `getFreeCameraOptions` / `MercatorCoordinate.fromLngLat` / `lookAtPoint` / `setFreeCameraOptions`; modes Chase (default) / Overhead / Free.
- Traveled route drawn with a GeoJSON line (`line-trim-offset` or a progressively updated source) colored by segment (speeding = orange), `line-emissive-strength: 1`.
- Controls: play/pause, scrubber with event markers, speed 1× / 10× / 60×, camera mode; keyboard (space, ←/→). HUD: speed, trip miles, elapsed time, score change so far.
- Events: when playback reaches an event, slow down, pulse a marker, show a callout ("Hard brake · −2 score pts"); brake-light glow if the model supports material overrides. `focusEventT` from the store → seek there.
- Close button calls `onClose`; also clear `useUiStore.replay`.
- **Provider abstraction**: `components/map/provider.ts` exposing `ReplayMap` (`setCar`, `setCamera`, `setLight`, `setTrail`) with Mapbox and MapLibre implementations; `NEXT_PUBLIC_MAP_PROVIDER=maplibre` switches to MapLibre + OpenFreeMap tiles (`https://tiles.openfreemap.org/styles/liberty`) + deck.gl `ScenegraphLayer` car + `jumpTo` chase cam. The Mapbox path is primary; MapLibre must at least render the route + car + follow.
- Import `mapbox-gl/dist/mapbox-gl.css` (and the maplibre css) inside these client components.

### 4. `components/map/TripHeatmap.tsx` (default export; props per README)
Overview map of all trips: animated trails colored by category via deck.gl `TripsLayer` on `MapboxOverlay` (timestamps as seconds-from-start floats), hover → glowing route + tooltip, click → `onSelectTrip(id)`. Lighter weight than the replay; tilted, dusk light.

### 5. Verify
- `npx tsc --noEmit` clean for your files.
- Screenshot http://localhost:3000/lab at 1440px and 390px wide (in-app browser: `superset browser open --target new-tab` / `screenshot`, workspace `$SUPERSET_WORKSPACE_ID`). Check the browser console for WebGL/Mapbox errors. Confirm the replay actually moves (take two screenshots a couple of seconds apart), the chase cam follows, and hotspots fly the camera.
- Performance: aim for a steady frame rate on a laptop; no per-frame React re-renders (use refs + rAF and imperative map/model updates).
- STATUS.md entry: what works, exact props (including any optional additions), how 03 should mount each component, and the list of Sketchfab models the user should download into `scripts/models/raw/` to upgrade from the fallback models.
