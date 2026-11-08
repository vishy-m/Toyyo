// Usage: node scripts/models/inspect-glb.mjs <file.glb> [--nodes]
// Prints world-space bounds, size, vertex/material totals; with --nodes, per-mesh-node bounds.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import draco3d from "draco3dgltf";
import { vec3 } from "gl-matrix";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "meshopt.decoder": MeshoptDecoder,
  "draco3d.decoder": await draco3d.createDecoderModule(),
});
const [file, flag] = process.argv.slice(2);
const doc = await io.read(file);
const fmt = (a) => a.map((v) => +v.toFixed(3));
const mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
const mats = new Map(); let verts = 0;
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const M = node.getWorldMatrix(), nmin = [Infinity, Infinity, Infinity], nmax = [-Infinity, -Infinity, -Infinity], nm = new Set();
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute("POSITION"); if (!pos) continue; verts += pos.getCount();
    const mat = prim.getMaterial()?.getName() || "(unnamed)"; nm.add(mat); mats.set(mat, (mats.get(mat) || 0) + pos.getCount());
    for (let i = 0; i < pos.getCount(); i++) { const q = vec3.transformMat4([], pos.getElement(i, []), M); for (let j = 0; j < 3; j++) { nmin[j] = Math.min(nmin[j], q[j]); nmax[j] = Math.max(nmax[j], q[j]); mins[j] = Math.min(mins[j], q[j]); maxs[j] = Math.max(maxs[j], q[j]); } }
  }
  if (flag === "--nodes") console.log(" node", JSON.stringify(node.getName()), "min", fmt(nmin), "max", fmt(nmax), [...nm].join(","));
}
console.log(JSON.stringify({ file, verts, min: fmt(mins), max: fmt(maxs), size: fmt(maxs.map((v, i) => v - mins[i])), mats: [...mats].sort((a, b) => b[1] - a[1]).slice(0, 14) }));
