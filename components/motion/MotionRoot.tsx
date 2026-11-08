"use client";

import { ReducedMotionConfig } from "@animate-ui/react/utils/motion";
import type { ReactNode } from "react";

/**
 * One reduced-motion policy for every Motion element in the app. Under the OS setting, Motion skips
 * x/y/scale/rotate, size and layout animations and keeps fades and blurs. Transform strings are not
 * covered: components that animate one read useShouldReduceMotion() and start from rest.
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <ReducedMotionConfig>{children}</ReducedMotionConfig>;
}
