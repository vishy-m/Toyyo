// Resolves a vehicle's `modelAsset` ("/models/camry.glb") to a loadable file via the manifest.
// Hero (Sketchfab) models are used when present; otherwise the Kenney body-style fallback.
import manifest from "@/public/models/manifest.json";
import type { BodyStyle } from "@/lib/types";

export interface ModelCredit {
  title: string;
  author: string;
  url: string;
  license: string;
}

export interface ResolvedModel {
  id: string; // manifest key, e.g. "camry"
  label: string;
  url: string; // file actually loaded
  isHero: boolean;
  rotationY: number; // degrees
  mapBearingOffset: number; // degrees
  paintMaterial: string;
  length: number; // real-world length in meters
  credit: ModelCredit;
}

type FallbackEntry = { file: string; rotationY: number; mapBearingOffset?: number; paintMaterial: string; length: number; credit: string };
type ModelEntry = {
  label: string;
  bodyStyle: BodyStyle;
  fallback: string;
  file: string;
  available: boolean;
  rotationY: number;
  mapBearingOffset?: number;
  paintMaterial: string;
  length: number;
  credit: ModelCredit;
};

const M = manifest as unknown as {
  fallbacks: Record<string, FallbackEntry>;
  models: Record<string, ModelEntry>;
  credits: Record<string, ModelCredit>;
};

const BODY_FALLBACK: Record<BodyStyle, string> = { sedan: "sedan", suv: "suv", truck: "truck" };

export function modelIdFromAsset(asset: string | undefined): string {
  if (!asset) return "";
  const base = asset.split("/").pop() ?? asset;
  return base.replace(/\.(glb|gltf)$/i, "").toLowerCase();
}

export function resolveModel(asset: string | undefined, bodyStyle: BodyStyle = "sedan"): ResolvedModel {
  const id = modelIdFromAsset(asset);
  const entry = M.models[id];
  if (entry?.available) {
    return {
      id,
      label: entry.label,
      url: entry.file,
      isHero: true,
      rotationY: entry.rotationY,
      mapBearingOffset: entry.mapBearingOffset ?? 0,
      paintMaterial: entry.paintMaterial,
      length: entry.length,
      credit: entry.credit,
    };
  }
  const fbKey = entry?.fallback ?? (M.fallbacks[id] ? id : BODY_FALLBACK[bodyStyle]);
  const fb = M.fallbacks[fbKey] ?? M.fallbacks[BODY_FALLBACK[bodyStyle]];
  return {
    id: id || fbKey,
    label: entry?.label ?? `Toyota ${bodyStyle}`,
    url: fb.file,
    isHero: false,
    rotationY: fb.rotationY,
    mapBearingOffset: fb.mapBearingOffset ?? 0,
    paintMaterial: fb.paintMaterial,
    length: entry?.length ?? fb.length,
    credit: M.credits[fb.credit],
  };
}

/** Low-poly model for the replay map, by body style. */
export function resolveMapModel(bodyStyle: BodyStyle): ResolvedModel {
  return resolveModel(bodyStyle === "truck" ? "map-truck" : "map-car", bodyStyle === "truck" ? "truck" : "sedan");
}

/** All credits for models currently in use (hero models present + the Kenney kit). */
export function activeCredits(): ModelCredit[] {
  const out: ModelCredit[] = [];
  for (const e of Object.values(M.models)) if (e.available) out.push(e.credit);
  out.push(M.credits.kenney);
  const seen = new Set<string>();
  return out.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
}

/** Persona's body style for a trip (used to pick the map car). */
export function bodyStyleForPersona(personaId: string): BodyStyle {
  return personaId === "raj" ? "truck" : personaId === "garcia" ? "suv" : "sedan";
}
