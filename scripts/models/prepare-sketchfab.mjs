// Ships a Sketchfab GLB to the hero stage as the author made it.
//   node scripts/models/prepare-sketchfab.mjs <id>      (ids: see MODELS below)
// Writes public/models/<id>.glb directly (optimize.sh is not involved):
//   - geometry, materials, textures and the cabin are kept as they are (the glass is see-through);
//   - geometry is Draco-compressed so the browser can load it (quantization is visually lossless);
//     textures keep their original encoding and size;
//   - wheel nodes are renamed, which changes nothing on screen: CarModel spins every node named
//     /wheel/ about its own origin, so only nodes that pivot at a hub may carry that name;
//   - the model's author, licence and source (Sketchfab writes them in asset.extras) go into
//     public/models/manifest.json, so the credits footer is accurate.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { draco } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import fs from "node:fs";

const MODELS = {
  camry: {
    src: "models/2025_toyota_camry_xv80_hybrid.glb",
    // Rims, tyres and rotors are separate meshes with no shared hub pivot: keep them still.
    wheels: "static",
  },
  "gr-supra": {
    src: "models/toyota_gr_supra.glb",
    // Each Wheel_01_XX pivots at its hub: name the meshes under them "Wheel_XX" and nothing above.
    wheels: { parent: /^Wheels_01$/, hub: /^Wheel_01_(LF|RF|LR|RR)$/ },
  },
};

const id = process.argv[2];
const cfg = MODELS[id];
if (!cfg) {
  console.error(`Unknown model "${id}". Known: ${Object.keys(MODELS).join(", ")}`);
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "draco3d.decoder": await draco3d.createDecoderModule(),
  "draco3d.encoder": await draco3d.createEncoderModule(),
});
const doc = await io.read(cfg.src);
const root = doc.getRoot();

for (const n of root.listNodes()) {
  const name = n.getName();
  if (cfg.wheels === "static") {
    if (/wheel/i.test(name)) n.setName(name.replace(/wheel/gi, "Rim"));
    continue;
  }
  if (cfg.wheels.parent.test(name)) n.setName("Axles");
  const hub = name.match(cfg.wheels.hub);
  if (hub) {
    n.setName(`Axle_${hub[1]}`);
    // The mesh node under the hub sits at the hub's origin; it is the one that spins.
    n.traverse((c) => c !== n && c.setName(c.getMesh() ? `Wheel_${hub[1]}` : `Hub_${hub[1]}`));
  } else if (/wheel/i.test(name) && !/^Wheel_(LF|RF|LR|RR)$/.test(name)) {
    n.setName(name.replace(/wheel/gi, "Rim")); // the steering wheel
  }
}

await doc.transform(draco());
const out = `public/models/${id}.glb`;
await io.write(out, doc);
console.log(`${id}: wrote ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB, from ${(fs.statSync(cfg.src).size / 1048576).toFixed(1)} MB)`);

// Credit, from the file itself.
const extras = root.getAsset().extras ?? {};
const strip = (s = "") => String(s).replace(/\s*\(https?:[^)]+\)\s*$/, "");
const manifestPath = "public/models/manifest.json";
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const entry = manifest.models[id];
if (entry) {
  entry.available = true;
  if (extras.title) {
    entry.credit = {
      title: extras.title,
      author: strip(extras.author),
      url: extras.source ?? "",
      license: strip(extras.license).replace(/^CC-(.+)-(\d\.\d)$/, "CC $1 $2"), // "CC-BY-NC-SA-4.0" → "CC BY-NC-SA 4.0"
    };
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log("credit:", JSON.stringify(entry.credit));
}
