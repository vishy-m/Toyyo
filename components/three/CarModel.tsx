"use client";
// One car: loads a GLB, normalizes it (nose → +Z, wheels on y=0, real-world length), eases the paint
// color and spins wheels on demand. Low-poly fallbacks get studio materials by name; hero models keep
// the materials their author made (keepMaterials), only the paint material's color changes.
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import type { Hotspot } from "@/lib/types";

export type HotspotAnchors = Record<Hotspot, THREE.Vector3>;

export interface CarModelProps {
  url: string;
  rotationY?: number; // degrees
  length: number; // meters
  paintMaterial: string;
  paintHex: string;
  /** rad/s for wheel spin, written by the parent's transition logic. */
  wheelSpin?: RefObject<number>;
  onAnchors?(a: HotspotAnchors, size: THREE.Vector3): void;
  /** Instant color (no tween) for the first render. */
  instantPaint?: boolean;
  /** Keep the GLB's own materials (hero models); only `paintMaterial` takes the paint color. */
  keepMaterials?: boolean;
}

const tmpColor = new THREE.Color();

function studioMaterial(src: THREE.Material, paintName: string, paint: THREE.Color): THREE.Material {
  const name = (src.name || "").toLowerCase();
  const base = src as THREE.MeshStandardMaterial;
  const color = base.color ? base.color.clone() : new THREE.Color("#888");
  if (name === paintName.toLowerCase() || name.includes("paint") || name.includes("body")) {
    const m = new THREE.MeshPhysicalMaterial({
      name: src.name,
      color: paint.clone(),
      metalness: 0.55,
      roughness: 0.32,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.35,
    });
    m.userData.isPaint = true;
    return m;
  }
  if (name.includes("glass") || name.includes("window")) {
    return new THREE.MeshPhysicalMaterial({ name: src.name, color: "#0a0f16", metalness: 0.4, roughness: 0.04, clearcoat: 1, envMapIntensity: 2 });
  }
  if (name.includes("chrome") || name === "rim") {
    return new THREE.MeshStandardMaterial({ name: src.name, color: name === "rim" ? "#b9bec6" : "#d7dbe0", metalness: 1, roughness: 0.18, envMapIntensity: 1.6 });
  }
  if (name.includes("headlight")) {
    return new THREE.MeshStandardMaterial({ name: src.name, color: "#fff", emissive: new THREE.Color("#fff3dd"), emissiveIntensity: 2.2, toneMapped: false });
  }
  if (name.includes("taillight")) {
    return new THREE.MeshStandardMaterial({ name: src.name, color: "#600", emissive: new THREE.Color("#ff1a2a"), emissiveIntensity: 1.6, toneMapped: false });
  }
  if (name === "tire") return new THREE.MeshStandardMaterial({ name: src.name, color: "#111214", roughness: 0.92, metalness: 0 });
  if (name === "trim" || name === "underbody") return new THREE.MeshStandardMaterial({ name: src.name, color: "#121317", roughness: 0.6, metalness: 0.2 });
  // Unknown (hero models): keep but clone so per-instance tweaks are safe.
  const c = src.clone();
  if ("color" in c && c instanceof THREE.MeshStandardMaterial) c.color = color;
  return c;
}

/** The author's material, untouched, except the paint: a per-car copy so the tint never leaks into the GLTF cache. */
function authoredMaterial(src: THREE.Material, paintName: string, paint: THREE.Color): THREE.Material {
  if (src.name !== paintName || !("color" in src)) return src;
  const m = src.clone() as THREE.MeshStandardMaterial;
  m.color.copy(paint);
  m.userData.isPaint = true;
  return m;
}

export default function CarModel({ url, rotationY = 0, length, paintMaterial, paintHex, wheelSpin, onAnchors, instantPaint, keepMaterials = false }: CarModelProps) {
  const { scene } = useGLTF(url);
  const target = useMemo(() => new THREE.Color(paintHex), [paintHex]);

  const { root, paints, wheels, anchors, size } = useMemo(() => {
    const root = scene.clone(true);
    const paints: THREE.MeshStandardMaterial[] = [];
    const wheels: THREE.Object3D[] = [];
    const startPaint = new THREE.Color(paintHex);
    root.traverse((o) => {
      if (/wheel/i.test(o.name) && !wheels.some((w) => o.parent && w === o.parent)) wheels.push(o);
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = mats.map((m) => (keepMaterials ? authoredMaterial(m, paintMaterial, startPaint) : studioMaterial(m, paintMaterial, startPaint)));
      next.forEach((m) => m.userData.isPaint && paints.push(m as THREE.MeshStandardMaterial));
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
    });
    // Normalize orientation, scale and floor contact.
    const holder = new THREE.Group();
    holder.add(root);
    root.rotation.y = THREE.MathUtils.degToRad(rotationY);
    root.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(root);
    const raw = box.getSize(new THREE.Vector3());
    const s = length / Math.max(raw.z, raw.x, 1e-3);
    root.scale.setScalar(s);
    root.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    root.position.set(-c.x, -box.min.y, -c.z);
    root.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());

    // Hotspot anchors (car faces +Z; driver sits on +X / left-hand side).
    const W = size.x, H = size.y, L = size.z;
    let tire = new THREE.Vector3(W * 0.5, H * 0.22, L * 0.3);
    const fl = wheels.find((w) => /front[-_ ]?left/i.test(w.name)) ?? wheels.find((w) => /front/i.test(w.name));
    if (fl) {
      const p = new THREE.Box3().setFromObject(fl).getCenter(new THREE.Vector3());
      tire = new THREE.Vector3(Math.sign(p.x || 1) * (W * 0.5 + 0.02), p.y, p.z);
    }
    const anchors: HotspotAnchors = {
      odometer: new THREE.Vector3(W * 0.2, H * 0.74, L * 0.13),
      "driver-seat": new THREE.Vector3(W * 0.24, H * 0.86, -L * 0.06),
      engine: new THREE.Vector3(0, H * 0.6, L * 0.4),
      tires: tire,
    };
    return { root: holder, paints, wheels, anchors, size };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, rotationY, length, paintMaterial, keepMaterials]);

  const reported = useRef<THREE.Object3D | null>(null);
  useLayoutEffect(() => {
    if (reported.current !== root) {
      reported.current = root;
      onAnchors?.(anchors, size);
    }
    if (instantPaint) paints.forEach((p) => p.color.copy(target));
  }, [root, anchors, size, onAnchors, instantPaint, paints, target]);

  useFrame((_, dt) => {
    // Eased paint tween.
    for (const p of paints) {
      if (!p.color.equals(target)) {
        tmpColor.copy(p.color).lerp(target, 1 - Math.exp(-dt * 3.5));
        p.color.copy(tmpColor);
      }
    }
    const spin = wheelSpin?.current ?? 0;
    // eslint-disable-next-line react-hooks/immutability -- three.js scene graph is mutated imperatively per frame
    if (spin) for (const w of wheels) w.rotation.x += spin * dt;
  });

  return <primitive object={root} />;
}

useGLTF.preload("/models/sedan.glb");
useGLTF.preload("/models/suv.glb");
useGLTF.preload("/models/truck.glb");
