"use client";

import clsx from "clsx";
import { motion, useTransform, type MotionValue } from "motion/react";
import { useRef, type ReactNode } from "react";
import { useDirector } from "@/lib/client/director";
import { useUiStore } from "@/lib/client/ui-store";

/**
 * A transparent area over the car that turns it when dragged sideways. Vertical drags still
 * scroll the page on touch screens (touch-action: pan-y).
 */
export function DragSurface({ className, children, label = "Drag to turn the car" }: { className?: string; children?: ReactNode; label?: string }) {
  const dragBy = useDirector((s) => s.dragBy);
  const last = useRef<number | null>(null);
  return (
    <div
      role="presentation"
      aria-label={label}
      className={clsx("cursor-grab touch-pan-y select-none active:cursor-grabbing", className)}
      onPointerDown={(e) => {
        last.current = e.clientX;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (last.current == null) return;
        const dx = e.clientX - last.current;
        last.current = e.clientX;
        dragBy(dx * 0.0085);
      }}
      onPointerUp={() => (last.current = null)}
      onPointerCancel={() => (last.current = null)}
    >
      {children}
    </div>
  );
}

/** Words that light up one by one as the scroll progress moves through `range`. */
export function ScrubText({ text, progress, range = [0.05, 0.45], className, as = "p" }: { text: string; progress: MotionValue<number>; range?: [number, number]; className?: string; as?: "p" | "h2" | "h3" }) {
  const reduced = useUiStore((s) => s.reducedMotion);
  const Tag = as;
  if (reduced) return <Tag className={className}>{text}</Tag>;
  const words = text.split(" ");
  const span = (range[1] - range[0]) / words.length;
  return (
    <Tag className={className}>
      {words.map((w, i) => (
        <Word key={i} progress={progress} range={[range[0] + span * i, range[0] + span * (i + 1)]}>
          {w}
          {i < words.length - 1 ? " " : ""}
        </Word>
      ))}
    </Tag>
  );
}

function Word({ progress, range, children }: { progress: MotionValue<number>; range: [number, number]; children: ReactNode }) {
  const opacity = useTransform(progress, range, [0.14, 1]);
  return <motion.span style={{ opacity }}>{children}</motion.span>;
}

/** A figure that counts from `from` to `to` as the scroll progress moves through `range`. */
export function ScrubNumber({ progress, from, to, range = [0.1, 0.55], format = (n) => Math.round(n).toLocaleString("en-US"), className }: { progress: MotionValue<number>; from: number; to: number; range?: [number, number]; format?: (n: number) => string; className?: string }) {
  const reduced = useUiStore((s) => s.reducedMotion);
  const value = useTransform(progress, range, [reduced ? to : from, to], { clamp: true });
  const text = useTransform(value, (v) => format(v));
  return <motion.span className={className}>{text}</motion.span>;
}

/** Fades and lifts its children in over a slice of the scroll progress (and back out at the end). */
export function ScrubReveal({ progress, inAt = [0.04, 0.16], outAt = [0.9, 1], className, children }: { progress: MotionValue<number>; inAt?: [number, number]; outAt?: [number, number]; className?: string; children: ReactNode }) {
  const reduced = useUiStore((s) => s.reducedMotion);
  const opacity = useTransform(progress, [inAt[0], inAt[1], outAt[0], outAt[1]], reduced ? [1, 1, 1, 1] : [0, 1, 1, 0]);
  const y = useTransform(progress, [inAt[0], inAt[1], outAt[0], outAt[1]], reduced ? [0, 0, 0, 0] : [36, 0, 0, -24]);
  return (
    <motion.div style={{ opacity, y }} className={className}>
      {children}
    </motion.div>
  );
}
