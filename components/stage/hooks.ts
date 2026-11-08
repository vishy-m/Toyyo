"use client";

import { useMotionValueEvent, useScroll, type MotionValue } from "motion/react";
import { useEffect, type RefObject } from "react";
import { blendPose, ease, SHOTS, useDirector, type Pose, type ShotName } from "@/lib/client/director";

const poseOf = (s: ShotName | Pose): Pose => (typeof s === "string" ? SHOTS[s] : s);

/** Set the stage's pose once when a page mounts (a route change flies the car to it). */
export function usePageShot(shot: ShotName | Pose, calloutText = "") {
  const key = typeof shot === "string" ? shot : JSON.stringify(shot);
  useEffect(() => {
    useDirector.getState().setPose(poseOf(shot), calloutText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, calloutText]);
}

/**
 * Scrub the camera from one shot to another while `ref` scrolls through the viewport.
 * Progress is 0 when the section's top meets the viewport top and 1 when its bottom meets the
 * viewport bottom (a pinned, sticky chapter). Outside that range the value is clamped and does not
 * change, so only the section on screen drives the camera.
 */
export function useScrollShot(
  ref: RefObject<HTMLElement | null>,
  from: ShotName | Pose,
  to: ShotName | Pose,
  opts: { calloutText?: string; offset?: ["start start" | "start end" | "start center", "end end" | "end start" | "end center"] } = {},
): MotionValue<number> {
  const { scrollYProgress } = useScroll({ target: ref, offset: opts.offset ?? ["start start", "end end"] });
  const calloutText = opts.calloutText ?? "";
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const a = poseOf(from);
    const b = poseOf(to);
    // Hold each end for a moment so the camera rests at both shots.
    const t = ease(Math.min(1, Math.max(0, (p - 0.08) / 0.8)));
    useDirector.getState().setPose(blendPose(a, b, t), calloutText);
  });
  return scrollYProgress;
}
