// Usage: node scripts/models/analyze-kenney.mjs <model.glb> <colormap.png>
// Prints triangle area per palette cell (16x4 grid of 32x128 px cells) per mesh.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const [, , glbPath, pngPath] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(glbPath);
const { data, info } = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });
const px = (u, v) => {
  const x = Math.min(info.width - 1, Math.max(0, Math.floor(u * info.width)));
  const y = Math.min(info.height - 1, Math.max(0, Math.floor(v * info.height)));
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
};
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial();
    const tt = mat?.getBaseColorTextureInfo()?.getExtension("KHR_texture_transform");
    const off = tt?.getOffset?.() ?? [0, 0], sc = tt?.getScale?.() ?? [1, 1];
    const pos = prim.getAttribute("POSITION"), uv = prim.getAttribute("TEXCOORD_0"), idx = prim.getIndices();
    const cells = {};
    const n = idx.getCount();
    const a = [], b = [], c = [], ua = [], ub = [], uc = [];
    for (let t = 0; t < n; t += 3) {
      const i0 = idx.getScalar(t), i1 = idx.getScalar(t + 1), i2 = idx.getScalar(t + 2);
      pos.getElement(i0, a); pos.getElement(i1, b); pos.getElement(i2, c);
      uv.getElement(i0, ua); uv.getElement(i1, ub); uv.getElement(i2, uc);
      let u = (ua[0] + ub[0] + uc[0]) / 3, v = (ua[1] + ub[1] + uc[1]) / 3;
      u = u * sc[0] + off[0]; v = v * sc[1] + off[1];
      const cx = Math.floor(((u % 1) + 1) % 1 * 16), cy = Math.floor(((v % 1) + 1) % 1 * 4);
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const area = Math.hypot(...cr) / 2;
      const key = `${cx},${cy}`;
      cells[key] ??= { area: 0, tris: 0, rgb: px(u, v), ymin: 9, ymax: -9 };
      cells[key].area += area; cells[key].tris++;
      cells[key].ymin = Math.min(cells[key].ymin, a[1], b[1], c[1]);
      cells[key].ymax = Math.max(cells[key].ymax, a[1], b[1], c[1]);
    }
    console.log(mesh.getName(), "tt", off, sc);
    for (const [k, v] of Object.entries(cells).sort((x, y) => y[1].area - x[1].area))
      console.log("  cell", k, "area", v.area.toFixed(3), "tris", v.tris, "rgb", v.rgb.join(","), "y", v.ymin.toFixed(2), v.ymax.toFixed(2));
  }
}
