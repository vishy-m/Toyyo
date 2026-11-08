// Flips `available` in public/models/manifest.json for every hero model whose GLB exists.
// Usage: node scripts/models/build-manifest.mjs
import fs from "node:fs";
const path = "public/models/manifest.json";
const m = JSON.parse(fs.readFileSync(path, "utf8"));
for (const [id, e] of Object.entries(m.models)) {
  e.available = fs.existsSync("public" + e.file);
  console.log(`${id.padEnd(12)} ${e.available ? "hero model" : "fallback -> " + e.fallback}`);
}
fs.writeFileSync(path, JSON.stringify(m, null, 2) + "\n");
