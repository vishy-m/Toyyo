"use client";

import { spring, transition, useShouldReduceMotion } from "@animate-ui/react/utils/motion";
import { motion } from "motion/react";

/** Progress ring (e.g. months elapsed in a contract). `value` in 0..1. */
export function Ring({
  value,
  size = 92,
  stroke = 7,
  tone = "ink",
  children,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: "ink" | "accent" | "good" | "warn";
  children?: React.ReactNode;
  label: string;
}) {
  const reduce = useShouldReduceMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = { ink: "var(--ink)", accent: "var(--accent)", good: "var(--good)", warn: "var(--warn)" }[tone];
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-2)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, value))) }}
          transition={reduce ? transition.instant : spring.number}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
