"use client";

// The camera director: one shared target pose for the persistent 3D stage.
// Pages and scroll sections write a pose; the stage eases the camera and car toward it every
// frame. The stage reads it with getState() inside the render loop, so writes never re-render.

import { create } from "zustand";
import type { Hotspot, MoveOption } from "@/lib/types";

export type V3 = [number, number, number];

export interface Pose {
  /** Camera position, world units (meters). The car sits at the origin, nose toward +Z, driver side +X. */
  eye: V3;
  /** Point the camera looks at. */
  target: V3;
  fov: number;
  /** Where the car sits on screen, as a fraction of the viewport: +x moves it right, +y moves it up. */
  offset: [number, number];
  /** Offset used on portrait screens (phones), where text sits under the car. */
  mobileOffset: [number, number];
  /** Car heading, radians. */
  yaw: number;
  /** Idle turntable speed, rad/s. 0 settles the car back to `yaw`. */
  spin: number;
  /** Hotspot to annotate with a callout. */
  callout: Hotspot | null;
}

interface DirectorState {
  pose: Pose;
  /** Text for the callout pinned to `pose.callout`. */
  calloutText: string;
  /** Upgrade model shown beside the car (overview "preview"). */
  preview?: MoveOption["upgradeModel"];
  /** Accumulated user drag, radians; the stage consumes it. */
  drag: number;
  /** Bumped on every write so the stage knows to keep rendering. */
  version: number;
  setPose: (pose: Pose, calloutText?: string) => void;
  setCalloutText: (text: string) => void;
  setPreview: (m: MoveOption["upgradeModel"] | undefined) => void;
  dragBy: (radians: number) => void;
  takeDrag: () => number;
}

export const useDirector = create<DirectorState>((set, get) => ({
  pose: SHOT_HERO(),
  calloutText: "",
  preview: undefined,
  drag: 0,
  version: 0,
  setPose: (pose, calloutText) =>
    set((s) => ({ pose, calloutText: calloutText ?? s.calloutText, version: s.version + 1 })),
  setCalloutText: (calloutText) => set((s) => ({ calloutText, version: s.version + 1 })),
  setPreview: (preview) => set((s) => ({ preview, version: s.version + 1 })),
  dragBy: (r) => set((s) => ({ drag: s.drag + r, version: s.version + 1 })),
  takeDrag: () => {
    const d = get().drag;
    if (d) set({ drag: 0 });
    return d;
  },
}));

// ---------------------------------------------------------------- shots
// Hand-tuned for a ~4.6–5 m car normalised by CarModel (any GLB dropped into the manifest fits).

// Function declarations (hoisted): the store above calls SHOT_HERO() while this module evaluates.
function shot(p: Partial<Pose> & Pick<Pose, "eye" | "target">): Pose {
  return { fov: 30, offset: [0, 0], mobileOffset: [0, 0.2], yaw: 0, spin: 0, callout: null, ...p };
}

function SHOT_HERO(): Pose {
  return shot({ eye: [7.3, 2.4, 8.4], target: [0, 0.62, 0], fov: 29, offset: [0.2, -0.02], mobileOffset: [0, 0.2], spin: 0.06 });
}

export const SHOTS = {
  /** Overview opener: three-quarter front, turntable, car on the right. */
  hero: SHOT_HERO(),
  /** Summary mode: the same framing, standing still at a three-quarter angle. */
  heroStill: shot({ eye: [7.3, 2.4, 8.4], target: [0, 0.62, 0], fov: 29, offset: [0.2, -0.02], mobileOffset: [0, 0.2], yaw: 0.2 }),
  /** Overview opener as it scrolls away: camera lifts, car centred and smaller. */
  heroLift: shot({ eye: [5.8, 5.6, 10.6], target: [0, 0.4, 0], fov: 30, offset: [0.12, 0.06], mobileOffset: [0, 0.22], yaw: 0.6 }),
  /** Driver side, wide, before diving to the odometer. Car on the left. */
  sideWide: shot({ eye: [10.6, 2.0, 1.6], target: [0, 0.7, 0.2], fov: 30, offset: [-0.22, 0], mobileOffset: [0, 0.22], yaw: 0 }),
  /** Close on the instrument cluster through the driver window. */
  odometer: shot({ eye: [6.25, 4.1, 3.95], target: [0.25, 1.0, 0.55], fov: 30, offset: [-0.25, 0], mobileOffset: [0, 0.2], callout: "odometer" }),
  /** Low along the side toward the front wheel. Car on the right. */
  tiresWide: shot({ eye: [7.8, 0.95, 8.1], target: [0.2, 0.5, 0.6], fov: 30, offset: [0.22, 0], mobileOffset: [0, 0.22], yaw: 0 }),
  tires: shot({ eye: [6.1, 1.4, 5.95], target: [0.9, 0.38, 1.35], fov: 30, offset: [0.25, 0], mobileOffset: [0, 0.2], callout: "tires" }),
  /** Head-on, then over the hood. Car on the left. */
  frontWide: shot({ eye: [1.8, 2.0, 11.2], target: [0, 0.7, 0], fov: 28, offset: [-0.22, 0], mobileOffset: [0, 0.22], yaw: 0 }),
  engine: shot({ eye: [1.75, 5.0, 7.25], target: [0, 0.75, 1.5], fov: 30, offset: [-0.25, 0], mobileOffset: [0, 0.2], callout: "engine" }),
  /** Rear three-quarter rising to the driver door. Car on the right. */
  rearWide: shot({ eye: [7.5, 2.3, -8.5], target: [0, 0.7, 0], fov: 29, offset: [0.22, 0], mobileOffset: [0, 0.22], yaw: 0 }),
  seat: shot({ eye: [7.35, 3.25, -2.4], target: [0.35, 1.05, -0.2], fov: 30, offset: [0.25, 0], mobileOffset: [0, 0.2], callout: "driver-seat" }),
  /** Finale: low front three-quarter, car centred under the headline. */
  finale: shot({ eye: [-8.4, 1.7, 9.2], target: [0, 0.8, 0], fov: 27, offset: [0, -0.2], mobileOffset: [0, 0.18], yaw: 0, spin: 0 }),
  finaleClose: shot({ eye: [-7.2, 1.4, 7.8], target: [0, 0.75, 0], fov: 28, offset: [0, -0.22], mobileOffset: [0, 0.18], spin: 0.05 }),

  // Page shots (route changes fly between these)
  moves: shot({ eye: [7.9, 2.9, 8.2], target: [0, 0.65, 0], fov: 30, offset: [0.25, 0.04], mobileOffset: [0, 0.24], yaw: -0.3, spin: 0.05 }),
  finances: shot({ eye: [-8.0, 2.6, -8.0], target: [0, 0.7, 0], fov: 29, offset: [0.24, 0.12], mobileOffset: [0, 0.26], yaw: 0 }),
  financesLow: shot({ eye: [-8.7, 7.4, -5.2], target: [0, 0.4, 0], fov: 30, offset: [0.26, 0.2], mobileOffset: [0, 0.3], yaw: 0.4 }),
  driving: shot({ eye: [0.6, 17.5, 4.2], target: [0, 0, 0], fov: 28, offset: [0.26, 0.06], mobileOffset: [0, 0.26], yaw: 0.9, spin: 0.04 }),
  drivingLow: shot({ eye: [5.2, 19, 9.5], target: [0, 0, 0], fov: 30, offset: [0.28, 0.2], mobileOffset: [0, 0.32], yaw: 1.4 }),
  repair: shot({ eye: [4.6, 4.4, 9.8], target: [0, 0.7, 0.8], fov: 30, offset: [0.28, 0.02], mobileOffset: [0, 0.24], callout: "engine" }),
  // Moves page: one per move type
  "move-lease-end": shot({ eye: [6.25, 4.1, 3.95], target: [0.25, 0.95, 0.5], fov: 30, offset: [0.25, 0.02], mobileOffset: [0, 0.22], callout: "odometer" }),
  "move-insurance": shot({ eye: [7.35, 3.25, -2.4], target: [0.35, 1.0, -0.2], fov: 30, offset: [0.25, 0.02], mobileOffset: [0, 0.22], callout: "driver-seat" }),
  "move-payment": shot({ eye: [-7.3, 2.0, -7.9], target: [0, 0.7, 0], fov: 29, offset: [0.25, 0.02], mobileOffset: [0, 0.22] }),
  "move-protection": shot({ eye: [1.75, 5.0, 7.25], target: [0, 0.75, 1.4], fov: 30, offset: [0.25, 0.02], mobileOffset: [0, 0.22], callout: "engine" }),
} satisfies Record<string, Pose>;

export type ShotName = keyof typeof SHOTS;

// ---------------------------------------------------------------- blending

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Blend two poses. The callout belongs to whichever pose is closer. */
export function blendPose(a: Pose, b: Pose, t: number): Pose {
  return {
    eye: lerp3(a.eye, b.eye, t),
    target: lerp3(a.target, b.target, t),
    fov: lerp(a.fov, b.fov, t),
    offset: [lerp(a.offset[0], b.offset[0], t), lerp(a.offset[1], b.offset[1], t)],
    mobileOffset: [lerp(a.mobileOffset[0], b.mobileOffset[0], t), lerp(a.mobileOffset[1], b.mobileOffset[1], t)],
    yaw: lerp(a.yaw, b.yaw, t),
    spin: t < 0.5 ? a.spin : b.spin,
    callout: t < 0.62 ? (t > 0.38 ? null : a.callout) : b.callout,
  };
}

/** Smoothstep easing for scroll-scrubbed shots. */
export const ease = (t: number) => t * t * (3 - 2 * t);
