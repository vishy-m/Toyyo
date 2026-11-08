"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight, Pause, Play, RotateCw, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { getCaseSummary } from "@/lib/cinematic/cases";
import { getVehicle, VEHICLES } from "@/lib/cinematic/vehicles";
import { CarDashboard } from "./CarDashboard";
import { carName, carPath, pageTitle, parseCarPath, type SectionId } from "./sections";
import { centeredIndex, DRIFT_SPEED, easeOut, offsetFor, POSES, POSTERS, progress, projectBox, railDelta, SLOT_FILL, snapOffset, StageController, TIMING, type Phase } from "./stage-controller";
import "./cinematic.css";

const VehicleStage = dynamic(() => import("./VehicleStage"), { ssr: false });

const COUNT = VEHICLES.length;
const ALL_IDS = VEHICLES.map((vehicle) => vehicle.id);
/** Nominal car body (metres) for layout before a model has loaded; the stage fits the real bounds. */
const BODY = { width: 1.95, height: 1.6 };
/** Each car's footprint on screen in the carousel's side three-quarter (metres). Lengths are real. */
const CAROUSEL_SIZE = VEHICLES.map((vehicle) => projectBox(BODY.width, BODY.height, vehicle.model.length, POSES.carousel));
const AVERAGE_WIDTH = CAROUSEL_SIZE.reduce((sum, size) => sum + size.w, 0) / CAROUSEL_SIZE.length;
const MAX_WIDTH = Math.max(...CAROUSEL_SIZE.map((size) => size.w));
const MAX_HEIGHT = Math.max(...CAROUSEL_SIZE.map((size) => size.h));
/** Carousel cars a little smaller than the band would allow (design review), so more of them fit across. */
const CAR_SCALE = 0.82;
const SESSION_KEY = "toyyo:carousel";
const HOME_TITLE = "Toyyo · Your Toyyota";
const pad = (n: number) => String(n).padStart(2, "0");
const LICENSES: Record<string, string> = {
  "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC BY-NC 4.0": "https://creativecommons.org/licenses/by-nc/4.0/",
  "CC BY-NC-SA 4.0": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
};

function useMedia(query: string) {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", notify);
      return () => media.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** What the shell shows. `id` is retained while the car travels back to the carousel. */
interface View { id: string | null; phase: Phase; seq: number }

/** The URL is authoritative: map a route change onto the transition it implies. */
function viewForRoute(view: View, routeId: string | null): View | null {
  if (routeId) {
    if (view.id === routeId && (view.phase === "opening" || view.phase === "story")) return null;
    if (view.phase === "collection" || view.phase === "closing") return { id: routeId, phase: "opening", seq: view.seq + 1 };
    return { id: routeId, phase: "story", seq: view.seq + 1 };
  }
  if (view.phase === "collection" || view.phase === "closing") return null;
  return { id: view.id, phase: "closing", seq: view.seq + 1 };
}

const without = (set: ReadonlySet<string>, id: string) => { const next = new Set(set); next.delete(id); return next; };
const withId = (set: ReadonlySet<string>, id: string) => new Set(set).add(id);

/**
 * The experience owns "/" and "/cars/<vehicle>/<section>". On any other URL under its layout (an invalid
 * car page), Next renders the not-found page as the layout's children; the experience steps aside for it.
 */
export function CinematicExperience() {
  const pathname = usePathname();
  return parseCarPath(pathname).valid ? <Experience /> : null;
}

function Experience() {
  const pathname = usePathname();
  const route = parseCarPath(pathname);
  const routeId = route.vehicle?.id ?? null;

  // A direct link or reload opens the settled story; only a click from the carousel plays the transition.
  const [view, setView] = useState<View>(() => ({ id: routeId, phase: routeId ? "story" : "collection", seq: 0 }));
  const [seenRoute, setSeenRoute] = useState(routeId);
  if (seenRoute !== routeId) {
    setSeenRoute(routeId);
    const next = viewForRoute(view, routeId);
    if (next) setView(next);
  }

  // While returning to the carousel the URL is already "/", but the view keeps its last section.
  const [heldSection, setHeldSection] = useState<SectionId>(route.section);
  if (routeId && heldSection !== route.section) setHeldSection(route.section);
  const section = routeId ? route.section : heldSection;

  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const coarse = useMedia("(hover: none), (pointer: coarse)");
  const [pauseChoice, setPauseChoice] = useState<boolean | null>(null);
  const paused = pauseChoice ?? (reduced || coarse);
  const [hovered, setHovered] = useState(-1);
  const [trackHot, setTrackHot] = useState(false);
  const [focused, setFocused] = useState(-1);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dialog, setDialog] = useState<"about" | "credits" | null>(null);
  const [chatDock, setChatDock] = useState<HTMLDivElement | null>(null);
  const [webgl, setWebgl] = useState(true);
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const [posterMissing, setPosterMissing] = useState<ReadonlySet<string>>(() => new Set());
  const [topPosterMissing, setTopPosterMissing] = useState<ReadonlySet<string>>(() => new Set());
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const [mountAll, setMountAll] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [initialIds] = useState(() => routeId ? [routeId] : [0, 1, 2, 3, 4, COUNT - 1].map((i) => ALL_IDS[i]));
  const mounted = useMemo<ReadonlySet<string>>(() => new Set(mountAll ? ALL_IDS : initialIds), [mountAll, initialIds]);

  const controller = useRef<StageController>(null as unknown as StageController);
  if (controller.current === null) controller.current = new StageController(COUNT);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const mascotRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const geometry = useRef<{ widths: number[]; arc: number }>({ widths: [], arc: 12 });
  const shownRef = useRef<string | null>(null);
  const layoutDirty = useRef(true);
  const holdRef = useRef(false);
  const returnIndex = useRef(-1);
  const pushedFromCarousel = useRef(false);
  const suppressClick = useRef(false);
  const gesture = useRef<{ id: number; x: number; y: number; offset: number; moved: boolean; samples: [number, number][] } | null>(null);
  const initialRoute = useRef(routeId);
  const settledFrom = useRef<Phase | null>(null);

  const shown = view.id ? getVehicle(view.id) : undefined;
  const shownIndex = shown ? VEHICLES.indexOf(shown) : -1;
  const storyVisible = view.phase === "opening" || view.phase === "story";
  const labelIndex = hovered >= 0 ? hovered : focused >= 0 ? focused : coarse ? activeIndex : -1;
  const rovingIndex = focused >= 0 ? focused : activeIndex;

  /** Lays out the carousel from the DOM band; CSS owns the proportions and the 3D follows. */
  const measure = useCallback(() => {
    const c = controller.current;
    const stage = stageRef.current, band = bandRef.current, root = rootRef.current;
    if (!stage || !band || !root) return;
    const s = stage.getBoundingClientRect();
    const b = band.getBoundingClientRect();
    if (!s.width || !b.height) return;
    c.width = s.width;
    c.height = s.height;
    c.centerX = s.width / 2;
    c.bandTop = b.top - s.top;
    c.bandHeight = b.height;
    const phone = s.width < 640;
    // Cars across the width: three to four on a wide desktop, two to three on a small one or a tablet, one
    // dominant car with neighbours peeking on a phone. CAR_SCALE trades size for count everywhere but phones.
    const visible = phone ? 1.42 : (s.width >= 1200 ? 2.85 : s.width >= 900 ? 2.15 : 1.9) / CAR_SCALE;
    const gapMetres = phone ? 0.55 : 1.05;
    // Pixels per metre: from the width (cars plus gaps), capped so the tallest car (plus hover) fits the band.
    c.ppu = Math.min(s.width / (visible * (AVERAGE_WIDTH + gapMetres)), b.height / (MAX_HEIGHT * 1.12));
    const widths = CAROUSEL_SIZE.map((size) => size.w * c.ppu);
    // Equal gaps between differently sized cars; widen them if the loop would be too short to stay off-screen.
    let gap = gapMetres * c.ppu;
    const loopWidth = (g: number) => widths.reduce((sum, w) => sum + w, 0) + COUNT * g;
    const minimumLoop = s.width + 2 * (MAX_WIDTH * c.ppu + gap);
    if (loopWidth(gap) < minimumLoop) gap = (minimumLoop - widths.reduce((sum, w) => sum + w, 0)) / COUNT;
    const previousSpan = c.span;
    let at = 0;
    c.centers = widths.map((w, i) => { if (i > 0) at += widths[i - 1] / 2 + gap + w / 2; return at; });
    c.span = loopWidth(gap);
    c.step = c.span / COUNT;
    if (previousSpan > 0 && previousSpan !== c.span) {
      const k = c.span / previousSpan;
      c.offset *= k;
      if (c.tween) c.tween = { ...c.tween, from: c.tween.from * k, to: c.tween.to * k };
    }
    const carHeight = MAX_HEIGHT * c.ppu;
    geometry.current = { widths, arc: Math.min(16, b.height * 0.03) };
    itemRefs.current.forEach((item, i) => item?.style.setProperty("--cine-item-w", `${widths[i].toFixed(1)}px`));
    const slot = slotRef.current?.getBoundingClientRect();
    if (slot) {
      c.slot = { x: slot.left - s.left, y: slot.top - s.top, w: slot.width, h: slot.height };
      // Slot poster at the same scale the stage will give the top-down model.
      const vehicle = getVehicle(shownRef.current ?? "");
      if (vehicle) {
        const top = projectBox(BODY.width, BODY.height, vehicle.model.length, POSES.selected);
        const slotPpu = Math.min((slot.width * SLOT_FILL.w) / top.w, (slot.height * SLOT_FILL.h) / top.h);
        root.style.setProperty("--cine-slot-ppu", slotPpu.toFixed(2));
      }
    }
    const trackTop = trackRef.current?.getBoundingClientRect().top ?? b.top;
    root.style.setProperty("--cine-car-h", carHeight.toFixed(1));
    root.style.setProperty("--cine-car-top", (b.top - trackTop + (b.height - carHeight) / 2).toFixed(1));
    root.style.setProperty("--cine-ppu", c.ppu.toFixed(2));
    layoutDirty.current = true;
    c.keepBusy(300);
  }, []);

  /** Positions every hit target (and the 3D rail slots) for the current track offset. */
  const placeRail = useCallback((c: StageController) => {
    const half = c.width / 2 || 1;
    const { widths, arc } = geometry.current;
    for (let i = 0; i < COUNT; i++) {
      const d = railDelta(c, i, c.offset);
      const u = Math.min(1.3, Math.abs(d) / half);
      const lift = arc * u * u;
      const slot = c.rail[i];
      const w = widths[i] ?? c.step * 0.8;
      slot.x = c.centerX + d;
      slot.y = c.bandTop + c.bandHeight / 2 + lift;
      slot.scale = 1 - 0.03 * Math.min(1, u * u);
      slot.onScreen = slot.x + w / 2 > -40 && slot.x - w / 2 < c.width + 40;
      const item = itemRefs.current[i];
      if (!item) continue;
      item.style.transform = `translate3d(${(slot.x - w / 2).toFixed(2)}px, ${lift.toFixed(2)}px, 0)`;
      // Captions fade out near the screen edges instead of being clipped.
      const room = Math.min(slot.x, c.width - slot.x) - 80;
      const labelOpacity = room > 48 ? "1" : room < 0 ? "0" : (room / 48).toFixed(2);
      if (item.style.getPropertyValue("--cine-label-o") !== labelOpacity) item.style.setProperty("--cine-label-o", labelOpacity);
    }
  }, []);

  // One frame loop for the whole experience: drift, tweens, DOM targets, then the WebGL render.
  useEffect(() => {
    const c = controller.current;
    let frame = 0;
    let last = performance.now();
    let lastOffset = Number.NaN;
    let lastActive = -1;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      c.now = now;
      const drifting = c.phase === "collection" && !holdRef.current && !c.dragging && !c.tween;
      const target = drifting ? DRIFT_SPEED : 0;
      // Stop quickly on hover; resume gently.
      c.velocity += (target - c.velocity) * (1 - Math.exp(-(target > c.velocity ? 1.6 : 14) * dt));
      if (target === 0 && c.velocity < 0.02) c.velocity = 0;
      if (c.tween) {
        const k = easeOut(progress(now, c.tween.start, c.tween.start + c.tween.duration));
        c.offset = c.tween.from + (c.tween.to - c.tween.from) * k;
        if (k >= 1) c.tween = null;
      } else if (!c.dragging) {
        c.offset += c.velocity * dt;
      }
      const railMoved = c.offset !== lastOffset || layoutDirty.current;
      if (railMoved) {
        placeRail(c);
        lastOffset = c.offset;
        layoutDirty.current = false;
      }
      const active = centeredIndex(c, c.offset);
      if (active !== lastActive) { lastActive = active; setActiveIndex(active); }
      if (c.render && (railMoved || c.moving || now < c.busyUntil || c.pendingFrames > 0)) {
        c.moving = false;
        c.pendingFrames = Math.max(0, c.pendingFrames - 1);
        c.render(now / 1000);
      }
    };
    frame = requestAnimationFrame(tick);
    // A hidden tab gets no frames; resume without a time jump.
    const wake = () => { last = performance.now(); c.keepBusy(200); };
    document.addEventListener("visibilitychange", wake);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", wake); };
  }, [placeRail]);

  // Mirror the transition into the shared controller (the stage reads it every frame). Declared before the
  // geometry effects so the timing variable is set before anything forces a style recalculation.
  useLayoutEffect(() => {
    const c = controller.current;
    c.phase = view.phase;
    c.phaseStart = performance.now();
    // Review aid: window.__toyyoSlowMotion = 8 plays the choreography (3D and CSS) eight times slower.
    const slow = Number((window as unknown as { __toyyoSlowMotion?: number }).__toyyoSlowMotion);
    c.timeScale = Number.isFinite(slow) && slow > 0 ? slow : 1;
    rootRef.current?.style.setProperty("--cine-time", String(c.timeScale));
    c.phaseId += 1;
    c.selected = view.id ? VEHICLES.findIndex((vehicle) => vehicle.id === view.id) : -1;
    if (view.phase === "opening" || view.phase === "closing") { c.tween = null; c.velocity = 0; c.dragging = false; }
    if (view.phase === "closing" && window.scrollY > 0) window.scrollTo({ top: 0, behavior: "instant" });
    c.keepBusy((view.phase === "opening" ? TIMING.open.settle + 250 : view.phase === "closing" ? TIMING.close.settle + 250 : 400) * c.timeScale);
  }, [view.phase, view.seq, view.id]);

  // Geometry: measure now, on resize, and whenever the layout mode changes.
  useLayoutEffect(() => {
    const c = controller.current;
    measure();
    const initial = initialRoute.current ? VEHICLES.findIndex((vehicle) => vehicle.id === initialRoute.current) : -1;
    let saved: number | null = null;
    try { saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null")?.position ?? null; } catch { saved = null; }
    if (initial >= 0) c.offset = offsetFor(c, initial, 0);
    else if (typeof saved === "number" && Number.isFinite(saved)) c.offset = saved * c.span;
    // First frame: whole cars with neighbours cut by the screen edges. Wide screens centre a car (three whole);
    // tablets and small desktops centre a gap (two whole); phones centre the first car.
    else c.offset = c.width < 640 ? 0 : c.width >= 1200 ? offsetFor(c, 1, 0) : (c.centers[1] + c.centers[2]) / 2;
    layoutDirty.current = true;
    const observer = new ResizeObserver(() => measure());
    for (const element of [rootRef.current, stageRef.current, bandRef.current]) if (element) observer.observe(element);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [measure]);
  useLayoutEffect(() => {
    const slot = slotRef.current;
    shownRef.current = view.id;
    measure();
    if (!slot) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(slot);
    return () => observer.disconnect();
  }, [measure, view.phase, view.id]);

  useLayoutEffect(() => {
    const c = controller.current;
    holdRef.current = paused || hovered >= 0 || trackHot || focused >= 0 || dialog !== null;
    c.hovered = hovered >= 0 ? hovered : focused;
    c.reduced = reduced;
    c.mascot = mascotRef.current;
    c.keepBusy(300);
  }, [paused, hovered, trackHot, focused, dialog, reduced]);

  // Settle each transition, then hand focus to where the visitor is now.
  useEffect(() => {
    if (view.phase !== "opening" && view.phase !== "closing") return;
    const opening = view.phase === "opening";
    const seq = view.seq;
    const timer = window.setTimeout(() => {
      settledFrom.current = view.phase;
      setView((current) => current.seq !== seq ? current : opening ? { ...current, phase: "story" } : { id: null, phase: "collection", seq: current.seq });
    }, (reduced ? TIMING.reduced.settle : opening ? TIMING.open.settle : TIMING.close.settle) * controller.current.timeScale);
    return () => window.clearTimeout(timer);
  }, [view.phase, view.seq, reduced]);
  // Focus moves only after the settled layout has committed (inert is lifted by then).
  useEffect(() => {
    const from = settledFrom.current;
    settledFrom.current = null;
    if (from === "opening" && view.phase === "story") document.getElementById("ownership-heading")?.focus({ preventScroll: true });
    if (from === "closing" && view.phase === "collection" && returnIndex.current >= 0) buttonRefs.current[returnIndex.current]?.focus({ preventScroll: true });
  }, [view.phase]);

  useEffect(() => {
    document.title = route.vehicle ? `${pageTitle(route.vehicle, route.section)} · Toyyo` : HOME_TITLE;
  }, [route.vehicle, route.section]);

  // Visible cars load first; the rest follow once one model has arrived (or after a short wait).
  useEffect(() => {
    const timer = window.setTimeout(() => setMountAll(true), 2500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const element = dialogRef.current;
    if (!element) return;
    if (dialog && !element.open) element.showModal();
    else if (!dialog && element.open) element.close();
  }, [dialog]);

  // Horizontal trackpad scrolling moves the track; vertical wheel never changes cars.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let snapTimer = 0;
    const onWheel = (event: WheelEvent) => {
      const c = controller.current;
      if (c.phase !== "collection" || Math.abs(event.deltaX) <= Math.abs(event.deltaY) || Math.abs(event.deltaX) < 1) return;
      event.preventDefault();
      c.tween = null;
      c.offset += event.deltaX;
      setPauseChoice(true);
      window.clearTimeout(snapTimer);
      snapTimer = window.setTimeout(() => {
        c.tween = { from: c.offset, to: snapOffset(c, c.offset), start: performance.now(), duration: 420 };
      }, 140);
    };
    track.addEventListener("wheel", onWheel, { passive: false });
    return () => { track.removeEventListener("wheel", onWheel); window.clearTimeout(snapTimer); };
  }, []);

  const onLoaded = useCallback((id: string) => {
    setLoaded((set) => withId(set, id));
    setFailed((set) => without(set, id));
    setMountAll(true);
  }, []);
  const onError = useCallback((id: string) => {
    setFailed((set) => withId(set, id));
    setLoaded((set) => without(set, id));
  }, []);
  const onUnavailable = useCallback(() => {
    setWebgl(false);
    setLoaded(new Set());
  }, []);
  const retry = (id: string) => {
    const vehicle = getVehicle(id);
    if (!vehicle) return;
    void import("./VehicleStage").then((stage) => {
      stage.clearModel(vehicle.model.url);
      setFailed((set) => without(set, id));
      setAttempts((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
    });
  };

  const reveal = (index: number) => {
    const c = controller.current;
    const d = railDelta(c, index, c.offset);
    const x = c.centerX + d;
    const half = (geometry.current.widths[index] ?? c.step) / 2;
    if (x - half < 16 || x + half > c.width - 16) c.tween = { from: c.offset, to: c.offset + d, start: performance.now(), duration: reduced ? 1 : 520 };
  };

  const stepBy = (direction: 1 | -1) => {
    const c = controller.current;
    setPauseChoice(true);
    const base = c.tween ? c.tween.to : snapOffset(c, c.offset);
    const index = (centeredIndex(c, base) + direction + COUNT) % COUNT;
    const to = offsetFor(c, index, base);
    c.tween = { from: c.offset, to, start: performance.now(), duration: reduced ? 1 : 560 };
    setAnnouncement(`${carName(VEHICLES[index])}, ${VEHICLES[index].descriptor}. Car ${index + 1} of ${COUNT}.`);
  };

  const select = (index: number) => {
    if (suppressClick.current || view.phase !== "collection") return;
    const vehicle = VEHICLES[index];
    const c = controller.current;
    c.tween = null;
    c.velocity = 0;
    returnIndex.current = index;
    pushedFromCarousel.current = true;
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ position: c.offset / c.span })); } catch { /* private mode */ }
    setHovered(-1);
    setTrackHot(false);
    setFocused(-1);
    setView((current) => ({ id: vehicle.id, phase: "opening", seq: current.seq + 1 }));
    window.history.pushState({ toyyo: "story" }, "", carPath(vehicle.id));
  };

  const allCars = () => {
    if (!view.id || view.phase === "collection" || view.phase === "closing") return;
    const c = controller.current;
    const index = VEHICLES.findIndex((vehicle) => vehicle.id === view.id);
    returnIndex.current = index;
    // If the car's saved place is off-screen (e.g. a direct link), bring it home to the centre.
    const x = c.centerX + railDelta(c, index, c.offset);
    if (x < 0 || x > c.width) { c.offset = offsetFor(c, index, c.offset); layoutDirty.current = true; }
    setView((current) => ({ id: current.id, phase: "closing", seq: current.seq + 1 }));
    if (pushedFromCarousel.current || window.history.state?.toyyo === "story") {
      pushedFromCarousel.current = false;
      window.history.back();
    } else {
      window.history.replaceState({ toyyo: "collection" }, "", "/");
    }
  };

  // Dashboard <-> Repairs: replace, not push, so Back always returns to the carousel in one step.
  const changeSection = useCallback((next: SectionId) => {
    const vehicle = parseCarPath(window.location.pathname).vehicle;
    if (!vehicle) return;
    const marker = window.history.state?.toyyo;
    window.history.replaceState(marker ? { toyyo: marker } : null, "", carPath(vehicle.id, next));
  }, []);

  const onWordmark = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    allCars();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || view.phase !== "collection") return;
    suppressClick.current = false;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, offset: controller.current.offset, moved: false, samples: [[event.timeStamp, event.clientX]] };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const c = controller.current;
    const dx = event.clientX - g.x;
    if (!g.moved) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(event.clientY - g.y)) return;
      g.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      c.dragging = true;
      c.tween = null;
      setPauseChoice(true);
    }
    c.offset = g.offset - dx;
    g.samples.push([event.timeStamp, event.clientX]);
    if (g.samples.length > 6) g.samples.shift();
  };
  const endGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    gesture.current = null;
    if (!g.moved) return;
    const c = controller.current;
    c.dragging = false;
    // A drag never counts as a click.
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 80);
    const [t0, x0] = g.samples[0];
    const [t1, x1] = g.samples[g.samples.length - 1];
    const velocity = t1 - t0 > 0 && event.timeStamp - t1 < 90 ? (x1 - x0) / (t1 - t0) : 0;
    const projected = c.offset - Math.max(-1.6, Math.min(1.6, velocity)) * 240;
    c.tween = { from: c.offset, to: snapOffset(c, projected), start: performance.now(), duration: reduced ? 1 : 460 };
  };

  const rootClass = ["cine", `is-${view.phase}`, reduced && "is-reduced", !webgl && "is-flat"].filter(Boolean).join(" ");

  return (
    <div ref={rootRef} className={rootClass}>
      <a className="cine-skip" href={shown ? "#ownership-heading" : "#cine-cars"}>{shown ? "Skip to car details" : "Skip to your cars"}</a>

      <div ref={stageRef} className="cine-stage" aria-hidden="true">
        <div className="cine-ground" />
        {webgl && <VehicleStage controller={controller} mounted={mounted} attempts={attempts} onLoaded={onLoaded} onError={onError} onUnavailable={onUnavailable} />}
        {/* Reserved for the Toyyo mascot (planned later, spec §6). The stage keeps this empty element over the
            selected car's roof every frame; the character and its accessible "Ask Toyyo" control will attach here. */}
        <div ref={mascotRef} className="cine-mascot-anchor" aria-hidden="true" data-mascot-anchor="" data-vehicle={storyVisible ? view.id ?? undefined : undefined} />
      </div>

      <header className="cine-header">
        {/* Plain clicks are handled in place (onWordmark prevents the Link navigation); modified clicks open "/". */}
        <Link className="cine-wordmark" href="/" prefetch={false} onClick={onWordmark} aria-label="Toyyo, all cars">Toyyo</Link>
        <div className="cine-header-story" inert={!storyVisible}>
          <button type="button" className="cine-back" onClick={allCars}><ArrowLeft size={16} aria-hidden="true" /> All cars</button>
        </div>
        <nav className="cine-header-info" aria-label="About this experience" inert={view.phase !== "collection"}>
          <button type="button" onClick={() => setDialog("about")}>About</button>
          <button type="button" onClick={() => setDialog("credits")}>Credits</button>
        </nav>
        {shown && <p className="cine-case" aria-hidden={!storyVisible}>{pad(shownIndex + 1)}<span className="cine-case-total"> / {pad(COUNT)}</span></p>}
      </header>

      <main className="cine-main">
        <section className="cine-collection" aria-labelledby="cine-title" inert={view.phase !== "collection"}>
          <h1 id="cine-title" className="cine-title"><span>Your</span> <span>Toyyota</span></h1>
          <div ref={trackRef} className="cine-track" role="region" aria-roledescription="carousel" aria-label="Your Toyotas"
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endGesture} onPointerCancel={endGesture}
            onPointerLeave={() => { setTrackHot(false); setHovered(-1); }}>
            <div ref={bandRef} className="cine-band" aria-hidden="true" />
            <ul id="cine-cars" className="cine-cars">
              {VEHICLES.map((vehicle, i) => {
                const flat = !webgl || !loaded.has(vehicle.id);
                const kase = getCaseSummary(vehicle.personaId);
                return (
                  <li key={vehicle.id} ref={(element) => { itemRefs.current[i] = element; }} className={`cine-car${labelIndex === i ? " is-active" : ""}${flat ? "" : " is-loaded"}`}>
                    <button ref={(element) => { buttonRefs.current[i] = element; }} type="button" className="cine-car-button" tabIndex={i === rovingIndex ? 0 : -1}
                      aria-label={kase ? `${carName(vehicle)}. ${vehicle.descriptor}. ${kase.firstName}, ${kase.age}, ${kase.city}: ${kase.context}. Best next move: ${kase.bestMoveTitle}. View case.` : `${carName(vehicle)}. ${vehicle.descriptor}. View details.`}
                      onClick={() => select(i)}
                      onPointerEnter={(event) => { if (event.pointerType !== "touch") { setHovered(i); setTrackHot(true); } }}
                      onPointerLeave={(event) => { if (event.pointerType !== "touch") setHovered((current) => current === i ? -1 : current); }}
                      onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) { setFocused(i); reveal(i); } }}
                      onBlur={() => setFocused((current) => current === i ? -1 : current)}
                      onKeyDown={(event) => {
                        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                        event.preventDefault();
                        buttonRefs.current[(i + (event.key === "ArrowRight" ? 1 : COUNT - 1)) % COUNT]?.focus();
                      }}>
                      {/* Exact-model poster: shown while the 3D model loads, or instead of it without WebGL. */}
                      {!posterMissing.has(vehicle.id) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="cine-car-poster" src={vehicle.poster} alt="" draggable={false} decoding="async" onError={() => setPosterMissing((set) => withId(set, vehicle.id))} />
                      )}
                      <span className="cine-car-label" aria-hidden="true">
                        <span className="cine-car-name"><span className="cine-car-index">{pad(i + 1)}</span>{vehicle.name}</span>
                        {kase && <span className="cine-car-case"><span className="cine-car-who">{kase.firstName}, {kase.age} · {kase.city}</span><span className="cine-car-ctx">{kase.context}</span></span>}
                        <span className="cine-car-more">
                          {kase ? <span className="cine-car-quote">{kase.bestMoveTitle}</span> : <span>{vehicle.descriptor}</span>}
                          <span className="cine-car-explore">{kase ? "View case" : "View details"} <ArrowUpRight size={15} aria-hidden="true" /></span>
                        </span>
                      </span>
                    </button>
                    {failed.has(vehicle.id) && webgl && (
                      <button type="button" className="cine-car-retry" tabIndex={i === rovingIndex ? 0 : -1} onClick={() => retry(vehicle.id)}>
                        <RotateCw size={13} aria-hidden="true" /> 3D preview unavailable. Retry
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          <footer className="cine-footer">
            <div className="cine-controls" role="group" aria-label="Carousel controls">
              <p className="cine-count" aria-hidden="true"><span>{pad(activeIndex + 1)}</span> / {pad(COUNT)}</p>
              <button type="button" className="cine-pause" onClick={() => setPauseChoice(!paused)}>
                {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
                <span>{paused ? "Play" : "Pause"}</span><span className="cine-sr"> carousel</span>
              </button>
              <button type="button" className="cine-arrow" aria-label="Previous car" onClick={() => stepBy(-1)}><ArrowLeft size={18} aria-hidden="true" /></button>
              <button type="button" className="cine-arrow" aria-label="Next car" onClick={() => stepBy(1)}><ArrowRight size={18} aria-hidden="true" /></button>
            </div>
          </footer>
        </section>

        {shown && (
          <section className="cine-story" aria-label={`Your ${carName(shown)}`} inert={view.phase !== "story"}>
            <div ref={slotRef} className="cine-car-slot">
              {/* Top-down poster (the selected pose) while the model loads or without WebGL; falls back to the carousel poster. */}
              {!(topPosterMissing.has(shown.id) && posterMissing.has(shown.id)) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={topPosterMissing.has(shown.id) ? "side" : "top"} alt="" decoding="async"
                  className={`cine-slot-poster${topPosterMissing.has(shown.id) ? " is-fallback" : ""}${webgl && loaded.has(shown.id) ? " is-hidden" : ""}`}
                  src={topPosterMissing.has(shown.id) ? shown.poster : POSTERS.selected.path(shown.id)}
                  onError={() => (topPosterMissing.has(shown.id) ? setPosterMissing : setTopPosterMissing)((set) => withId(set, shown.id))} />
              )}
              {failed.has(shown.id) && webgl && (
                <button type="button" className="cine-slot-retry" onClick={() => retry(shown.id)}><RotateCw size={13} aria-hidden="true" /> 3D model unavailable. Retry</button>
              )}
              <p className="cine-slot-caption"><span>{pad(shownIndex + 1)}</span>{shown.year} Toyota {shown.name}</p>
            </div>
            <div className="cine-ownership">
              <div className="cine-ownership-body">
                <CarDashboard vehicle={shown} section={section} onSectionChange={changeSection} chatDock={chatDock} />
              </div>
              <div className="cine-chat-dock" ref={setChatDock} />
            </div>
          </section>
        )}
      </main>

      <p className="cine-sr" aria-live="polite">{announcement}</p>

      <dialog ref={dialogRef} className="cine-dialog" aria-labelledby="cine-dialog-title" onClose={() => setDialog(null)}
        onClick={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
        <div className="cine-dialog-body">
          <button type="button" className="cine-dialog-close" aria-label="Close" onClick={() => setDialog(null)}><X size={20} aria-hidden="true" /></button>
          {dialog === "about" && <About onCredits={() => setDialog("credits")} />}
          {dialog === "credits" && <Credits />}
        </div>
      </dialog>
    </div>
  );
}

function About({ onCredits }: { onCredits: () => void }) {
  return <>
    <p className="cine-eyebrow">About Toyyo</p>
    <h2 id="cine-dialog-title">Your Toyotas, in one place.</h2>
    <p>Toyyo keeps the decisions around owning a Toyota in one place: the lease or loan, repairs, everyday driving, and the choices that come next. Choose a car to see its details.</p>
    <p>This is a demo account. The cars’ finances, driving data and estimates are invented for illustration; they are not offers or financial advice.</p>
    <p>The 3D models are the work of independent artists, used under their Creative Commons licenses. <button type="button" className="cine-inline-link" onClick={onCredits}>See the credits</button>.</p>
    <p className="cine-dialog-note">A concept prototype.</p>
  </>;
}

function Credits() {
  const nonCommercial = VEHICLES.filter((vehicle) => vehicle.credit.license.includes("NC"));
  return <>
    <p className="cine-eyebrow">Model credits</p>
    <h2 id="cine-dialog-title">The people behind the cars.</h2>
    <ul className="cine-credits">
      {VEHICLES.map((vehicle) => (
        <li key={vehicle.id}>
          <strong>{vehicle.credit.title}</strong>
          <span className="cine-credit-meta">
            <span>by {vehicle.credit.author}</span>
            <a href={LICENSES[vehicle.credit.license] ?? vehicle.credit.url} target="_blank" rel="noreferrer">{vehicle.credit.license}</a>
            <a href={vehicle.credit.url} target="_blank" rel="noreferrer">Source<ArrowUpRight size={13} aria-hidden="true" /></a>
          </span>
        </li>
      ))}
    </ul>
    <p className="cine-dialog-note">
      Changes: the CC BY 4.0 models come from the <a href="https://github.com/pedrosoandre/carros" target="_blank" rel="noreferrer">pedrosoandre/carros</a> distribution,
      which reports welding, simplification, pruning and Meshopt compression; Toyyo also deduplicates and joins their meshes. In the app every model is
      rescaled, reoriented and relit, and body paint is recolored where the model allows.
      {nonCommercial.length > 0 && <> The {nonCommercial.map((vehicle) => `${vehicle.name} (${vehicle.credit.license})`).join(" and ")} {nonCommercial.length === 1 ? "model is" : "models are"} licensed
      for non-commercial use only, so this collection is not cleared for commercial use.</>}
    </p>
  </>;
}
