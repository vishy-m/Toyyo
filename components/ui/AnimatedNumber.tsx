"use client";

import { animate, useMotionValue, useTransform, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { spring, useShouldReduceMotion } from "@animate-ui/react/utils/motion";

/** Rolls to `value` on change (spring.number: no overshoot, so it never shows a figure past the real one). Instant under reduced motion. */
export function AnimatedNumber({
  value,
  format = (n) => Math.round(n).toLocaleString("en-US"),
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const reduced = useShouldReduceMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(v));
  const first = useRef(true);
  useEffect(() => {
    if (first.current || reduced) {
      first.current = false;
      mv.set(value);
      return;
    }
    const c = animate(mv, value, { ...spring.number, restDelta: 0.5 });
    return () => c.stop();
  }, [value, reduced, mv]);
  return <motion.span className={className}>{text}</motion.span>;
}
