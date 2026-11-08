/**
 * Shared, mutable state for one frame of the cinematic stage. The experience shell owns the single
 * requestAnimationFrame loop: it advances the carousel, writes the DOM hit targets, then asks the
 * WebGL stage to render with the same numbers, so labels and 3D cars never drift apart.
 * Kept free of three.js so the shell's bundle stays small (the stage is loaded lazily).
 */

export type Phase = "collection" | "opening" | "story" | "closing";

/** Euler angles in radians, three.js order "XYZ" (matrix = Rx * Ry * Rz). */
export type PoseAngles = readonly [x: number, y: number, z: number];

/**
 * The two camera poses, shared by the WebGL stage and the poster renderer (scripts/models/) so a poster and
 * its live model match exactly. Models come from lib/cinematic/prepare-model.ts with wheels on y=0, the car
 * centred on x/z and the nose toward -Z. The camera is orthographic and looks down -Z (screen x right,
 * screen y up). Read a pose as: Ry(yaw) turns the car on its own ground, then Rx(tilt) tips that ground
 * toward the camera (tilt PI/2 is straight overhead).
 */
export const POSES = {
  /** Carousel: side three-quarter from above. Nose to the left (the drift direction) and slightly toward the
   *  viewer, so the side, hood and front read; long axis across the screen. */
  carousel: [0.86, Math.PI / 2 + 0.42, 0],
  /** Selected car: top-down, nose up, about 16 degrees off straight overhead (seen from behind). */
  selected: [1.29, 0, 0],
} as const satisfies Record<string, PoseAngles>;

/**
 * Poster frames for the same poses (transparent PNG, rendered by the model agent's poster script). The car's
 * projected bounding box is centred in the frame, at `ppu` pixels per metre, exactly as the stage centres it.
 * The shell scales a poster by (its own pixels per metre / ppu), so a 5 m car stays 5 m when the model swaps in.
 */
export const POSTERS = {
  carousel: { path: (id: string) => `/models/cinematic/posters/${id}.png`, width: 840, height: 480, ppu: 120 },
  selected: { path: (id: string) => `/models/cinematic/posters/top/${id}.png`, width: 480, height: 720, ppu: 120 },
} as const;

/** Share of the ownership-view slot the selected car may fill (the stage and the slot poster both use it). */
export const SLOT_FILL = { w: 0.9, h: 0.88 } as const;

/** Screen-space size (metres) of a car-sized box (width x height x length) seen in `pose`. */
export function projectBox(width: number, height: number, length: number, pose: PoseAngles) {
  const [ax, ay, az] = pose;
  const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const x0 of [-width / 2, width / 2]) for (const y0 of [0, height]) for (const z0 of [-length / 2, length / 2]) {
    // Rz, then Ry, then Rx (three.js "XYZ").
    const x1 = x0 * cz - y0 * sz, y1 = x0 * sz + y0 * cz, z1 = z0;
    const x2 = x1 * cy + z1 * sy, y2 = y1, z2 = -x1 * sy + z1 * cy;
    const x3 = x2, y3 = y2 * cx - z2 * sx;
    if (x3 < minX) minX = x3;
    if (x3 > maxX) maxX = x3;
    if (y3 < minY) minY = y3;
    if (y3 > maxY) maxY = y3;
  }
  return { w: maxX - minX, h: maxY - minY };
}

export interface RailSlot {
  /** Visual centre of the car, canvas pixels. */
  x: number;
  y: number;
  /** Multiplier from the shallow arc (1 at the centre, a little smaller at the edges). */
  scale: number;
  onScreen: boolean;
}

export class StageController {
  /** Canvas size in CSS pixels (the stage layer). */
  width = 1440;
  height = 900;
  /** Car band (canvas pixels), measured from the DOM so CSS owns the layout. */
  bandTop = 250;
  bandHeight = 480;
  centerX = 720;
  /** Pixels per metre in the carousel; cars keep their real relative lengths. */
  ppu = 86;
  /** Average distance between neighbouring car centres (cars have their own widths; see `centers`). */
  step = 340;
  /** Each car's centre along the track (px), car 0 at 0; equal gaps between differently sized cars. */
  centers: number[];
  /** Length of one loop of the track (px). */
  span = 2380;
  /** Track position in pixels; grows as the cars drift right-to-left. */
  offset = 0;
  velocity = 0;
  tween: { from: number; to: number; start: number; duration: number } | null = null;
  dragging = false;
  rail: RailSlot[];
  phase: Phase = "collection";
  phaseStart = 0;
  phaseId = 0;
  selected = -1;
  hovered = -1;
  reduced = false;
  /** Where the selected car settles in the ownership view (canvas pixels). */
  slot = { x: 0, y: 0, w: 0, h: 0 };
  /** Frame time (performance.now, ms). */
  now = 0;
  /** Choreography time multiplier; 1 in normal use. Set window.__toyyoSlowMotion = 8 to review transitions. */
  timeScale = 1;
  /** Keep rendering until this time even if nothing reports movement (model loads, resizes). */
  busyUntil = 0;
  /** Frames still owed by keepBusy, independent of how long each frame takes. */
  pendingFrames = 0;
  /** Set by the stage when any car is still moving toward its target. */
  moving = false;
  /** Empty element reserved for the future Toyyo mascot; positioned over the selected car's roof. */
  mascot: HTMLElement | null = null;
  render: ((seconds: number) => void) | null = null;

  constructor(count: number) {
    this.rail = Array.from({ length: count }, () => ({ x: -9999, y: 0, scale: 1, onScreen: false }));
    this.centers = Array.from({ length: count }, (_, i) => i * this.step);
    this.span = count * this.step;
  }

  // The stage (a child component) talks to the shared state only through these methods.
  /** Keep painting for `ms`, and for at least a few frames however slow they are (a model that just loaded
   *  must reach the screen even when the carousel is paused). */
  keepBusy(ms: number) { this.busyUntil = Math.max(this.busyUntil, performance.now() + ms); this.pendingFrames = Math.max(this.pendingFrames, 3); }
  reportMoving() { this.moving = true; }
  attachRenderer(render: ((seconds: number) => void) | null) { this.render = render; }
  setCanvasSize(width: number, height: number) { this.width = width; this.height = height; }
  placeMascot(x: number, y: number) {
    if (this.mascot) this.mascot.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }
}

/** Proposed choreography (ms from the click / back action). Tuned by eye; see the design spec §4. */
export const TIMING = {
  open: { lift: 180, fadeFrom: 100, fadeTo: 420, travelFrom: 300, travelTo: 960, contentAt: 720, settle: 1120 },
  close: { contentOut: 200, travelFrom: 60, travelTo: 640, othersFrom: 300, othersTo: 700, settle: 720 },
  reduced: { settle: 160 },
} as const;

/** Drift speed of the idle carousel, CSS px/s. Tuned slower than the spec's 20–30 on design review. */
export const DRIFT_SPEED = 18;

type Track = Pick<StageController, "centers" | "span">;

/** Signed position of car `index` relative to the screen centre, wrapped so the loop is seamless off-screen. */
export function railDelta(track: Track, index: number, offset: number) {
  const { span } = track;
  let v = (track.centers[index] - offset) % span;
  if (v < -span / 2) v += span;
  if (v >= span / 2) v -= span;
  return v;
}

/** Index of the car nearest the centre of the screen. */
export function centeredIndex(track: Track, offset: number) {
  let best = 0, bestDistance = Infinity;
  for (let i = 0; i < track.centers.length; i++) {
    const distance = Math.abs(railDelta(track, i, offset));
    if (distance < bestDistance) { best = i; bestDistance = distance; }
  }
  return best;
}

/** Offset that centres car `index`, choosing the nearest equivalent loop position. */
export function offsetFor(track: Track, index: number, offset: number) {
  return offset + railDelta(track, index, offset);
}

/** Offset of the car closest to `offset` (snap after a drag or trackpad swipe). */
export function snapOffset(track: Track, offset: number) {
  return offsetFor(track, centeredIndex(track, offset), offset);
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const progress = (t: number, from: number, to: number) => clamp01((t - from) / Math.max(1, to - from));

/** Cubic-bezier easing (x1, y1, x2, y2), solved with Newton iterations; matches CSS timing functions. */
export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const err = sx(t) - x;
      const d = dx(t);
      if (Math.abs(err) < 1e-5 || Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    return sy(clamp01(t));
  };
}

/** Controlled ease-out with a soft start: the car never jolts into motion and never overshoots. */
export const easeTravel = bezier(0.45, 0, 0.12, 1);
export const easeOut = bezier(0.22, 1, 0.36, 1);
export const easeFade = bezier(0.4, 0, 0.2, 1);
