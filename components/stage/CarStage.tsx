"use client";

// The persistent 3D stage. One fixed, full-viewport canvas lives in the dashboard layout and
// never unmounts between pages. Pages and scroll sections set a target pose on the director
// (lib/client/director.ts); every frame the camera and the car ease toward it, so a route change
// flies the car across the screen and scrolling scrubs the camera.
//
// Mount with next/dynamic({ ssr: false }).

import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import CarModel, { type HotspotAnchors } from "@/components/three/CarModel";
import { resolveModel } from "@/components/three/models";
import { useDirector, type Pose, type V3 } from "@/lib/client/director";
import { useTheme } from "@/lib/client/hooks";
import { useUiStore } from "@/lib/client/ui-store";
import type { Hotspot, Vehicle } from "@/lib/types";
import { CarSilhouette } from "@/components/dashboard/CarSilhouette";

const PREVIEW_OFFSET = 1.45;
const PREVIEW_PAINT = "#D8DCE1";

const PALETTE = {
  light: { exposure: 1.0, shadow: 0.45, catcher: 0.12 },
  dark: { exposure: 1.15, shadow: 0.7, catcher: 0.3 },
};

// Pointer position, -1..1, written by a window listener (the canvas itself ignores the pointer).
const pointer = { x: 0, y: 0 };

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    if (process.env.NODE_ENV !== "production") console.warn("[CarStage] falling back to 2D:", err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function CarStage({ vehicle, active = true }: { vehicle?: Vehicle; active?: boolean }) {
  const [theme] = useTheme();
  const replayOpen = useUiStore((s) => s.replay !== null);
  const [webgl] = useState<boolean | null>(() => (typeof window === "undefined" ? null : hasWebGL()));
  const calloutRef = useRef<HTMLDivElement>(null);
  const calloutText = useDirector((s) => s.calloutText);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const onVis = () => setHidden(document.hidden);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const pal = PALETTE[theme];

  if (!vehicle) return <div className="pointer-events-none fixed inset-0 z-0" style={{ background: "var(--bg)" }} aria-hidden />;

  const fallback = (
    <div className="pointer-events-none fixed inset-0 z-0 grid place-items-center" aria-hidden>
      <div className="w-[min(560px,70vw)] translate-x-[18vw] opacity-90 max-lg:translate-x-0 max-lg:-translate-y-[18vh]">
        <CarSilhouette bodyStyle={vehicle.bodyStyle} paint={vehicle.paintHex} className="h-auto w-full" />
      </div>
    </div>
  );

  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-[400ms] ease-ui-soft"
        style={{ background: "var(--bg)", opacity: active ? 1 : 0, visibility: active ? "visible" : "hidden", transitionProperty: "opacity, visibility" }}
        aria-hidden
      >
        {webgl === false ? (
          fallback
        ) : webgl === null ? null : (
          <Boundary fallback={fallback}>
            <Canvas
              shadows={{ type: THREE.PCFShadowMap }}
              dpr={[1, 1.75]}
              frameloop={replayOpen || hidden || !active ? "never" : "always"}
              camera={{ position: [6.6, 2.1, 7.6], fov: 29, near: 0.1, far: 120 }}
              gl={{ antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" }}
              onCreated={({ gl }) => {
                gl.setClearColor(0x000000, 0);
                // Khronos PBR Neutral: base colors come out as authored (ACES shifted hues and desaturated paint).
                gl.toneMapping = THREE.NeutralToneMapping;
              }}
            >
              <Suspense fallback={null}>
                <Scene vehicle={vehicle} pal={pal} calloutRef={calloutRef} />
              </Suspense>
            </Canvas>
          </Boundary>
        )}
      </div>
      {/* Callout pinned to the active hotspot; positioned every frame by the scene. */}
      <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden" style={{ display: active ? undefined : "none" }} aria-hidden>
        <div ref={calloutRef} className="nm-callout absolute top-0 left-0 opacity-0" style={{ transform: "translate(-999px,-999px)" }}>
          <span className="nm-callout-dot" />
          <span className="nm-callout-line" />
          <span className="nm-callout-label">{calloutText}</span>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- scene

type Phase = "idle" | "out" | "in";
const easeIn = (t: number) => t * t * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const vehicleKey = (v: Vehicle) => `${v.modelAsset}|${v.vin}`;

function clonePose(p: Pose): Pose {
  return { ...p, eye: [...p.eye] as V3, target: [...p.target] as V3, offset: [...p.offset], mobileOffset: [...p.mobileOffset] };
}

const TAU = Math.PI * 2;

function Scene({ vehicle, pal, calloutRef }: { vehicle: Vehicle; pal: (typeof PALETTE)["light"]; calloutRef: RefObject<HTMLDivElement | null> }) {
  const reduced = useUiStore((s) => s.reducedMotion);
  const panelOpen = useUiStore((s) => s.agentPanelOpen);
  const preview = useDirector((s) => s.preview);
  const gl = useThree((s) => s.gl);
  const [shown, setShown] = useState(vehicle);
  const carGroup = useRef<THREE.Group>(null);
  const previewGroup = useRef<THREE.Group>(null);
  const wheelSpin = useRef(0);
  const previewSpin = useRef(0);
  const anchors = useRef<HotspotAnchors | null>(null);
  const cur = useRef<Pose>(clonePose(useDirector.getState().pose));
  const motion = useRef({ spin: 0, lastDrag: -10, px: 0, py: 0, phase: "idle" as Phase, t: 0, pending: null as Vehicle | null, carX: 0, previewX: 16, calloutA: 0, shift: 0 });
  const tmp = useMemo(() => ({ eye: new THREE.Vector3(), target: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), p: new THREE.Vector3() }), []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- the renderer is configured imperatively
    gl.toneMappingExposure = pal.exposure;
  }, [gl, pal.exposure]);

  const model = useMemo(() => resolveModel(shown.modelAsset, shown.bodyStyle), [shown.modelAsset, shown.bodyStyle]);
  const previewModel = useMemo(() => (preview ? resolveModel(preview.modelAsset, preview.bodyStyle) : null), [preview]);
  // Keep the last preview mounted while it slides out.
  const [previewShown, setPreviewShown] = useState(previewModel);
  if (previewModel && previewModel !== previewShown) setPreviewShown(previewModel);

  // Persona change: drive off, swap, roll in.
  useEffect(() => {
    if (vehicleKey(vehicle) === vehicleKey(shown)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- same car, new paint or odometer
      if (vehicle.paintHex !== shown.paintHex || vehicle.odometer !== shown.odometer) setShown(vehicle);
      return;
    }
    if (reduced) {
      setShown(vehicle);
      return;
    }
    const m = motion.current;
    m.phase = "out";
    m.t = 0;
    m.pending = vehicle;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle]);

  const onAnchors = useCallback((a: HotspotAnchors) => {
    anchors.current = a;
  }, []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const { pose, takeDrag } = useDirector.getState();
    const m = motion.current;
    const c = cur.current;
    const now = state.clock.elapsedTime;

    // Ease the current pose toward the director's target.
    const k = reduced ? 1 : 1 - Math.exp(-dt * 3.4);
    for (let i = 0; i < 3; i++) {
      c.eye[i] += (pose.eye[i] - c.eye[i]) * k;
      c.target[i] += (pose.target[i] - c.target[i]) * k;
    }
    c.fov += (pose.fov - c.fov) * k;
    for (let i = 0; i < 2; i++) {
      c.offset[i] += (pose.offset[i] - c.offset[i]) * k;
      c.mobileOffset[i] += (pose.mobileOffset[i] - c.mobileOffset[i]) * k;
    }
    c.yaw += (pose.yaw - c.yaw) * k;

    // Turntable: user drag, idle spin, then settle back to a whole turn.
    const drag = takeDrag();
    if (drag) {
      m.spin += drag;
      m.lastDrag = now;
    }
    const sinceDrag = now - m.lastDrag;
    if (pose.spin > 0 && !reduced && sinceDrag > 2.5) {
      m.spin += pose.spin * dt;
    } else if (pose.spin === 0 && sinceDrag > 1.2) {
      const home = Math.round(m.spin / TAU) * TAU;
      m.spin += (home - m.spin) * (reduced ? 1 : 1 - Math.exp(-dt * 2.2));
    }

    // Persona transition.
    const g = carGroup.current;
    if (m.phase === "out") {
      m.t = Math.min(1, m.t + dt / 0.8);
      if (g) g.position.z = easeIn(m.t) * 18;
      wheelSpin.current = 6 + m.t * 22;
      if (m.t >= 1 && m.pending) {
        setShown(m.pending);
        m.pending = null;
        m.phase = "in";
        m.t = 0;
        if (g) g.position.z = -18;
      }
    } else if (m.phase === "in") {
      m.t = Math.min(1, m.t + dt / 1.1);
      if (g) g.position.z = -18 + easeOut(m.t) * 18;
      wheelSpin.current = (1 - m.t) * 26;
      if (m.t >= 1) {
        m.phase = "idle";
        wheelSpin.current = 0;
      }
    }

    // Upgrade preview: slide the second car in beside the first.
    const ks = reduced ? 1 : 1 - Math.exp(-dt * 3);
    const prevX = m.previewX;
    m.carX += ((preview ? -PREVIEW_OFFSET : 0) - m.carX) * ks;
    m.previewX += ((preview ? PREVIEW_OFFSET : 16) - m.previewX) * ks;
    const yaw = c.yaw + m.spin;
    if (g) {
      g.position.x = m.carX;
      g.rotation.y = yaw;
    }
    if (previewGroup.current) {
      previewGroup.current.position.x = m.previewX;
      previewGroup.current.rotation.y = yaw;
      previewGroup.current.visible = m.previewX < 15;
    }
    previewSpin.current = Math.abs(m.previewX - prevX) / Math.max(dt, 1e-3) / 0.35;

    // Camera: eased pose plus a little pointer parallax.
    if (!reduced) {
      m.px += (pointer.x - m.px) * (1 - Math.exp(-dt * 2));
      m.py += (pointer.y - m.py) * (1 - Math.exp(-dt * 2));
    }
    const cam = state.camera as THREE.PerspectiveCamera;
    tmp.eye.set(...c.eye);
    tmp.target.set(...c.target);
    tmp.right.subVectors(tmp.target, tmp.eye).cross(tmp.up).normalize();
    const dist = tmp.eye.distanceTo(tmp.target);
    tmp.eye.addScaledVector(tmp.right, m.px * dist * 0.035).addScaledVector(tmp.up, -m.py * dist * 0.02);
    cam.position.copy(tmp.eye);
    cam.lookAt(tmp.target);
    cam.fov = c.fov;
    const { width: w, height: h } = state.size;
    const aspect = w / Math.max(1, h);
    const portrait = aspect < 0.95;
    // The copilot slides over the right edge on desktop: move the car out from under it.
    const shiftTo = panelOpen && w >= 1024 ? -Math.min(0.17, 440 / w) : 0;
    m.shift += (shiftTo - m.shift) * (reduced ? 1 : 1 - Math.exp(-dt * 3));
    const [ox, oy] = portrait ? c.mobileOffset : [c.offset[0] + m.shift, c.offset[1]];
    // Shots are framed for a 16:10 window. Narrower screens pull the camera back so the car keeps
    // the same width on screen instead of being cropped.
    const fit = aspect < 1.6 ? Math.min(2.6, Math.pow(1.6 / aspect, 0.75)) : 1;
    if (fit > 1) cam.position.lerp(tmp.target, 1 - fit);
    cam.setViewOffset(w, h, -ox * w, oy * h, w, h);
    cam.updateProjectionMatrix();

    // Callout: project the hotspot anchor into the DOM overlay.
    const el = calloutRef.current;
    const anc = anchors.current;
    const want = pose.callout && anc && m.phase === "idle" ? 1 : 0;
    m.calloutA += (want - m.calloutA) * (reduced ? 1 : 1 - Math.exp(-dt * 6));
    if (el) {
      if (pose.callout && anc && g) {
        g.updateMatrixWorld();
        tmp.p.copy(anc[pose.callout as Hotspot]).applyMatrix4(g.matrixWorld);
        tmp.p.project(cam);
        const x = ((tmp.p.x + 1) / 2) * w;
        const y = ((1 - tmp.p.y) / 2) * h;
        const onScreen = tmp.p.z < 1 && x > 8 && x < w - 8 && y > 8 && y < h - 8;
        el.style.transform = `translate(${x}px, ${y}px)`;
        el.style.opacity = String(onScreen ? m.calloutA : 0);
      } else {
        el.style.opacity = String(m.calloutA < 0.02 ? 0 : m.calloutA);
      }
    }
  });

  return (
    <>
      {/* A neutral white studio: a softbox overhead, two side strips, a low fill. No colored lights,
          so paint, chrome and glass show the colors their authors gave them. */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={4} color="#ffffff" position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[12, 5, 1]} />
        <Lightformer form="rect" intensity={2} color="#ffffff" position={[-6, 2, 2]} rotation={[0, Math.PI / 2, 0]} scale={[10, 2.5, 1]} />
        <Lightformer form="rect" intensity={2} color="#ffffff" position={[6, 2, -2]} rotation={[0, -Math.PI / 2, 0]} scale={[10, 2.5, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#ffffff" position={[0, 1, 8]} scale={[10, 1, 1]} />
      </Environment>
      <ambientLight intensity={0.25} />
      <directionalLight position={[4, 8, 5]} intensity={2} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} />

      <group ref={carGroup}>
        <CarModel
          key={model.url}
          url={model.url}
          rotationY={model.rotationY}
          length={model.isHero ? model.length : model.length * 0.92}
          paintMaterial={model.paintMaterial}
          paintHex={shown.paintHex}
          keepMaterials={model.isHero}
          wheelSpin={wheelSpin}
          onAnchors={onAnchors}
        />
      </group>

      {previewShown && (
        <group ref={previewGroup} position={[16, 0, 0]}>
          <CarModel
            key={previewShown.url}
            url={previewShown.url}
            rotationY={previewShown.rotationY}
            length={previewShown.isHero ? previewShown.length : previewShown.length * 0.92}
            paintMaterial={previewShown.paintMaterial}
            paintHex={PREVIEW_PAINT}
            keepMaterials={previewShown.isHero}
            wheelSpin={previewSpin}
          />
        </group>
      )}

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <shadowMaterial transparent opacity={pal.catcher} />
      </mesh>
      <ContactShadows position={[0, 0.002, 0]} opacity={pal.shadow} scale={14} blur={2.4} far={2.6} resolution={512} color="#000000" frames={Infinity} />
    </>
  );
}
