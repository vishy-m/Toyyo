"use client";

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { advance, Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { VEHICLES, type CinematicVehicle } from "@/lib/cinematic/vehicles";
import { prepareModel } from "@/lib/cinematic/prepare-model";
import { POSES, SLOT_FILL, TIMING, easeFade, easeOut, easeTravel, progress, type StageController } from "./stage-controller";

export type StageProps = {
  controller: RefObject<StageController>;
  /** Vehicle ids whose models may load now (visible cars first; the rest follow). */
  mounted: ReadonlySet<string>;
  /** Bumped per vehicle by the shell's retry action; remounts that model. */
  attempts: Record<string, number>;
  onLoaded: (id: string) => void;
  onError: (id: string) => void;
  /** WebGL could not start or its context was lost: the shell falls back to posters. */
  onUnavailable: () => void;
};

// Poses live in stage-controller.ts (POSES) so the poster renderer can use the exact same numbers. The
// carousel shows each car in a side three-quarter; selecting one turns it top-down as it travels left.
const damp = (a: number, b: number, speed: number, dt: number) => a + (b - a) * (1 - Math.exp(-speed * dt));
const LIFT_SCALE = 1.11;
const LIFT_PX = 12;
const HOVER_SCALE = 0.07;
const HOVER_RAISE_PX = 8;

class Boundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

let shadowTexture: THREE.Texture | null = null;
/** Soft contact shadow: one shared radial gradient, stretched under each car. */
function getShadowTexture() {
  if (shadowTexture) return shadowTexture;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(0,0,0,0.92)");
  g.addColorStop(0.55, "rgba(0,0,0,0.6)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  shadowTexture = new THREE.CanvasTexture(canvas);
  shadowTexture.colorSpace = THREE.SRGBColorSpace;
  return shadowTexture;
}

/**
 * The looping "driving world" under the selected car (design review: the car should feel like it is always
 * driving through a 3D world). One tile of country lane and roadside (grass, trees, rocks, bushes, a fence,
 * wildflowers), vector-drawn once to a canvas (40 x 48 m at 32 px/m)
 * and scrolled under the car. Units are metres in the car's own frame: x across (the car is centred in the right-hand lane at
 * x = 0), the tile runs along z. It is a child of the car's group, so it shares the car's exact top-down pose
 * and scale and stays under the wheels during the settle.
 */
const WORLD = { width: 40, tile: 48, ppm: 32, tiles: 2, speed: 8 /* m/s, about 18 mph */ } as const;
let worldTexture: THREE.CanvasTexture | null = null;
function getWorldTexture() {
  if (worldTexture) return worldTexture;
  const { width, tile, ppm } = WORLD;
  const canvas = document.createElement("canvas");
  canvas.width = width * ppm;
  canvas.height = tile * ppm;
  const ctx = canvas.getContext("2d")!;
  const X = (m: number) => (m + width / 2) * ppm; // metres across, from the car's centre line
  const Z = (m: number) => m * ppm; // metres along the tile
  const W = canvas.width, H = canvas.height;
  let seed = 20261108;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // deterministic: same world every load
  const between = (a: number, b: number) => a + rnd() * (b - a);
  // Anything that can cross the tile's top or bottom edge is drawn three times so the loop has no seam.
  const wrapped = (draw: (dz: number) => void) => { draw(-H); draw(0); draw(H); };
  // A country lane, narrow enough that both grass verges show beside the car: asphalt from -1.75 m to +1.75 m.
  const ROAD = { left: -1.75, right: 1.75 };
  const offRoad = (x: number, margin: number) => x < ROAD.left - margin || x > ROAD.right + margin;

  // Grass: a dusk-green base, then thousands of short blade strokes in a few tones for texture.
  ctx.fillStyle = "#22351f";
  ctx.fillRect(0, 0, W, H);
  const blades = ["#2c4428", "#1a2b18", "#35512e", "#27401f", "#3d5a33"];
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 26000; i++) {
    const x = between(-width / 2, width / 2), z = rnd() * tile;
    if (!offRoad(x, 0.25)) continue;
    const len = between(0.08, 0.22) * ppm, lean = between(-0.5, 0.5);
    ctx.strokeStyle = blades[Math.floor(rnd() * blades.length)];
    ctx.beginPath(); ctx.moveTo(X(x), Z(z)); ctx.lineTo(X(x) + lean * len, Z(z) - len); ctx.stroke();
  }
  // Soft darker patches so the grass isn't uniform.
  for (let i = 0; i < 60; i++) wrapped((dz) => {
    const x = X(between(-width / 2, width / 2)), z = Z(rnd() * tile) + dz, r = between(1, 3) * ppm;
    const g = ctx.createRadialGradient(x, z, 0, x, z, r);
    g.addColorStop(0, "rgba(10,20,10,0.28)"); g.addColorStop(1, "rgba(10,20,10,0)");
    ctx.fillStyle = g; ctx.fillRect(x - r, z - r, 2 * r, 2 * r);
  });

  // Gravel shoulders, then the asphalt with fine aggregate and two faint wheel tracks.
  for (const [a, b] of [[ROAD.left - 0.35, ROAD.left], [ROAD.right, ROAD.right + 0.35]]) {
    ctx.fillStyle = "#4a463d";
    ctx.fillRect(X(a), 0, X(b) - X(a), H);
    for (let i = 0; i < 2500; i++) { ctx.fillStyle = rnd() > 0.5 ? "rgba(120,112,98,0.6)" : "rgba(30,28,24,0.5)"; ctx.fillRect(X(between(a, b)), rnd() * H, 2, 2); }
  }
  ctx.fillStyle = "#2a2d31";
  ctx.fillRect(X(ROAD.left), 0, X(ROAD.right) - X(ROAD.left), H);
  for (let i = 0; i < 14000; i++) { ctx.fillStyle = `rgba(${rnd() > 0.5 ? "255,255,255" : "0,0,0"},${between(0.03, 0.08)})`; ctx.fillRect(X(between(ROAD.left, ROAD.right)), rnd() * H, 1.5, 1.5); }
  for (const x of [-0.75, 0.75]) { ctx.fillStyle = "rgba(0,0,0,0.13)"; ctx.fillRect(X(x - 0.28), 0, 0.56 * ppm, H); }
  // Worn edge lines, broken where the paint has faded.
  ctx.fillStyle = "rgba(225,220,205,0.5)";
  for (const x of [ROAD.left + 0.12, ROAD.right - 0.24]) for (let z = 0; z < tile; z += between(1.5, 4)) ctx.fillRect(X(x), Z(z), 0.12 * ppm, between(1, 3) * ppm);
  // A few patched cracks across the lane.
  ctx.strokeStyle = "rgba(10,10,12,0.28)"; ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) { const z = Z(rnd() * tile); let x = X(between(ROAD.left + 0.3, ROAD.right - 0.3)); ctx.beginPath(); ctx.moveTo(x, z); for (let k = 0; k < 5; k++) { x += between(-0.4, 0.4) * ppm; ctx.lineTo(x, z + between(-0.25, 0.25) * ppm); } ctx.stroke(); }

  // Fence along the right verge: posts every 3 m with two wires.
  const fenceX = ROAD.right + 1.6;
  ctx.strokeStyle = "rgba(180,170,150,0.35)"; ctx.lineWidth = 1;
  for (const dx of [-0.05, 0.05]) { ctx.beginPath(); ctx.moveTo(X(fenceX + dx), 0); ctx.lineTo(X(fenceX + dx), H); ctx.stroke(); }
  for (let z = 0; z < tile; z += 3) {
    ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(X(fenceX) + 3, Z(z) + 4, 0.16 * ppm, 0.16 * ppm);
    ctx.fillStyle = "#6b5a44"; ctx.fillRect(X(fenceX) - 0.08 * ppm, Z(z) - 0.08 * ppm, 0.16 * ppm, 0.16 * ppm);
  }

  // Rocks: irregular polygons with a lit face and a cast shadow, scattered along both verges.
  const rock = (x: number, z: number, r: number) => wrapped((dz) => {
    const cx = X(x), cz = Z(z) + dz, R = r * ppm, n = 7 + Math.floor(rnd() * 3), pts: [number, number][] = [];
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, rr = R * between(0.7, 1.05); pts.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr * 0.8]); }
    const path = (ox: number, oy: number) => { ctx.beginPath(); pts.forEach(([px, pz], k) => (k ? ctx.lineTo(px + ox, pz + oy) : ctx.moveTo(px + ox, pz + oy))); ctx.closePath(); };
    ctx.fillStyle = "rgba(0,0,0,0.45)"; path(R * 0.35, R * 0.45); ctx.fill();
    const g = ctx.createLinearGradient(cx - R, cz - R, cx + R, cz + R);
    g.addColorStop(0, "#9a9a92"); g.addColorStop(0.55, "#6c6d68"); g.addColorStop(1, "#45463f");
    ctx.fillStyle = g; path(0, 0); ctx.fill();
  });
  for (let i = 0; i < 18; i++) { const side = rnd() > 0.5 ? 1 : -1; rock(side * between(2.6, 5.5), rnd() * tile, between(0.12, 0.45)); }

  // Bushes: clusters of small round leaves.
  const bush = (x: number, z: number, r: number) => wrapped((dz) => {
    const cx = X(x), cz = Z(z) + dz;
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.arc(cx + r * ppm * 0.3, cz + r * ppm * 0.4, r * ppm, 0, Math.PI * 2); ctx.fill();
    for (let k = 0; k < 7; k++) {
      const lx = cx + between(-0.6, 0.6) * r * ppm, lz = cz + between(-0.6, 0.6) * r * ppm, lr = between(0.35, 0.6) * r * ppm;
      const g = ctx.createRadialGradient(lx - lr * 0.3, lz - lr * 0.3, lr * 0.1, lx, lz, lr);
      g.addColorStop(0, "#4f7a3f"); g.addColorStop(1, "#22381d");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, lz, lr, 0, Math.PI * 2); ctx.fill();
    }
  });
  for (let i = 0; i < 14; i++) { const side = rnd() > 0.5 ? 1 : -1; bush(side * between(3, 7), rnd() * tile, between(0.4, 0.8)); }

  // Wildflowers: sparse specks of colour in the verges.
  const petals = ["#e9d57a", "#d99bb0", "#f2efe4", "#c9b2e0"];
  for (let i = 0; i < 700; i++) {
    const x = between(-width / 2, width / 2); if (!offRoad(x, 0.5)) continue;
    ctx.fillStyle = petals[Math.floor(rnd() * petals.length)]; ctx.beginPath(); ctx.arc(X(x), Z(rnd() * tile), between(1.2, 2.4), 0, Math.PI * 2); ctx.fill();
  }

  // Trees last, so their crowns overhang the verges and the road edge: a cast shadow, lobed crown, highlight.
  const tree = (x: number, z: number, r: number) => wrapped((dz) => {
    const cx = X(x), cz = Z(z) + dz, R = r * ppm;
    const sh = ctx.createRadialGradient(cx + R * 0.45, cz + R * 0.55, 0, cx + R * 0.45, cz + R * 0.55, R * 1.2);
    sh.addColorStop(0, "rgba(0,0,0,0.5)"); sh.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(cx + R * 0.45, cz + R * 0.55, R * 1.2, 0, Math.PI * 2); ctx.fill();
    const lobes = 6 + Math.floor(rnd() * 4);
    for (let k = 0; k < lobes; k++) {
      const a = (k / lobes) * Math.PI * 2 + rnd(), d = R * between(0.35, 0.55), lr = R * between(0.45, 0.62);
      const lx = cx + Math.cos(a) * d, lz = cz + Math.sin(a) * d;
      const g = ctx.createRadialGradient(lx - lr * 0.35, lz - lr * 0.35, lr * 0.1, lx, lz, lr);
      g.addColorStop(0, "#41693a"); g.addColorStop(0.7, "#253f22"); g.addColorStop(1, "#18291a");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, lz, lr, 0, Math.PI * 2); ctx.fill();
    }
    const top = ctx.createRadialGradient(cx - R * 0.25, cz - R * 0.3, 0, cx, cz, R * 0.6);
    top.addColorStop(0, "rgba(120,170,100,0.35)"); top.addColorStop(1, "rgba(120,170,100,0)");
    ctx.fillStyle = top; ctx.beginPath(); ctx.arc(cx, cz, R * 0.6, 0, Math.PI * 2); ctx.fill();
  });
  // Occasional trees: a few close enough to overhang the lane edge, more further back.
  for (let i = 0; i < 5; i++) { const side = rnd() > 0.5 ? 1 : -1; tree(side * between(3.4, 4.4), rnd() * tile, between(1.6, 2.4)); }
  for (let i = 0; i < 14; i++) { const side = rnd() > 0.5 ? 1 : -1; tree(side * between(6, 18), rnd() * tile, between(1.4, 3)); }

  worldTexture = new THREE.CanvasTexture(canvas);
  worldTexture.colorSpace = THREE.SRGBColorSpace;
  worldTexture.wrapT = THREE.RepeatWrapping;
  worldTexture.repeat.set(1, WORLD.tiles);
  worldTexture.anisotropy = 4;
  return worldTexture;
}

/** Per-frame world update, kept out of React's render data flow (like setCurtain). Returns whether it shows. */
function applyWorld(mesh: THREE.Mesh, material: THREE.MeshBasicMaterial, opacity: number, advanceBy: number) {
  material.opacity = opacity;
  mesh.visible = opacity > 0.002;
  if (mesh.visible && advanceBy && material.map) material.map.offset.y = (material.map.offset.y + advanceBy) % 1;
  return mesh.visible;
}

/**
 * The world plane for one car. Only the selected car shows it: it fades in as the car settles into the
 * top-down view and scrolls toward the car's tail, so the car reads as driving forward; it fades out first
 * when the car heads back to the carousel. Static under reduced motion. Drawn after the curtain (renderOrder
 * 1, no depth writes) so the curtain never hides it, yet depth-tested so the car body still covers it.
 */
function DrivingWorld({ controller, index }: { controller: RefObject<StageController>; index: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map: getWorldTexture(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), []);
  const geometry = useMemo(() => new THREE.PlaneGeometry(WORLD.width, WORLD.tile * WORLD.tiles), []);
  const fade = useRef(-1);
  useEffect(() => () => { material.dispose(); geometry.dispose(); }, [material, geometry]);
  useFrame((_, delta) => {
    const m = mesh.current;
    if (!m) return;
    const c = controller.current;
    const dt = Math.min(delta, 0.05);
    const elapsed = (c.now - c.phaseStart) / c.timeScale;
    const active = c.selected === index && (c.phase === "story" || (c.phase === "opening" && elapsed >= TIMING.open.travelTo - 120));
    const target = active ? 1 : 0;
    if (fade.current < 0 || c.reduced) fade.current = target;
    else fade.current = damp(fade.current, target, active ? 3 : 14, dt);
    if (Math.abs(fade.current - target) < 0.002) fade.current = target;
    const scrolling = active && !c.reduced;
    if (!applyWorld(m, material, fade.current, scrolling ? (WORLD.speed * dt) / WORLD.tile : 0)) return;
    if (scrolling) c.keepBusy(150); // keep the shell's render loop running while the world moves
    else if (fade.current !== target) c.reportMoving();
  });
  return <mesh ref={mesh} geometry={geometry} material={material} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} renderOrder={1} visible={false} />;
}

/** Local bounding box and corners of a prepared model (ignoring nodes the asset registry excludes). */
function measureCorners(root: THREE.Object3D, vehicle: CinematicVehicle) {
  const box = new THREE.Box3();
  const ignore = new Set(vehicle.model.excludeFromBounds ?? []);
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (let p: THREE.Object3D | null = mesh; p; p = p.parent) if (ignore.has(p.name)) return;
    box.expandByObject(mesh);
  });
  const corners: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  return { box, corners };
}

// three.js objects are mutated imperatively every frame; these helpers keep that out of React's render data flow.
function setCurtain(mesh: THREE.Mesh, material: THREE.MeshBasicMaterial, amount: number) {
  material.opacity = amount;
  mesh.visible = amount > 0.001;
}
function disposeAll(materials: THREE.Material[]) {
  for (const material of materials) material.dispose();
}

const SHADOW_OPACITY = 0.85;
const scratch = new THREE.Vector3();
/** Screen-space (camera x/y, metres) bounds of the rotated, unscaled model. */
function projectedBounds(corners: THREE.Vector3[], q: THREE.Quaternion) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const corner of corners) {
    scratch.copy(corner).applyQuaternion(q);
    if (scratch.x < minX) minX = scratch.x;
    if (scratch.x > maxX) maxX = scratch.x;
    if (scratch.y < minY) minY = scratch.y;
    if (scratch.y > maxY) maxY = scratch.y;
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

interface Pose { x: number; y: number; s: number; o: number; q: THREE.Quaternion }
const makePose = (): Pose => ({ x: 0, y: 0, s: 1, o: 1, q: new THREE.Quaternion() });
const copyPose = (to: Pose, from: Pose) => { to.x = from.x; to.y = from.y; to.s = from.s; to.o = from.o; to.q.copy(from.q); return to; };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** One persistent car: the same object travels from the carousel into its ownership view and back. */
function Vehicle({ vehicle, index, controller, onLoaded }: { vehicle: CinematicVehicle; index: number; controller: RefObject<StageController>; onLoaded: (id: string) => void }) {
  const { scene } = useGLTF(vehicle.model.url);
  const group = useRef<THREE.Group>(null);
  const { root } = useMemo(() => prepareModel(scene, vehicle), [scene, vehicle]);
  const { box, corners } = useMemo(() => measureCorners(root, vehicle), [root, vehicle]);
  const poses = useMemo(() => ({
    carousel: new THREE.Quaternion().setFromEuler(new THREE.Euler(...POSES.carousel)),
    selected: new THREE.Quaternion().setFromEuler(new THREE.Euler(...POSES.selected)),
  }), []);
  const shadowMaterial = useMemo(() => new THREE.MeshBasicMaterial({ map: getShadowTexture(), transparent: true, depthWrite: false, toneMapped: false, opacity: SHADOW_OPACITY }), []);
  const shadow = useMemo(() => ({
    width: (box.max.x - box.min.x) * 1.5,
    length: (box.max.z - box.min.z) * 1.22,
    x: (box.max.x + box.min.x) / 2,
    z: (box.max.z + box.min.z) / 2,
  }), [box]);
  const motion = useRef({ ready: false, phaseId: -1, hover: 0, from: makePose(), pose: makePose(), target: makePose() });

  useEffect(() => {
    controller.current.keepBusy(700);
    onLoaded(vehicle.id);
  }, [controller, onLoaded, vehicle.id]);
  useEffect(() => () => disposeAll([shadowMaterial]), [shadowMaterial]);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const c = controller.current;
    const m = motion.current;
    const dt = Math.min(delta, 0.05);
    const elapsed = (c.now - c.phaseStart) / c.timeScale;
    const selected = c.selected === index;
    const rail = c.rail[index];
    const { from, pose, target } = m;

    // Hover/focus: enlarge ~7%, raise slightly and strengthen the key light. Carousel only.
    const hovering = c.phase === "collection" && c.hovered === index;
    m.hover = c.reduced ? (hovering ? 1 : 0) : damp(m.hover, hovering ? 1 : 0, 15, dt);

    const railPose = (withHover: boolean) => {
      const h = withHover ? m.hover : 0;
      target.x = rail.x; target.y = rail.y - HOVER_RAISE_PX * h; target.s = rail.scale * (1 + HOVER_SCALE * h); target.o = 1; target.q.copy(poses.carousel);
      return target;
    };
    // Ownership view: the top-down car fills the slot (mirrors and bumpers inside it).
    const storyPose = () => {
      const b = projectedBounds(corners, poses.selected);
      const fit = Math.min((c.slot.w * SLOT_FILL.w) / (b.w * c.ppu), (c.slot.h * SLOT_FILL.h) / (b.h * c.ppu));
      target.x = c.slot.x + c.slot.w / 2; target.y = c.slot.y + c.slot.h / 2; target.s = Math.max(0.2, fit); target.o = 1; target.q.copy(poses.selected);
      return target;
    };

    if (!m.ready) {
      // First frame for this model: start where its role says, without a tween.
      const inStory = c.phase === "story" || c.phase === "opening";
      copyPose(pose, inStory && selected ? storyPose() : railPose(true));
      if (inStory && !selected) pose.o = 0;
      copyPose(from, pose);
      m.phaseId = c.phaseId;
      m.ready = true;
    } else if (m.phaseId !== c.phaseId) {
      // A new phase tweens from wherever the car is now, so interruptions never jump.
      copyPose(from, pose);
      m.phaseId = c.phaseId;
    }

    const prevX = pose.x, prevY = pose.y, prevS = pose.s, prevO = pose.o;
    if (c.phase === "collection") {
      copyPose(pose, railPose(true));
    } else if (c.phase === "opening") {
      const T = TIMING.open;
      if (selected) {
        if (c.reduced) copyPose(pose, storyPose());
        else if (elapsed < T.travelFrom) {
          const k = easeOut(progress(elapsed, 0, T.lift));
          pose.x = from.x; pose.y = from.y - LIFT_PX * k; pose.s = from.s * lerp(1, LIFT_SCALE, k); pose.o = 1; pose.q.copy(from.q);
        } else {
          const goal = storyPose();
          const k = easeTravel(progress(elapsed, T.travelFrom, T.travelTo));
          pose.x = lerp(from.x, goal.x, k); pose.y = lerp(from.y - LIFT_PX, goal.y, k); pose.s = lerp(from.s * LIFT_SCALE, goal.s, k); pose.o = 1;
          pose.q.slerpQuaternions(from.q, goal.q, k);
        }
      } else {
        const fade = c.reduced ? 1 : easeFade(progress(elapsed, T.fadeFrom, T.fadeTo));
        const o = from.o * (1 - fade);
        copyPose(pose, railPose(false)); pose.o = o;
      }
    } else if (c.phase === "story") {
      if (selected) copyPose(pose, storyPose());
      else { copyPose(pose, railPose(false)); pose.o = 0; }
    } else {
      const T = TIMING.close;
      if (selected) {
        const fromQ = from.q;
        const goal = railPose(false);
        const k = c.reduced ? 1 : easeTravel(progress(elapsed, T.travelFrom, T.travelTo));
        pose.x = lerp(from.x, goal.x, k); pose.y = lerp(from.y, goal.y, k); pose.s = lerp(from.s, goal.s, k); pose.o = 1;
        pose.q.slerpQuaternions(fromQ, goal.q, k);
      } else {
        const k = c.reduced ? 1 : easeFade(progress(elapsed, T.othersFrom, T.othersTo));
        const o = lerp(from.o, 1, k);
        copyPose(pose, railPose(false)); pose.o = o;
      }
    }

    // pose.o is how much of the car shows through the black curtain; hidden cars skip rendering entirely.
    // (A newly loaded model needs no fade of its own: its poster sits above the canvas and fades out.)
    if (Math.abs(prevX - pose.x) > 0.05 || Math.abs(prevY - pose.y) > 0.05 || Math.abs(prevS - pose.s) > 1e-4 || Math.abs(prevO - pose.o) > 1e-3 || Math.abs(m.hover - (hovering ? 1 : 0)) > 1e-3) c.reportMoving();

    // Place the group so the visual centre of the turned car lands on (x, y).
    const b = projectedBounds(corners, pose.q);
    g.quaternion.copy(pose.q);
    g.scale.setScalar(pose.s);
    g.position.set((pose.x - c.width / 2) / c.ppu - b.cx * pose.s, (c.height / 2 - pose.y) / c.ppu - b.cy * pose.s, selected ? 6 : 0);
    const halfWidth = (b.w * pose.s * c.ppu) / 2;
    g.visible = (selected || pose.o > 0.005) && pose.x + halfWidth > -40 && pose.x - halfWidth < c.width + 40;

    // Reserved anchor for the future Toyyo mascot: just above the roof, toward the windscreen.
    if (selected) {
      g.updateMatrixWorld();
      // Roof centre, a little toward the windscreen (the nose is -Z).
      scratch.set((box.min.x + box.max.x) / 2, box.max.y, box.min.z * 0.6 + box.max.z * 0.4).applyMatrix4(g.matrixWorld);
      c.placeMascot(c.width / 2 + scratch.x * c.ppu, c.height / 2 - scratch.y * c.ppu);
    }
  });

  return (
    <group ref={group} visible={false}>
      <primitive object={root} />
      <DrivingWorld controller={controller} index={index} />
      {/* After the world (renderOrder 1) so the contact shadow darkens the road under the car. */}
      <mesh position={[shadow.x, 0.005, shadow.z]} rotation={[-Math.PI / 2, 0, 0]} scale={[shadow.width, shadow.length, 1]} material={shadowMaterial} renderOrder={2}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </group>
  );
}

/**
 * "Everything else fades to black": a black plane between the other cars (z=0) and the selected car (z=6).
 * Fading this one plane avoids touching any car material, so selection never triggers shader work.
 */
function Curtain({ controller }: { controller: RefObject<StageController> }) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), []);
  const state = useRef({ phaseId: -1, from: 0, value: -1 });
  useEffect(() => () => disposeAll([material]), [material]);
  useFrame(() => {
    const c = controller.current;
    const s = state.current;
    if (!mesh.current) return;
    if (s.value < 0) s.value = c.phase === "story" || c.phase === "opening" ? 1 : 0;
    if (s.phaseId !== c.phaseId) { s.from = s.value; s.phaseId = c.phaseId; }
    const elapsed = (c.now - c.phaseStart) / c.timeScale;
    let value = 0;
    if (c.phase === "story") value = 1;
    else if (c.phase === "opening") value = c.reduced ? 1 : lerp(s.from, 1, easeFade(progress(elapsed, TIMING.open.fadeFrom, TIMING.open.fadeTo)));
    else if (c.phase === "closing") value = c.reduced ? 0 : lerp(s.from, 0, easeFade(progress(elapsed, TIMING.close.othersFrom, TIMING.close.othersTo)));
    if (Math.abs(value - s.value) > 1e-4) c.reportMoving();
    s.value = value;
    setCurtain(mesh.current, material, value);
  });
  return <mesh ref={mesh} position={[0, 0, 3]} material={material} visible={false}><planeGeometry args={[4000, 4000]} /></mesh>;
}

function Scene({ controller, mounted, attempts, onLoaded, onError }: Omit<StageProps, "onUnavailable">) {
  const size = useThree((state) => state.size);
  useEffect(() => {
    // The canvas is cleared when it resizes; the shell's loop repaints while busy.
    controller.current.keepBusy(400);
  }, [controller, size]);
  return <>
    <ambientLight intensity={0.3} />
    <directionalLight position={[-8, 10, 12]} intensity={1.1} color="#fff5e8" />
    <directionalLight position={[10, -4, 8]} intensity={0.55} color="#d7e6f6" />
    <Environment resolution={256} frames={1}>
      <color attach="background" args={["#14161a"]} />
      <Lightformer form="circle" position={[0, 12, 6]} scale={[26, 26, 1]} intensity={0.8} />
      <Lightformer form="circle" position={[-14, 2, 4]} rotation={[0, Math.PI / 2, 0]} scale={[16, 16, 1]} intensity={0.5} />
      <Lightformer form="circle" position={[14, 2, 2]} rotation={[0, -Math.PI / 2, 0]} scale={[16, 16, 1]} intensity={0.45} />
    </Environment>
    <Curtain controller={controller} />
    {VEHICLES.map((vehicle, index) => mounted.has(vehicle.id) && (
      <Boundary key={`${vehicle.id}:${attempts[vehicle.id] ?? 0}`} onError={() => onError(vehicle.id)}>
        <Suspense fallback={null}><Vehicle vehicle={vehicle} index={index} controller={controller} onLoaded={onLoaded} /></Suspense>
      </Boundary>
    ))}
  </>;
}

function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Forget a failed model so a retry fetches it again. */
export function clearModel(url: string) {
  useGLTF.clear(url);
}

/**
 * The single persistent WebGL canvas. Rendering is driven by the shell's frame loop through
 * controller.render (frameloop="never"), so it stops entirely when nothing moves or the tab is hidden.
 */
export default function VehicleStage({ onUnavailable, ...props }: StageProps) {
  const [supported] = useState(webglAvailable);
  const unavailable = useRef(onUnavailable);
  useEffect(() => { unavailable.current = onUnavailable; }, [onUnavailable]);
  useEffect(() => { if (!supported) unavailable.current(); }, [supported]);
  const controller = props.controller;
  useEffect(() => () => controller.current.attachRenderer(null), [controller]);
  if (!supported) return null;
  return (
    <Boundary onError={() => unavailable.current()}>
      <Canvas
        orthographic
        camera={{ position: [0, 0, 40], near: 0.1, far: 200, zoom: 86 }}
        dpr={[1, 1.5]}
        frameloop="never"
        resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        onCreated={(state) => {
          state.gl.toneMapping = THREE.ACESFilmicToneMapping;
          state.gl.toneMappingExposure = 0.9;
          state.gl.domElement.addEventListener("webglcontextlost", (event) => { event.preventDefault(); unavailable.current(); });
          controller.current.attachRenderer((seconds: number) => {
            const root = state.get();
            const camera = root.camera as THREE.OrthographicCamera;
            const c = controller.current;
            c.setCanvasSize(root.size.width, root.size.height);
            if (camera.zoom !== c.ppu) { camera.zoom = c.ppu; camera.updateProjectionMatrix(); }
            advance(seconds, true, root);
          });
          controller.current.keepBusy(400);
        }}
      >
        <Scene {...props} />
      </Canvas>
    </Boundary>
  );
}
