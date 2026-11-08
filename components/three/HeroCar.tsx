"use client";
// Hero 3D car for the vehicle card. Mount with next/dynamic({ ssr: false }).
// Studio stage (lightformer environment, reflective floor, contact shadow), drag-to-orbit,
// idle auto-rotate, hotspots that fly the camera, persona drive-off/roll-in transition and an
// upgrade preview that slides a second model in beside the current one.
import "./hero.css";
import { useShouldReduceMotion } from "@animate-ui/react/utils/motion";
import { CameraControls, ContactShadows, Environment, Lightformer, MeshReflectorMaterial } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import type { Hotspot, MoveOption, Vehicle } from "@/lib/types";
import { useUiStore } from "@/lib/client/ui-store";
import CarModel, { type HotspotAnchors } from "./CarModel";
import CarSilhouette from "./CarSilhouette";
import { resolveModel, type ResolvedModel } from "./models";

export interface HeroCarProps {
  vehicle: Vehicle;
  upgradePreview?: MoveOption["upgradeModel"];
  className?: string;
  /** Key number per hotspot shown in the glass tooltip, e.g. { odometer: "41,200 mi · 3,900 over" }. */
  hotspotLabels?: Partial<Record<Hotspot, string>>;
  /** Called after a hotspot is clicked (the store's activeHotspot is also set). */
  onHotspotSelect?(h: Hotspot): void;
}

const HOTSPOTS: { id: Hotspot; title: string; move: string }[] = [
  { id: "odometer", title: "Odometer", move: "Lease-end" },
  { id: "tires", title: "Tires", move: "Tire & wheel" },
  { id: "engine", title: "Engine bay", move: "Protection" },
  { id: "driver-seat", title: "Driver seat", move: "Insurance" },
];

const HOME = { pos: new THREE.Vector3(7.4, 2.7, 8.4), target: new THREE.Vector3(0, 0.65, 0) };
const PREVIEW_HOME = { pos: new THREE.Vector3(4.2, 3.4, 13.2), target: new THREE.Vector3(0, 0.7, 0) };
const PREVIEW_OFFSET = 2.3; // x offset for side-by-side
const PREVIEW_PAINT = "#D8DCE1";
const BG = "#0c0e14";

function defaultLabel(h: Hotspot, v: Vehicle): string {
  switch (h) {
    case "odometer":
      return `${v.odometer.toLocaleString("en-US")} mi on the clock`;
    case "tires":
      return "Tire & wheel exposure";
    case "engine":
      return "ToyotaCare & service";
    case "driver-seat":
      return "Your driving score";
  }
}

function vehicleKey(v: Vehicle) {
  return `${v.modelAsset}|${v.vin}`;
}

// ---------------- error boundary ----------------
class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    if (process.env.NODE_ENV !== "production") console.warn("[HeroCar] falling back to 2D:", err);
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

// ---------------- main component ----------------
export default function HeroCar({ vehicle, upgradePreview, className, hotspotLabels, onHotspotSelect }: HeroCarProps) {
  const reducedMotion = useUiStore((s) => s.reducedMotion);
  const reduceDomMotion = useShouldReduceMotion();
  const [pageVisible, setPageVisible] = useState(true);
  const activeHotspot = useUiStore((s) => s.activeHotspot);
  // Pause the hero render loop while the 3D replay is open (one heavy WebGL view at a time).
  const replayOpen = useUiStore((s) => s.replay !== null);
  const setHotspot = useUiStore((s) => s.setHotspot);
  const [webgl] = useState<boolean | null>(() => (typeof window === "undefined" ? null : hasWebGL()));
  const [visible, setVisible] = useState(true);
  const [resetTick, setResetTick] = useState(0);
  const [shown, setShown] = useState(vehicle);
  const rootRef = useRef<HTMLDivElement>(null);
  // Hotspot dots + preview tag are plain DOM, positioned each frame by the scene (no drei <Html>).
  const overlay = useRef<OverlayEls>({ dots: {}, tag: null });
  const [dotsReady, setDotsReady] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const labels = useMemo(() => {
    const out = {} as Record<Hotspot, string>;
    for (const h of HOTSPOTS) out[h.id] = hotspotLabels?.[h.id] ?? defaultLabel(h.id, shown);
    return out;
  }, [hotspotLabels, shown]);

  const select = useCallback(
    (h: Hotspot | null) => {
      setHotspot(h);
      if (h) onHotspotSelect?.(h);
    },
    [setHotspot, onHotspotSelect],
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" || e.key.toLowerCase() === "r") {
      select(null);
      setResetTick((t) => t + 1);
    }
    const n = Number(e.key);
    if (n >= 1 && n <= HOTSPOTS.length) select(HOTSPOTS[n - 1].id);
  };

  const fallback = <CarSilhouette bodyStyle={shown.bodyStyle} paintHex={shown.paintHex} label={`${shown.year} Toyota ${shown.model}`} />;

  return (
    <div
      ref={rootRef}
      data-motion-paused={!visible || !pageVisible || replayOpen || !dotsReady}
      tabIndex={0}
      onKeyDown={onKey}
      aria-label={`3D view of your ${vehicle.year} Toyota ${vehicle.model}. Drag to orbit, keys 1 to 4 focus hotspots, R resets the view.`}
      className={`nm-hero relative isolate h-full min-h-[320px] w-full overflow-hidden rounded-lg bg-[radial-gradient(120%_90%_at_50%_10%,#1d2230_0%,#0b0d13_55%,#05060a_100%)] text-white outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${reduceDomMotion ? "nm-reduced" : ""} ${className ?? ""}`}
    >
      {webgl === false ? (
        fallback
      ) : webgl === null ? null : (
        <Boundary fallback={fallback}>
          <Canvas
            shadows={{ type: THREE.PCFShadowMap }}
            dpr={[1, 1.5]}
            frameloop={visible && !replayOpen ? "always" : "never"}
            camera={{ position: HOME.pos.toArray(), fov: 32, near: 0.1, far: 80 }}
            gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
            onCreated={({ gl }) => {
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.25;
            }}
          >
            <Suspense fallback={null}>
              <Stage
                vehicle={vehicle}
                shown={shown}
                setShown={setShown}
                upgradePreview={upgradePreview}
                activeHotspot={activeHotspot}
                labels={labels}
                reducedMotion={reducedMotion}
                resetTick={resetTick}
                onSelect={select}
                overlay={overlay}
                onDotsReady={setDotsReady}
              />
            </Suspense>
          </Canvas>
        </Boundary>
      )}

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(130%_100%_at_50%_35%,transparent_45%,rgba(0,0,0,0.55)_100%)]" />
      {/* Hotspot dots (projected from 3D anchors every frame) */}
      {webgl && (
        <div className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ease-ui-out ${dotsReady ? "opacity-100" : "opacity-0"}`} aria-hidden={!dotsReady} inert={!dotsReady}>
          {HOTSPOTS.map((h) => {
            const active = activeHotspot === h.id;
            return (
              <div key={h.id} ref={(el) => { overlay.current.dots[h.id] = el; }} className={`nm-hotspot absolute left-0 top-0 ${active ? "is-active" : ""}`} style={{ transform: "translate(-999px,-999px)" }}>
                <button
                  type="button"
                  tabIndex={dotsReady ? 0 : -1}
                  className="nm-hotspot-dot pointer-events-auto -translate-x-1/2 -translate-y-1/2"
                  aria-label={`${h.title}: ${labels[h.id]}. Opens ${h.move}.`}
                  aria-pressed={active}
                  onClick={() => select(active ? null : h.id)}
                >
                  <span className="nm-hotspot-ring" />
                  <span className="nm-hotspot-core" />
                </button>
                {active && (
                  <div className="nm-tip" role="status">
                    <p className="nm-tip-k">{h.title} · {h.move}</p>
                    <p className="nm-tip-v">{labels[h.id]}</p>
                  </div>
                )}
              </div>
            );
          })}
          {upgradePreview && (
            <div ref={(el) => { overlay.current.tag = el; }} className="absolute left-0 top-0" style={{ transform: "translate(-999px,-999px)" }}>
              <div className="nm-tag -translate-x-1/2 -translate-y-1/2">Preview · {upgradePreview.name}</div>
            </div>
          )}
        </div>
      )}

      {/* Overlay: title, legend, reset */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 sm:p-4">
        <div className="rounded-lg border border-white/10 bg-black/35 px-3 py-2 backdrop-blur-md">
          <p className="text-[11px] text-white/55">Your vehicle</p>
          <p className="text-sm font-semibold">{shown.year} Toyota {shown.model}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            select(null);
            setResetTick((t) => t + 1);
          }}
          className="pointer-events-auto h-9 rounded-full border border-white/15 bg-black/35 px-3 text-xs font-medium text-white/85 backdrop-blur-md transition-[background-color] duration-200 ease-ui-color hover:bg-white/10"
          title="Reset view (R)"
        >
          Reset view
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 p-3 sm:p-4">
        <ul className="flex flex-wrap gap-1.5" aria-label="Vehicle hotspots">
          {HOTSPOTS.map((h, i) => (
            <li key={h.id}>
              <button
                type="button"
                aria-pressed={activeHotspot === h.id}
                onClick={() => select(activeHotspot === h.id ? null : h.id)}
                className={`flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium backdrop-blur-md transition-[color,background-color,border-color] duration-200 ease-ui-color ${activeHotspot === h.id ? "border-white/70 bg-white text-black" : "border-white/12 bg-black/35 text-white/80 hover:bg-white/10"}`}
                title={`${h.title} → ${h.move} (${i + 1})`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${activeHotspot === h.id ? "bg-[#EB0A1E]" : "bg-white/80"}`} />
                {h.title}
              </button>
            </li>
          ))}
        </ul>
        {upgradePreview && (
          <p className="rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] text-white/75 backdrop-blur-md">
            Preview: <span className="font-semibold text-white">{upgradePreview.name}</span>
          </p>
        )}
        <p className="hidden w-full text-[10px] text-white/40 sm:block">Drag to rotate · scroll to zoom</p>
      </div>
    </div>
  );
}

// ---------------- scene ----------------
interface StageProps {
  vehicle: Vehicle;
  shown: Vehicle;
  setShown(v: Vehicle): void;
  upgradePreview?: MoveOption["upgradeModel"];
  activeHotspot: Hotspot | null;
  labels: Record<Hotspot, string>;
  reducedMotion: boolean;
  resetTick: number;
  onSelect(h: Hotspot | null): void;
  overlay: RefObject<OverlayEls>;
  onDotsReady(v: boolean): void;
}

interface OverlayEls {
  dots: Partial<Record<Hotspot, HTMLElement | null>>;
  tag: HTMLElement | null;
}

const projV = new THREE.Vector3();
function place(el: HTMLElement | null | undefined, world: THREE.Vector3, camera: THREE.Camera, w: number, h: number, dim = false) {
  if (!el) return;
  projV.copy(world).project(camera);
  if (projV.z > 1) {
    el.style.transform = "translate(-999px,-999px)";
    return;
  }
  el.style.transform = `translate(${((projV.x + 1) / 2) * w}px, ${((1 - projV.y) / 2) * h}px)`;
  el.style.opacity = dim ? "0.35" : "1";
}

type Phase = "idle" | "out" | "in";
const easeIn = (t: number) => t * t * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function Stage({ vehicle, shown, setShown, upgradePreview, activeHotspot, reducedMotion, resetTick, onSelect, overlay, onDotsReady }: StageProps) {
  const controls = useRef<CameraControls>(null);
  const carGroup = useRef<THREE.Group>(null);
  const previewGroup = useRef<THREE.Group>(null);
  const wheelSpin = useRef(0);
  const previewSpin = useRef(0);
  const anchorsRef = useRef<HotspotAnchors | null>(null);
  const [anchors, setAnchors] = useState<HotspotAnchors | null>(null);
  const [moving, setMoving] = useState(false);
  const lastInteract = useRef(-10);
  const anim = useRef({ phase: "idle" as Phase, t: 0, pending: null as Vehicle | null, previewX: 14, previewTarget: 14, carX: 0, carTarget: 0 });
  const invalidate = useThree((s) => s.invalidate);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  // Narrow/portrait cards: pull the home camera back so the whole car fits.
  const home = useCallback(
    (preview: boolean) => {
      const v = preview ? PREVIEW_HOME : HOME;
      const k = aspect < 1.35 ? Math.min(2, Math.pow(1.35 / aspect, 0.7)) : 1;
      return { pos: v.target.clone().add(v.pos.clone().sub(v.target).multiplyScalar(k)), target: v.target };
    },
    [aspect],
  );

  const model: ResolvedModel = useMemo(() => resolveModel(shown.modelAsset, shown.bodyStyle), [shown.modelAsset, shown.bodyStyle]);
  const previewModel = useMemo(() => (upgradePreview ? resolveModel(upgradePreview.modelAsset, upgradePreview.bodyStyle) : null), [upgradePreview]);
  // Keep the last preview model mounted while it slides out.
  const [previewShown, setPreviewShown] = useState(previewModel);
  if (previewModel && previewModel !== previewShown) setPreviewShown(previewModel);

  // Persona change → drive off, swap, roll in.
  useEffect(() => {
    if (vehicleKey(vehicle) === vehicleKey(shown)) {
      if (vehicle.paintHex !== shown.paintHex || vehicle.odometer !== shown.odometer) setShown(vehicle);
      return;
    }
    if (reducedMotion) {
      setShown(vehicle);
      return;
    }
    anim.current.phase = "out";
    anim.current.t = 0;
    anim.current.pending = vehicle;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starts the imperative drive-off animation
    setMoving(true);
    onSelect(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle]);

  // Upgrade preview slide.
  useEffect(() => {
    const a = anim.current;
    a.carTarget = upgradePreview ? -PREVIEW_OFFSET : 0;
    a.previewTarget = upgradePreview ? PREVIEW_OFFSET : 14;
    if (reducedMotion) {
      a.carX = a.carTarget;
      a.previewX = a.previewTarget;
    }
    const c = controls.current;
    if (c && !activeHotspot) {
      const v = home(!!upgradePreview);
      c.setLookAt(...v.pos.toArray(), ...v.target.toArray(), !reducedMotion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upgradePreview, reducedMotion]);

  // Hotspot flights (from clicks or the agent via the store).
  const flyTo = useCallback(
    (h: Hotspot | null) => {
      const c = controls.current;
      if (!c) return;
      const smooth = !reducedMotion;
      const offset = anim.current.carX;
      if (!h || !anchorsRef.current) {
        const v = home(!!upgradePreview);
        c.setLookAt(...v.pos.toArray(), ...v.target.toArray(), smooth);
        return;
      }
      const p = anchorsRef.current[h].clone();
      p.x += offset;
      const views: Record<Hotspot, THREE.Vector3> = {
        odometer: new THREE.Vector3(3.6, 2.6, 3.4),
        "driver-seat": new THREE.Vector3(4.6, 1.9, -1.2),
        engine: new THREE.Vector3(2.2, 2.6, 4.8),
        tires: new THREE.Vector3(4.2, 0.9, 2.6),
      };
      const eye = p.clone().add(views[h]);
      c.setLookAt(eye.x, eye.y, eye.z, p.x, p.y, p.z, smooth);
    },
    [reducedMotion, upgradePreview, home],
  );

  useEffect(() => {
    flyTo(activeHotspot);
    lastInteract.current = performance.now() / 1000;
  }, [activeHotspot, flyTo, anchors]);

  useEffect(() => {
    if (!activeHotspot) {
      const v = home(!!upgradePreview);
      controls.current?.setLookAt(...v.pos.toArray(), ...v.target.toArray(), false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home]);

  useEffect(() => {
    if (resetTick) flyTo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetTick]);

  useEffect(() => {
    onDotsReady(!!anchors && !moving);
  }, [anchors, moving, onDotsReady]);

  const worldTmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, dt) => {
    const a = anim.current;
    const g = carGroup.current;
    // Persona transition.
    if (a.phase === "out") {
      a.t = Math.min(1, a.t + dt / 0.85);
      if (g) g.position.z = easeIn(a.t) * 16;
      wheelSpin.current = 6 + a.t * 22;
      if (a.t >= 1 && a.pending) {
        setShown(a.pending);
        a.pending = null;
        a.phase = "in";
        a.t = 0;
        if (g) g.position.z = -16;
      }
    } else if (a.phase === "in") {
      a.t = Math.min(1, a.t + dt / 1.15);
      if (g) g.position.z = -16 + easeOut(a.t) * 16;
      wheelSpin.current = (1 - a.t) * 26;
      if (a.t >= 1) {
        a.phase = "idle";
        wheelSpin.current = 0;
        setMoving(false);
      }
    }
    // Upgrade preview slide (both cars roll sideways? no: they slide; wheels turn on the preview).
    const k = 1 - Math.exp(-dt * 3);
    const prevX = a.previewX;
    a.carX += (a.carTarget - a.carX) * k;
    a.previewX += (a.previewTarget - a.previewX) * k;
    if (g) g.position.x = a.carX;
    if (previewGroup.current) {
      previewGroup.current.position.x = a.previewX;
      previewGroup.current.visible = a.previewX < 13.5;
    }
    previewSpin.current = Math.abs(a.previewX - prevX) / Math.max(dt, 1e-3) / 0.35;

    // Idle auto-rotate.
    const c = controls.current;
    const now = state.clock.elapsedTime;
    if (c && !reducedMotion && !activeHotspot && !upgradePreview && now - lastInteract.current > 4 && a.phase === "idle") {
      c.azimuthAngle += dt * 0.12;
    }

    // Project hotspot anchors + preview tag into the DOM overlay.
    const { width, height } = state.size;
    const anc = anchorsRef.current;
    if (anc && g) {
      const camX = state.camera.position.x - g.position.x;
      for (const h of HOTSPOTS) {
        worldTmp.copy(anc[h.id]).add(g.position);
        // Dim dots on the far side of the car (driver-side anchors sit at +X).
        const far = anc[h.id].x > 0.3 && camX < -0.5;
        place(overlay.current?.dots[h.id], worldTmp, state.camera, width, height, far);
      }
    }
    if (previewGroup.current && overlay.current?.tag) {
      worldTmp.set(previewGroup.current.position.x, 2.3, 0);
      place(overlay.current.tag, worldTmp, state.camera, width, height);
    }
  });

  const onAnchors = useCallback((x: HotspotAnchors) => {
    anchorsRef.current = x;
    setAnchors(x);
  }, []);

  return (
    <>
      <CameraControls
        ref={controls}
        makeDefault
        minDistance={4}
        maxDistance={14}
        minPolarAngle={0.18 * Math.PI}
        maxPolarAngle={0.485 * Math.PI}
        smoothTime={0.32}
        draggingSmoothTime={0.12}
        truckSpeed={0}
        onStart={() => {
          lastInteract.current = Number.POSITIVE_INFINITY;
          invalidate();
        }}
        onEnd={() => {
          lastInteract.current = performance.now() / 1000;
        }}
      />

      {/* Studio lighting: local lightformers, no network HDR needed */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={5} color="#ffffff" position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[12, 5, 1]} />
        <Lightformer form="rect" intensity={2.6} color="#dfe8ff" position={[-6, 2, 2]} rotation={[0, Math.PI / 2, 0]} scale={[10, 2.5, 1]} />
        <Lightformer form="rect" intensity={2.6} color="#fff2e6" position={[6, 2, -2]} rotation={[0, -Math.PI / 2, 0]} scale={[10, 2.5, 1]} />
        <Lightformer form="ring" intensity={2} color="#EB0A1E" position={[0, 3, -8]} scale={3} />
        <Lightformer form="rect" intensity={0.8} color="#ffffff" position={[0, 1, 8]} scale={[10, 1, 1]} />
      </Environment>
      <ambientLight intensity={0.15} />
      <directionalLight position={[4, 7, 5]} intensity={2.4} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} />
      <spotLight position={[-5, 6, -4]} angle={0.5} penumbra={1} intensity={30} color="#9ab4ff" />

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
        <group ref={previewGroup} position={[14, 0, 0]}>
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

      {/* Floor: soft reflection + contact shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <circleGeometry args={[40, 64]} />
        <MeshReflectorMaterial
          resolution={512}
          blur={[400, 120]}
          mixBlur={1}
          mixStrength={1.6}
          mixContrast={1}
          roughness={0.9}
          depthScale={1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
          color="#0c0e14"
          metalness={0.55}
          mirror={0}
        />
      </mesh>
      <ContactShadows position={[0, 0.002, 0]} opacity={0.75} scale={16} blur={2.2} far={3} resolution={512} color="#000000" frames={Infinity} />
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 12, 26]} />
    </>
  );
}
