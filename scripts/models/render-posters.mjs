// Renders both poster sets from the exact stage poses (components/cinematic/stage-controller.ts POSES/POSTERS):
//   carousel (side three-quarter) -> public/models/cinematic/posters/<id>.png      (840x480)
//   selected (top-down)           -> public/models/cinematic/posters/top/<id>.png  (480x720)
// Needs the dev server and the temporary route: copy scripts/models/dev-posters.page.tsx.txt to
// app/dev-posters/page.tsx, run `node scripts/models/render-posters.mjs [id ...]`, then delete the route.
// playwright-core must be resolvable (e.g. NODE_PATH=<dir with playwright-core>/node_modules).
// GL=gpu (default) tries the Metal/GPU path; GL=cpu forces SwiftShader. Re-render whenever POSES, POSTERS,
// the Scene lights, a car's paint, rotationY or length change.
import { chromium } from "playwright-core";
import fs from "node:fs";

const ids = process.argv.slice(2);
const all = ["camry", "rav4", "gr-supra", "land-cruiser", "hilux", "corolla-cross", "gr-yaris"];
const frames = { carousel: { w: 840, h: 480, dir: "public/models/cinematic/posters" }, selected: { w: 480, h: 720, dir: "public/models/cinematic/posters/top" } };
const exe = process.env.CHROME_PATH || "/Users/vishruth/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const base = process.env.BASE || "http://localhost:3000";
const args = process.env.GL === "cpu" ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"];
const browser = await chromium.launch({ executablePath: exe, headless: true, args });

for (const [pose, f] of Object.entries(frames)) {
  fs.mkdirSync(f.dir, { recursive: true });
  for (const id of ids.length ? ids : all) {
    const page = await browser.newPage({ viewport: { width: f.w, height: f.h } });
    page.on("pageerror", (e) => console.log(id, pose, "pageerror", e.message));
    await page.goto(`${base}/dev-posters?id=${id}&pose=${pose}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForFunction(() => window.__loaded === true, null, { timeout: 240000 });
    await page.waitForTimeout(2500);
    const renderer = await page.evaluate(() => {
      const gl = document.querySelector("canvas")?.getContext("webgl2");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
    });
    const out = `${f.dir}/${id}.png`;
    await page.screenshot({ path: out, omitBackground: true, timeout: 180000 });
    console.log(pose.padEnd(8), id.padEnd(14), `${(fs.statSync(out).size / 1024).toFixed(0)} KB`, renderer);
    await page.close();
  }
}
await browser.close();
