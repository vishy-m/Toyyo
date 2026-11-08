// Usage: node scripts/models/list-blended.mjs <file.glb>...
// Lists materials that are BLEND/MASK or use KHR_materials_transmission (they behave differently when the stage fades opacity).
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import draco3d from "draco3dgltf";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "draco3d.decoder": await draco3d.createDecoderModule() });
for (const file of process.argv.slice(2)) {
  const doc = await io.read(file);
  const out = [];
  for (const m of doc.getRoot().listMaterials()) {
    const tr = m.getExtension("KHR_materials_transmission");
    if (m.getAlphaMode() !== "OPAQUE" || tr) out.push(`${m.getName()}[${m.getAlphaMode()}${tr ? ",transmission=" + tr.getTransmissionFactor() : ""},a=${m.getBaseColorFactor()[3].toFixed(2)}]`);
  }
  console.log(file.split("/").pop(), "->", out.join("  ") || "none");
}
