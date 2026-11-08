# Cinematic vehicle model integration notes

These notes describe the downloaded GLBs and the current `CarModel` normalization path. Geometry bounds and material names were inspected from the GLBs with glTF Transform NodeIO (meshopt and Draco decoding); this is structural inspection, not an in-app visual review. The assets' saved Sketchfab attribution and licensing remain in `public/models/cinematic/sources.json` and `CREDITS.md`.

## Bounds, axes, and normalization

`CarModel` rotates the source by `rotationY`, takes the transformed scene's world-space bounding box, and scales its largest X/Z extent to the configured `length` (the factor is `length / max(raw.x, raw.z)`). It then centers X/Z and moves the bounding box minimum Y to zero. This normalizes the entire scene graph, so stray geometry or a floor can change the resulting scale and contact point. No floor was confirmed in this structural pass; inspect/render before treating the bounds as the visible vehicle alone. Long axis and dimensions below are raw source units.

| Asset | Raw X × Y × Z bounds | Raw longest horizontal axis | Paint material candidate | Rough scale at suggested length |
| --- | --- | --- | --- | ---: |
| Camry | 0.02094 × 0.01444 × 0.04924 | Z | `CarPaint` (strong name match) | 99.5× for 4.9 m |
| GR Supra | 0.02031 × 0.01311 × 0.04372 | Z | `Paint` (strong name match) | 100× for 4.38 m |
| RAV4 | 87.374 × 66.856 × 180.836 | Z | `Silver_Sky_Metallic` is a body-paint candidate; `BlackTrim` is not supported as the paint target by geometry/material names | 0.0254× for 4.6 m |
| Land Cruiser J200 | 2729.946 × 363.941 × 949.842 | X | `body` (candidate from name; verify mesh assignment visually) | 0.00183× for ~5.0 m |
| Hilux | 70.773 × 59.339 × 163.613 | Z | `vpc_v1_006_carpaint_1` (strong name match) | 0.0324× for ~5.3 m |
| Corolla Cross | 2.182 × 1.664 × 4.550 | Z | `2020_Toyota_Corolla_Cross_Platinum_White_Pearl_Mica` (strong name match) | 1.01× for ~4.6 m |
| GR Yaris | 7.635 × 5.521 × 15.389 | Z | `Intbodyunrefunblendbodyunrefunblend1Mtl` is the upstream candidate, but the model is textured and should keep authored materials; exact recolor behavior is unverified | 0.29× for ~4.5 m |

These lengths are rough normalization inputs for consistent presentation scale, not verified specifications for the exact source model years. For the Land Cruiser, the source's longest axis is X, unlike the other six; set a quarter-turn candidate and inspect the nose direction in a rendered view before locking orientation. Bounds alone establish long axis but cannot establish which end is the nose. Camry and Supra have very small source-unit extents, so their large multipliers are expected unit normalization, not a geometry error by themselves.

## Material candidates

The RAV4 source metadata's `BlackTrim` paint hint conflicts with the actual material inventory: the GLB has a separate `Silver_Sky_Metallic` material, and `BlackTrim` is named as trim. Treat `Silver_Sky_Metallic` as the likely paint target and verify its mesh coverage in the application. Land Cruiser's `body` is a plausible candidate, while the model also has many generic materials; verify before recoloring. The Hilux and Corolla Cross names explicitly identify paint. GR Yaris has eight textures and its body material names are opaque; keep its authored textured appearance (`keepMaterials`) and do not assume a clean paint-only recolor. The current exact-name authored-material path in `CarModel` changes only the named material; the fallback studio path also recolors names containing `paint` or `body`.

The structural inspection found no obvious scale-independent way to distinguish separate floor geometry. Because the normalization uses the complete transformed scene bounds, a future visual review should check for detached parts, ground planes, or unusual accessories before finalizing length and floor contact. Do not mark any asset as visually validated until rendered in the application.

## Prepared copies (removed)

The joined/Meshopt copies under `public/models/cinematic/optimized/` and the simplified Camry copy were deleted; the carousel loads the original files (see below). Source SHA-256 values remain in `public/models/cinematic/sources.json`.

## Visual review and current state (November 8, 2026)

Every model was rendered with the stage's lights (overhead, carousel tilt, selected pose, side) and, after a first pass that recolored paint, again on the user's real GPU in the app. **Final decision: every car renders with its original authored materials and textures; the only change is the base colour factor of each car's body-paint material (see Paint colours).** An earlier pass recolored paint, capped clearcoat, stripped transmission and shipped a simplified/WebP Camry copy; the user saw blotchy pink hood patches and a red that was not the authored paint, so all of that was removed. The Camry authored paint is a cool silver-grey, the Supra silver, the RAV4/Land Cruiser/Hilux/Corolla Cross/GR Yaris whites and silvers.

`lib/cinematic/prepare-model.ts` now does normalization only: rotationY (+180 so a glTF +Z nose ends at -Z, which the carousel tilt turns up the screen), scale of the longest X/Z extent to `length`, centering, floor at y=0, and dropping the Land Cruiser's ground plane (`dropMaterials: ["material_0"]`). It does not clone or edit materials. The stage's hover brightening (`envMapIntensity` x1.3) was removed too, so no material is mutated anywhere (cars are hidden with the black curtain plane).

| Model | File | rotationY | Length (m) | Notes |
| --- | --- | ---: | ---: | --- |
| Camry XV80 | `public/models/camry.glb` | 0 | 4.92 | Interior is modeled; glass (authored transmission/alpha) shows seats, as authored |
| RAV4 XA50 | `public/models/cinematic/toyota-rav4.glb` | 0 | 4.60 | Body is `Silver_Sky_Metallic` (authored) |
| GR Supra | `public/models/gr-supra.glb` | 0 | 4.38 | |
| Land Cruiser J200 | `public/models/cinematic/toyota-land-cruiser.glb` | 0 | 4.95 | Ground plane `material_0` dropped; car is long on Z with nose +Z (presentation.json's 90 was wrong) |
| Hilux | `public/models/cinematic/toyota-hilux.glb` | 0 | 5.26 | `edge_color*` outline meshes are alpha 0 |
| Corolla Cross | `public/models/cinematic/toyota-corolla-cross.glb` | 0 | 4.46 | Authored white alloys |
| GR Yaris | `public/models/cinematic/toyota-yaris.glb` | 180 | 3.995 | Nose was down at 0 |

Lighting (VehicleStage `Scene`): authored light paints clipped to flat white under the old rig (which brightened paint about 1.7 to 2x), and the small 128 px environment with hard rectangular softboxes produced banded hood highlights. Now: ambient 0.3, key 1.1, fill 0.55, environment 256 px with three large circular (soft) lightformers (0.8 / 0.5 / 0.45) on a dark `#14161a` background, tone-mapping exposure 0.9 (ACES). Whites now keep panel detail and silver reads as silver. Re-tune if the stage lighting changes.

Transmission/blend: no problem found with the Camry's `KHR_materials_transmission` glass in the real GPU views (curtain and selected layering look right); it is left as authored. Cost note: transmission adds an extra scene render pass.

## Weight

The 14.8 MB Camry is back, plainly: `camry.glb` 14,769,368 B (Draco, 31 PNG textures). Others: RAV4 2,946,512; Supra 2,896,936; Land Cruiser 3,117,348; Hilux 2,054,816; Corolla Cross 902,568; GR Yaris 1,305,384. **Total 27,992,932 B (26.7 MiB)** for the seven carousel models, plus posters (about 0.69 MB). The `optimized/` copies and the simplified Camry copy were deleted.

## Posters

`public/models/cinematic/posters/<id>.png`: 480 x 720 RGBA, transparent, carousel pose, 120 px per metre, rendered from the authored models with the current lights (72 to 114 KB each). Regenerate with `scripts/models/render-views.mjs` and the dev route template `scripts/models/dev-models.page.tsx.txt` (copy to `app/dev-models/page.tsx`, delete afterwards) whenever the lights, `rotationY` or `length` change.

## Scripts

`scripts/models/inspect-glb.mjs`, `list-blended.mjs`, `render-views.mjs`, `dev-models.page.tsx.txt`.

## Paint colours (base colour factor only)

Users found the all-authored fleet "basically gray", so each car gets a distinct paint colour, applied by `prepareModel` from `model.paint = { material, color }` in `lib/cinematic/vehicles.ts`. Only the named body-paint material is cloned (once per car) and only its `color` (base colour factor) is set. Texture maps, normal map, roughness, metalness, clearcoat, transmission and envMapIntensity are exactly as authored; no other material is touched, and the scene lights are unchanged.

| Car | Paint material | Colour |
| --- | --- | --- |
| Camry | `CarPaint` | `#b3122c` Supersonic-style red |
| RAV4 | `Silver_Sky_Metallic` | `#3f6fb0` Cavalry-style blue |
| GR Supra | `Paint` | `#e6c42a` Nitro-style yellow |
| Land Cruiser | `body` | `#6b7a55` Army-style green |
| Hilux | `vpc_v1_006_carpaint_1` | `#d9622b` orange |
| Corolla Cross | `..._Platinum_White_Pearl_Mica` | `#2f9aa0` teal |
| GR Yaris | none | authored white (textured body; stays the one white car, with its carbon roof) |

Neighbours differ around the carousel (red, blue, yellow, green, orange, teal, white). Real-GPU check: Camry red, RAV4 blue, Supra yellow and Corolla Cross teal render smooth with the authored texture; the earlier blotchy look is gone because clearcoat, glass and geometry are untouched. Posters under `posters/` must be re-rendered to match these colours (pending the new carousel/top-down poses).
