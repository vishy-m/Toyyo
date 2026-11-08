// Converts a Kenney Car Kit GLB (single palette-texture material) into a GLB with
// named flat PBR materials: paint, glass, trim, underbody, chrome, headlight, taillight, tire, rim.
// Named materials let HeroCar swap the paint color and let Mapbox override light materials.
//
// Usage: node scripts/models/prepare-kenney.mjs <in.glb> <colormap.png> <out.glb>
import { NodeIO, VertexLayout } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup } from "@gltf-transform/functions";
import sharp from "sharp";

const [, , inPath, pngPath, outPath] = process.argv;
if (!inPath || !pngPath || !outPath) {
  console.error("usage: prepare-kenney.mjs <in.glb> <colormap.png> <out.glb>");
  process.exit(1);
}

// SEPARATE layout: Mapbox's model loader does not support interleaved (byteStride) POSITION.
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).setVertexLayout(VertexLayout.SEPARATE);
const doc = await io.read(inPath);
const { data, info } = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });
const sample = (u, v) => {
  const x = Math.min(info.width - 1, Math.max(0, Math.floor(u * info.width)));
  const y = Math.min(info.height - 1, Math.max(0, Math.floor(v * info.height)));
  const i = (y * info.width + x) * info.channels;
  return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
};
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

// Material presets (linear colors).
const MATS = {
  paint: { color: [0.55, 0.05, 0.04], metallic: 0.55, roughness: 0.32 },
  glass: { color: [0.02, 0.025, 0.035], metallic: 0.2, roughness: 0.08 },
  trim: { color: [0.03, 0.03, 0.035], metallic: 0.1, roughness: 0.55 },
  underbody: { color: [0.05, 0.05, 0.06], metallic: 0.1, roughness: 0.7 },
  chrome: { color: [0.75, 0.75, 0.78], metallic: 1.0, roughness: 0.18 },
  headlight: { color: [1, 0.97, 0.9], metallic: 0, roughness: 0.2, emissive: [1, 0.95, 0.82] },
  taillight: { color: [0.6, 0.02, 0.02], metallic: 0, roughness: 0.25, emissive: [0.9, 0.02, 0.02] },
  tire: { color: [0.025, 0.025, 0.028], metallic: 0, roughness: 0.9 },
  rim: { color: [0.6, 0.62, 0.66], metallic: 1.0, roughness: 0.25 },
};

function classify(cx, cy, isWheel) {
  if (isWheel) return cx === 11 && cy === 2 ? "rim" : "tire";
  if (cy === 1 || cy === 0) return "paint"; // saturated body colours live in rows 0/1
  if (cx === 1 && cy === 3) return "glass";
  if (cx === 0 && cy === 3) return "glass";
  if (cx === 7 && cy === 2) return "underbody";
  if ((cx === 13 || cx === 12) && cy === 2) return "chrome";
  if ((cx === 2 || cx === 3) && cy === 3) return "headlight";
  if ((cx === 4 || cx === 5) && cy === 3) return "taillight";
  return "trim";
}

const materials = {};
for (const [name, p] of Object.entries(MATS)) {
  const m = doc.createMaterial(name).setBaseColorFactor([...p.color, 1]).setMetallicFactor(p.metallic).setRoughnessFactor(p.roughness);
  if (p.emissive) m.setEmissiveFactor(p.emissive);
  materials[name] = m;
}

const lightZ = { headlight: [], taillight: [] };
for (const mesh of doc.getRoot().listMeshes()) {
  const isWheel = mesh.getName().startsWith("wheel");
  for (const prim of [...mesh.listPrimitives()]) {
    const mat = prim.getMaterial();
    const tt = mat?.getBaseColorTextureInfo()?.getExtension("KHR_texture_transform");
    const off = tt?.getOffset?.() ?? [0, 0];
    const sc = tt?.getScale?.() ?? [1, 1];
    const pos = prim.getAttribute("POSITION");
    const uv = prim.getAttribute("TEXCOORD_0");
    const idx = prim.getIndices();
    const groups = {};
    const ua = [], ub = [], uc = [], pa = [];
    for (let t = 0; t < idx.getCount(); t += 3) {
      const i0 = idx.getScalar(t), i1 = idx.getScalar(t + 1), i2 = idx.getScalar(t + 2);
      uv.getElement(i0, ua); uv.getElement(i1, ub); uv.getElement(i2, uc);
      let u = ((ua[0] + ub[0] + uc[0]) / 3) * sc[0] + off[0];
      let v = ((ua[1] + ub[1] + uc[1]) / 3) * sc[1] + off[1];
      u = ((u % 1) + 1) % 1; v = ((v % 1) + 1) % 1;
      const cls = classify(Math.floor(u * 16), Math.floor(v * 4), isWheel);
      (groups[cls] ??= []).push(i0, i1, i2);
      if (cls === "headlight" || cls === "taillight") { pos.getElement(i0, pa); lightZ[cls].push(pa[2]); }
      if (cls === "paint" && !groups.__paintColor) groups.__paintColor = sample(u, v);
    }
    const paintColor = groups.__paintColor; delete groups.__paintColor;
    if (paintColor) materials.paint.setBaseColorFactor([...paintColor.map(srgbToLinear), 1]);
    const nrm = prim.getAttribute("NORMAL");
    for (const [cls, list] of Object.entries(groups)) {
      // Compact: each primitive gets its own vertex arrays + uint16 indices (Mapbox's glTF
      // loader rejects primitives that share a buffer with sparse indices).
      const remap = new Map();
      const P = [], Nn = [], I = [];
      const tmp = [];
      for (const old of list) {
        let ni = remap.get(old);
        if (ni === undefined) {
          ni = remap.size;
          remap.set(old, ni);
          pos.getElement(old, tmp); P.push(tmp[0], tmp[1], tmp[2]);
          nrm.getElement(old, tmp); Nn.push(tmp[0], tmp[1], tmp[2]);
        }
        I.push(ni);
      }
      const buf = idx.getBuffer();
      const np = doc.createPrimitive()
        .setIndices(doc.createAccessor().setType("SCALAR").setArray(remap.size < 65535 ? new Uint16Array(I) : new Uint32Array(I)).setBuffer(buf))
        .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(P)).setBuffer(buf))
        .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(Nn)).setBuffer(buf))
        .setMaterial(materials[cls]);
      mesh.addPrimitive(np);
    }
    mesh.removePrimitive(prim);
    prim.dispose();
  }
}
// Drop the old palette material + texture, unused attributes.
for (const m of doc.getRoot().listMaterials()) if (!(m.getName() in MATS)) m.dispose();
for (const t of doc.getRoot().listTextures()) t.dispose();
doc.createExtension(ALL_EXTENSIONS.find((e) => e.EXTENSION_NAME === "KHR_texture_transform")).dispose();
await doc.transform(dedup(), prune());
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
console.log(`${outPath}: headlight z≈${avg(lightZ.headlight).toFixed(2)} taillight z≈${avg(lightZ.taillight).toFixed(2)} (front = sign of headlight z)`);
await io.write(outPath, doc);
