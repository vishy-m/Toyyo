"use client";
// 3D ride replay. Mount with next/dynamic({ ssr: false }).
// Per-frame work (car, camera, trail, HUD, scrubber) runs in one rAF loop and writes to the map
// and DOM imperatively; React state only changes on user actions and event callouts.
import "mapbox-gl/dist/mapbox-gl.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./replay.css";
import { useShouldReduceMotion } from "@animate-ui/react/utils/motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Trip, TripEvent } from "@/lib/types";
import { useUiStore } from "@/lib/client/ui-store";
import { bodyStyleForPersona, resolveMapModel } from "@/components/three/models";
import RouteFallback from "./RouteFallback";
import { createReplayMap, chosenProvider, webglAvailable, type CameraMode, type CarState, type ProviderName, type ReplayMap } from "./provider";
import {
  EVENT_STYLE,
  ROUTE_COLORS,
  buildTimeline,
  calloutText,
  formatClock,
  formatElapsed,
  lightPresetForHour,
  localHour,
  mix,
  mixAngle,
  scoreDeltaAt,
  type LightPreset,
} from "./timeline";

export interface RideReplayProps {
  trip: Trip;
  onClose(): void;
  className?: string;
  /** Optional paint for the map car (defaults to Toyota red). */
  paintHex?: string;
  /** Start playing automatically after the intro flight (default true). */
  autoPlay?: boolean;
  /** Force a map provider (testing); default comes from NEXT_PUBLIC_MAP_PROVIDER. */
  provider?: ProviderName;
  /** Embedded in a page: no close button, and keyboard shortcuts only while focus is inside the replay. */
  inline?: boolean;
}

const BASE_SPEEDS = [1, 10, 60];
type Speed = number;

/** 1×/10×/60× plus a "fit" speed for long road trips; default ≈ 45–60 s of playback. */
function speedOptions(duration: number): { options: number[]; initial: number } {
  const options = [...BASE_SPEEDS];
  if (duration > 1800) {
    const fit = duration / 55;
    const nice = [120, 240, 300, 600, 900, 1200].reduce((a, b) => (Math.abs(b - fit) < Math.abs(a - fit) ? b : a));
    options.push(nice);
  }
  const target = duration / 50;
  const initial = options.reduce((a, b) => (Math.abs(Math.log(b / target)) < Math.abs(Math.log(a / target)) ? b : a));
  return { options, initial };
}
const MODES: { id: CameraMode; label: string; hint: string }[] = [
  { id: "chase", label: "Chase", hint: "Follow behind the car" },
  { id: "overhead", label: "Overhead", hint: "Top-down, north up" },
  { id: "free", label: "Free", hint: "Drag, rotate and zoom yourself" },
];
const KENNEY_UNIT_LENGTH = 2.65;
const EVENT_SLOW_WINDOW = 7; // trip seconds around an event where playback slows
const EVENT_SLOW_RATE = 3; // × real time near events

type Status = "loading" | "ready" | "error" | "nowebgl";

export default function RideReplay({ trip, onClose, className, paintHex = "#EB0A1E", autoPlay = true, provider: providerProp, inline = false }: RideReplayProps) {
  const tl = useMemo(() => buildTimeline(trip), [trip]);
  const speeds = useMemo(() => speedOptions(tl.duration), [tl.duration]);
  const reducedMotion = useShouldReduceMotion();
  const openReplay = useUiStore((s) => s.openReplay);

  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(speeds.initial);
  const [mode, setMode] = useState<CameraMode>(reducedMotion ? "overhead" : "chase");
  const [callout, setCallout] = useState<{ idx: number; text: string; color: string } | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);
  const [light, setLight] = useState<LightPreset>(() => lightPresetForHour(localHour(trip.start)));

  const rootRef = useRef<HTMLDivElement>(null);
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<ReplayMap | null>(null);
  const hudSpeed = useRef<HTMLSpanElement>(null);
  const hudMiles = useRef<HTMLSpanElement>(null);
  const hudElapsed = useRef<HTMLSpanElement>(null);
  const hudScore = useRef<HTMLSpanElement>(null);
  const hudClock = useRef<HTMLSpanElement>(null);
  const hudFill = useRef<HTMLDivElement>(null);
  const hudThumb = useRef<HTMLDivElement>(null);
  const hudRange = useRef<HTMLInputElement>(null);

  // Mutable playback state read by the rAF loop.
  const st = useRef({
    t: 0,
    playing: false,
    speed: speeds.initial,
    rate: speeds.initial,
    mode: (reducedMotion ? "overhead" : "chase") as CameraMode,
    car: null as CarState | null,
    shownSpeed: 0,
    lastEventT: -1,
    visible: true,
    wakeUntil: 0,
    scrubbing: false,
    light: "day" as LightPreset,
    intro: true,
    reducedMotion,
    lastScore: NaN,
    holdAt: null as number | null, // agent focus: pause once playback reaches this event
  });
  const calloutTimer = useRef<number | null>(null);

  const wake = (ms = 1600) => {
    st.current.wakeUntil = performance.now() + ms;
  };

  const play = useCallback((on: boolean) => {
    const s = st.current;
    if (on && s.t >= tl.duration - 0.5) {
      s.t = 0;
      s.lastEventT = -1;
      s.car = null;
    }
    s.playing = on;
    setPlaying(on);
    wake();
  }, [tl.duration]);

  const seek = useCallback((t: number, snap = true) => {
    const s = st.current;
    s.t = Math.max(0, Math.min(tl.duration, t));
    s.lastEventT = s.t - 0.001;
    s.car = null; // snap car to the new sample
    if (snap) mapRef.current?.snapCamera();
    wake();
  }, [tl.duration]);

  const changeMode = useCallback((m: CameraMode) => {
    st.current.mode = m;
    setMode(m);
    if (st.current.reducedMotion) mapRef.current?.snapCamera();
    wake(2500);
  }, []);

  const changeSpeed = useCallback((sp: Speed) => {
    st.current.speed = sp;
    setSpeed(sp);
  }, []);

  const resetView = useCallback(() => {
    changeMode(st.current.reducedMotion ? "overhead" : "chase");
    mapRef.current?.snapCamera();
    wake(2500);
  }, [changeMode]);

  const close = useCallback(() => {
    openReplay(null);
    onClose();
  }, [onClose, openReplay]);

  const showCallout = useCallback((e: TripEvent, idx: number, ms = 3800) => {
    const color = EVENT_STYLE[e.type].color;
    setCallout({ idx, text: calloutText(e, tl.events), color });
    mapRef.current?.highlightEvent(idx);
    if (calloutTimer.current) window.clearTimeout(calloutTimer.current);
    calloutTimer.current = window.setTimeout(() => {
      setCallout(null);
      mapRef.current?.highlightEvent(null);
    }, ms);
  }, [tl.events]);

  useEffect(() => {
    st.current.reducedMotion = reducedMotion;
  }, [reducedMotion]);

  // ---------- map lifecycle ----------
  useEffect(() => {
    const el = mapElRef.current;
    if (!el) return;
    if (!webglAvailable()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off capability probe on mount
      setStatus("nowebgl");
      return;
    }
    let cancelled = false;
    let instance: ReplayMap | null = null;
    const s = st.current;
    s.t = 0;
    s.car = null;
    s.lastEventT = -1;
    s.intro = true;
    s.light = lightPresetForHour(localHour(trip.start));
    s.speed = speeds.initial;
    s.rate = speeds.initial;
    setSpeed(speeds.initial);
    setStatus("loading");

    const mapModel = resolveMapModel(bodyStyleForPersona(trip.personaId));
    const pending = { focus: undefined as number | undefined };
    const rp = useUiStore.getState().replay;
    if (rp && rp.tripId === trip.id && rp.focusEventT !== undefined) pending.focus = rp.focusEventT;

    createReplayMap({
      container: el,
      timeline: tl,
      modelUrl: mapModel.url,
      modelUnitLength: mapModel.isHero ? mapModel.length : KENNEY_UNIT_LENGTH,
      displayLengthM: 22,
      mapBearingOffset: mapModel.mapBearingOffset,
      paintHex,
      light: s.light,
      reducedMotion: s.reducedMotion,
      onUserInteract: () => {
        if (st.current.mode !== "free") {
          st.current.mode = "free";
          setMode("free");
        }
      },
      onEventClick: (e, i) => {
        seek(Math.max(0, e.t - 3));
        showCallout(e, i);
      },
      onError: (err) => {
        if (cancelled) return;
        setErrorMsg(err.message);
        setStatus("error");
      },
    }, providerProp ?? chosenProvider())
      .then(async (m) => {
        if (cancelled) {
          m.destroy();
          return;
        }
        instance = m;
        mapRef.current = m;
        await m.ready;
        if (cancelled) return;
        setStatus("ready");
        const first = tl.sample(pending.focus !== undefined ? Math.max(0, pending.focus - 4) : 0);
        const car: CarState = { lngLat: first.lngLat, bearing: first.bearing, braking: 0 };
        m.setCar(car);
        if (pending.focus !== undefined) {
          st.current.t = Math.max(0, pending.focus - 4);
          st.current.holdAt = pending.focus;
        }
        if (st.current.reducedMotion) {
          await m.introTo(car, 0);
        } else {
          m.overview(true);
          await new Promise((r) => setTimeout(r, 1700));
          if (cancelled) return;
          await m.introTo(car, 2600);
        }
        if (cancelled) return;
        st.current.intro = false;
        wake(3000);
        if (autoPlay && !st.current.reducedMotion) play(true);
        else if (pending.focus !== undefined) play(true);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setErrorMsg(err?.message ?? "Map failed to load");
        setStatus("error");
      });

    return () => {
      cancelled = true;
      mapRef.current = null;
      instance?.destroy();
      if (calloutTimer.current) window.clearTimeout(calloutTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id, tl]);

  // ---------- agent-driven focus (focusEventT) ----------
  useEffect(() => {
    return useUiStore.subscribe((s, prev) => {
      const r = s.replay;
      if (!r || r.tripId !== trip.id || r.focusEventT === undefined) return;
      if (prev.replay && prev.replay.focusEventT === r.focusEventT && prev.replay.tripId === r.tripId) return;
      if (st.current.intro) return; // the mount effect picks it up
      seek(Math.max(0, r.focusEventT - 4));
      st.current.holdAt = r.focusEventT;
      play(true);
    });
  }, [trip.id, seek, play]);

  // ---------- pause when off-screen ----------
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      st.current.visible = entry.isIntersecting;
      if (entry.isIntersecting) wake();
    });
    io.observe(el);
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(el);
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  // ---------- rAF loop ----------
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const playable = tl.events.filter((e) => e.type !== "speeding-end");
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = st.current;
      const m = mapRef.current;
      if (!m || !s.visible || document.hidden || s.intro) return;
      if (!s.playing && now > s.wakeUntil && s.car) return;

      // Advance time; slow down around events.
      if (s.playing) {
        let target = s.speed;
        for (const e of playable) {
          if (Math.abs(e.t - s.t) < EVENT_SLOW_WINDOW || (e.t > s.t && e.t - s.t < EVENT_SLOW_WINDOW * 2)) {
            target = Math.min(target, EVENT_SLOW_RATE);
            break;
          }
        }
        s.rate = s.reducedMotion ? target : mix(s.rate, target, 1 - Math.exp(-dt * 3));
        const prevT = s.t;
        s.t = Math.min(tl.duration, s.t + dt * s.rate);
        // Fire callouts for events crossed this frame.
        tl.events.forEach((e, i) => {
          if (e.t > prevT && e.t <= s.t) showCallout(e, i);
        });
        if (s.holdAt !== null && prevT < s.holdAt + 0.6 && s.t >= s.holdAt + 0.6) {
          const held = s.holdAt;
          const hi = tl.events.findIndex((e) => Math.abs(e.t - held) < 0.01);
          if (hi >= 0) showCallout(tl.events[hi], hi, 9000); // keep the explanation up while paused
          s.t = s.holdAt + 0.6;
          s.holdAt = null;
          s.playing = false;
          setPlaying(false);
          wake(2500);
        }
        if (s.t >= tl.duration) {
          s.playing = false;
          setPlaying(false);
          wake();
        }
      }

      // Car: low-pass position + bearing (Mapbox example's mix()).
      const smp = tl.sample(s.t);
      let braking = 0;
      for (const e of tl.events) {
        if (e.type === "hard-brake" && s.t >= e.t - 1 && s.t < e.t + 4) braking = 1 - Math.max(0, s.t - e.t) / 4;
      }
      if (!s.car) {
        s.car = { lngLat: smp.lngLat, bearing: smp.bearing, braking };
      } else {
        const kp = 1 - Math.exp(-dt * 14);
        const kb = 1 - Math.exp(-dt * 5);
        s.car = {
          lngLat: [mix(s.car.lngLat[0], smp.lngLat[0], kp), mix(s.car.lngLat[1], smp.lngLat[1], kp)],
          bearing: mixAngle(s.car.bearing, smp.bearing, kb),
          braking,
        };
      }
      m.setCar(s.car);
      m.setCamera(s.mode, s.car, dt, s.playing ? s.rate : 1);
      m.setTrail(smp.fraction);

      // Lighting follows trip clock (e.g. dusk → night mid-trip).
      const lp = lightPresetForHour(localHour(trip.start, s.t));
      if (lp !== s.light) {
        s.light = lp;
        m.setLight(lp);
        setLight(lp);
      }

      // HUD (direct DOM writes).
      s.shownSpeed = mix(s.shownSpeed, s.playing ? smp.speedMph : 0, 1 - Math.exp(-dt * 4));
      if (hudSpeed.current) hudSpeed.current.textContent = String(Math.round(s.shownSpeed));
      if (hudMiles.current) hudMiles.current.textContent = smp.miles.toFixed(1);
      if (hudElapsed.current) hudElapsed.current.textContent = formatElapsed(s.t);
      if (hudClock.current) hudClock.current.textContent = formatClock(trip.start, s.t);
      const sc = Math.round(scoreDeltaAt(tl.events, s.t) * 10) / 10;
      if (sc !== s.lastScore && hudScore.current) {
        s.lastScore = sc;
        hudScore.current.textContent = sc === 0 ? "±0" : sc > 0 ? `+${sc}` : `−${Math.abs(sc)}`;
        hudScore.current.dataset.neg = sc < 0 ? "1" : "0";
      }
      const pct = (s.t / tl.duration) * 100;
      if (hudFill.current) hudFill.current.style.transform = `translateX(-${100 - pct}%)`;
      if (hudThumb.current) hudThumb.current.style.transform = `translateX(${pct}%)`;
      if (hudRange.current && !s.scrubbing) {
        hudRange.current.value = String(Math.round(s.t));
        hudRange.current.setAttribute("aria-valuetext", `${formatElapsed(s.t)} of ${formatElapsed(tl.duration)}`);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [tl, trip.start, showCallout]);

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inRoot = !!(t && rootRef.current?.contains(t));
      if (inline && !inRoot) return;
      if (t && !inRoot && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (t && inRoot && t.tagName === "INPUT" && e.key !== " ") return; // range handles arrows itself
      const step = e.shiftKey ? 120 : 30;
      if (e.key === " " || e.code === "Space") {
        if (t?.tagName === "BUTTON" && inRoot) return; // let the focused button activate
        e.preventDefault();
        play(!st.current.playing);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seek(st.current.t + step);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seek(st.current.t - step);
      } else if (e.key === "Escape") {
        if (!inline) close();
      } else if (e.key.toLowerCase() === "c" && !e.metaKey && !e.ctrlKey) {
        const i = MODES.findIndex((m) => m.id === st.current.mode);
        changeMode(MODES[(i + 1) % MODES.length].id);
      } else if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey) {
        resetView();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [play, seek, close, changeMode, resetView, inline]);

  const provider = providerProp ?? chosenProvider();
  const date = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(trip.start));
    } catch {
      return trip.start;
    }
  }, [trip.start]);

  const ticks = tl.events.filter((e) => e.type !== "speeding-end");
  const fallback = status === "error" || status === "nowebgl";

  return (
    <section
      ref={rootRef}
      className={`nm-replay relative isolate h-full min-h-[420px] w-full overflow-hidden rounded-lg bg-[#07090f] text-white ${reducedMotion ? "nm-reduced" : ""} ${className ?? ""}`}
      aria-label={`3D replay of trip to ${trip.destinationLabel}`}
    >
      {/* Wrapper: mapbox-gl.css forces position:relative on the map element itself. */}
      <div className={`absolute inset-0 ${fallback ? "hidden" : ""}`}>
        <div ref={mapElRef} className="h-full w-full" />
      </div>
      {fallback && (
        <div className="absolute inset-0">
          <RouteFallback trip={trip} reason={status === "nowebgl" ? "3D view needs WebGL, showing the 2D route" : `3D map unavailable (${errorMsg.slice(0, 60)}), showing the 2D route`} />
        </div>
      )}

      {/* Vignette for legibility */}
      <div className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(180deg,rgba(5,7,12,0.65)_0%,rgba(5,7,12,0)_22%,rgba(5,7,12,0)_62%,rgba(5,7,12,0.8)_100%)]" />

      {status === "loading" && (
        <div className="nm-loading-sheen absolute inset-0 z-[3] grid place-items-center">
          <p className="rounded-full bg-white/10 px-4 py-2 text-sm text-white/80 backdrop-blur-md">Loading 3D map…</p>
        </div>
      )}

      {/* Header: full-screen replay only. The inline one (car Driving page) is titled by its page and stays minimal:
          no trip card, no legend, no readouts. */}
      {!inline && <header className="absolute inset-x-0 top-0 z-[5] flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="min-w-0 rounded-lg border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-md">
          <p className="text-[11px] font-medium text-white/55">Ride replay, {trip.category.replace("-", " ")}</p>
          <h2 className="truncate text-sm font-semibold sm:text-base">{trip.destinationLabel}</h2>
          <p className="text-xs text-white/60">
            {date}, {trip.miles.toFixed(1)} mi, score <span className="font-semibold text-white">{trip.score}</span>
            <span className="ml-2 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70">{light.charAt(0).toUpperCase() + light.slice(1)}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setLegendOpen((v) => !v)} aria-expanded={legendOpen} className="hidden h-10 rounded-full border border-white/10 bg-black/40 px-3 text-xs font-medium text-white/80 backdrop-blur-md transition-[background-color] duration-200 ease-ui-color hover:bg-white/15 sm:block">
            Legend
          </button>
          <button type="button" onClick={close} aria-label="Close replay (Esc)" className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-black/40 text-lg backdrop-blur-md transition-[background-color] duration-200 ease-ui-color hover:bg-white/15">
            <span aria-hidden>×</span>
          </button>
        </div>
      </header>}

      {/* Legend */}
      {legendOpen && !inline && (
        <aside className="absolute right-3 top-[76px] z-[5] hidden w-48 rounded-lg border border-white/10 bg-black/45 p-3 text-xs text-white/75 backdrop-blur-md sm:block sm:right-4">
          <p className="mb-2 text-[11px] font-medium text-white/50">Legend</p>
          <ul className="space-y-1.5">
            <li className="flex items-center gap-2"><span className="h-1 w-5 rounded-full" style={{ background: ROUTE_COLORS.normal, boxShadow: `0 0 8px ${ROUTE_COLORS.normal}` }} />Driven route</li>
            <li className="flex items-center gap-2"><span className="h-1 w-5 rounded-full" style={{ background: ROUTE_COLORS.speeding, boxShadow: `0 0 8px ${ROUTE_COLORS.speeding}` }} />Speeding stretch</li>
            <li className="flex items-center gap-2"><span className="h-0 w-5 border-t-2 border-dashed border-white/40" />Still ahead</li>
            {(["hard-brake", "fast-accel", "harsh-corner"] as const).map((k) => (
              <li key={k} className="flex items-center gap-2"><span className="ml-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white/80" style={{ background: EVENT_STYLE[k].color }} /><span className="ml-1">{EVENT_STYLE[k].label}</span></li>
            ))}
          </ul>
          <p className="mt-2 border-t border-white/10 pt-2 text-[10px] leading-relaxed text-white/45">{inline ? "Space play, ←/→ scrub, C camera, R reset" : "Space play, ←/→ scrub, C camera, R reset, Esc close"}</p>
        </aside>
      )}

      {/* Event callout */}
      {callout && (
        <div role="status" aria-live="polite" key={callout.idx} className={`nm-replay-callout absolute left-1/2 ${inline ? "top-3 sm:top-4" : "top-[86px]"} z-[6] flex items-center gap-2 whitespace-nowrap rounded-full border border-white/15 bg-black/60 px-4 py-2 text-sm font-medium shadow-2xl backdrop-blur-md`} style={{ boxShadow: `0 0 0 1px ${callout.color}55, 0 10px 40px ${callout.color}40` }}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: callout.color, boxShadow: `0 0 10px ${callout.color}` }} />
          {callout.text}
        </div>
      )}

      {/* HUD + controls */}
      <div className="absolute inset-x-0 bottom-0 z-[5] p-3 sm:p-4">
        {/* Readouts only in the full-screen replay; the inline one keeps just the timeline and controls. */}
        {!inline && <div className="mb-3 flex flex-wrap items-end gap-2 sm:gap-3">
          <div className="rounded-lg border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-md">
            <p className="text-[11px] text-white/50">Speed</p>
            <p className="font-mono text-2xl font-semibold tabular-nums leading-none sm:text-3xl"><span ref={hudSpeed}>0</span><span className="ml-1 text-xs font-normal text-white/50">mph</span></p>
          </div>
          <Stat label="Miles"><span ref={hudMiles}>0.0</span><span className="text-white/40"> / {trip.miles.toFixed(1)}</span></Stat>
          <Stat label="Elapsed" className="hidden sm:block"><span ref={hudElapsed}>0:00</span></Stat>
          <Stat label="Clock" className="hidden sm:block"><span ref={hudClock}>{formatClock(trip.start)}</span></Stat>
          <Stat label="Score change"><span ref={hudScore} className="data-[neg=1]:text-[#FF6B7A]">±0</span></Stat>
        </div>}

        <div className="rounded-lg border border-white/10 bg-black/50 p-2.5 backdrop-blur-md sm:p-3">
          {/* Scrubber */}
          <div className="relative mx-1 mb-2.5 h-6">
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/12 bg-white/10" />
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full">
              <div ref={hudFill} className="h-full w-full rounded-full" style={{ transform: "translateX(-100%)", background: `linear-gradient(90deg, ${ROUTE_COLORS.normal}, #9BE8FF)`, boxShadow: `0 0 12px ${ROUTE_COLORS.normal}88` }} />
            </div>
            {ticks.map((e, i) => (
              <button
                key={i}
                type="button"
                tabIndex={-1}
                title={`${EVENT_STYLE[e.type].label}, ${formatElapsed(e.t)}`}
                aria-hidden
                onClick={() => {
                  seek(Math.max(0, e.t - 3));
                  showCallout(e, tl.events.indexOf(e));
                }}
                className="absolute top-1/2 z-[2] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-black/60 transition-shadow duration-200 ease-ui-color hover:ring-white/90"
                style={{ left: `${(e.t / tl.duration) * 100}%`, background: EVENT_STYLE[e.type].color }}
              />
            ))}
            <input
              ref={hudRange}
              type="range"
              min={0}
              max={Math.round(tl.duration)}
              step={1}
              defaultValue={0}
              aria-label="Trip timeline"
              className="nm-scrub absolute inset-0 z-[1] h-full w-full"
              onPointerDown={() => { st.current.scrubbing = true; }}
              onPointerUp={() => { st.current.scrubbing = false; }}
              onInput={(e) => seek(Number((e.target as HTMLInputElement).value))}
            />
            <div ref={hudThumb} className="nm-thumb pointer-events-none absolute inset-x-0 top-1/2 z-[3]" style={{ transform: "translateX(0%)" }}>
              <span className="block h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_4px_rgba(79,209,255,0.35),0_2px_8px_rgba(0,0,0,0.6)]" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => play(!playing)} aria-label={playing ? "Pause (Space)" : "Play (Space)"} className="grid h-11 w-11 place-items-center rounded-full bg-white text-black shadow-lg transition-[scale,background-color] duration-[400ms,200ms] ease-[var(--ease-press),var(--ease-ui-color)] hover:bg-white/85 active:scale-[0.97] motion-reduce:active:scale-100">
              {playing ? (
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M4 2.5v11a.8.8 0 0 0 1.2.7l9-5.5a.8.8 0 0 0 0-1.4l-9-5.5A.8.8 0 0 0 4 2.5Z" fill="currentColor" /></svg>
              )}
            </button>

            <Segmented label="Playback speed" value={speed} options={speeds.options.map((v) => ({ id: v, label: `${v}×` }))} onChange={(v) => changeSpeed(v as Speed)} />
            <Segmented label="Camera" value={mode} options={MODES.map((m) => ({ id: m.id, label: m.label, title: m.hint }))} onChange={(v) => changeMode(v as CameraMode)} />

            <button type="button" onClick={resetView} className="ml-auto h-9 rounded-full border border-white/15 px-3 text-xs font-medium text-white/85 transition-[background-color] duration-200 ease-ui-color hover:bg-white/10" title="Reset camera (R)">
              Reset view
            </button>
          </div>
        </div>
        <p className="sr-only">Provider: {provider}</p>
      </div>
    </section>
  );
}

function Stat({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-md ${className ?? ""}`}>
      <p className="text-[11px] text-white/50">{label}</p>
      <p className="font-mono text-sm font-semibold tabular-nums sm:text-base">{children}</p>
    </div>
  );
}

function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string; title?: string }[]; onChange(v: T): void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-9 items-center rounded-full border border-white/10 bg-white/5 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          title={o.title}
          onClick={() => onChange(o.id)}
          className={`h-8 rounded-full px-3 text-xs font-medium transition-[color,background-color,box-shadow] duration-200 ease-ui-color ${o.id === value ? "bg-white text-black shadow" : "text-white/70 hover:text-white"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
