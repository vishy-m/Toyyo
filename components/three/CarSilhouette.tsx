"use client";
// Static 2D fallback for the hero car (no WebGL / model failed): a painted side silhouette.
import type { BodyStyle } from "@/lib/types";

const PATHS: Record<BodyStyle, { body: string; glass: string }> = {
  sedan: {
    body: "M40 150 Q38 128 60 122 L130 112 Q170 76 230 70 L330 70 Q380 74 420 110 L520 120 Q560 126 562 150 L562 166 Q562 174 552 174 L50 174 Q40 174 40 166 Z",
    glass: "M150 113 Q180 84 232 80 L300 80 L300 113 Z M312 80 L332 80 Q370 84 402 113 L312 113 Z",
  },
  suv: {
    body: "M40 150 Q38 118 62 110 L120 104 Q150 62 200 58 L400 58 Q440 60 462 100 L528 112 Q562 120 562 150 L562 166 Q562 174 552 174 L50 174 Q40 174 40 166 Z",
    glass: "M140 104 Q162 70 204 68 L292 68 L292 104 Z M304 68 L396 68 Q428 70 446 104 L304 104 Z",
  },
  truck: {
    body: "M40 150 Q38 120 62 114 L130 108 Q156 66 200 62 L300 62 Q318 64 322 108 L548 108 Q562 110 562 128 L562 166 Q562 174 552 174 L50 174 Q40 174 40 166 Z",
    glass: "M148 108 Q170 74 204 72 L258 72 L258 108 Z M268 72 L300 72 Q310 74 312 108 L268 108 Z",
  },
};

export default function CarSilhouette({ bodyStyle, paintHex, label }: { bodyStyle: BodyStyle; paintHex: string; label: string }) {
  const p = PATHS[bodyStyle] ?? PATHS.sedan;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-6">
      <svg viewBox="0 0 600 220" className="w-full max-w-[520px]" role="img" aria-label={`${label} (static image; 3D unavailable)`}>
        <defs>
          <linearGradient id="nm-paint" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
            <stop offset="0.35" stopColor={paintHex} />
            <stop offset="1" stopColor="#000" stopOpacity="0.55" />
          </linearGradient>
          <radialGradient id="nm-shadow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#000" stopOpacity="0.7" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="300" cy="186" rx="280" ry="16" fill="url(#nm-shadow)" />
        <path d={p.body} fill={paintHex} />
        <path d={p.body} fill="url(#nm-paint)" />
        <path d={p.glass} fill="#0d1520" opacity="0.9" />
        {[150, 452].map((x) => (
          <g key={x}>
            <circle cx={x} cy="172" r="30" fill="#0b0b0d" />
            <circle cx={x} cy="172" r="17" fill="#9aa0a8" />
            <circle cx={x} cy="172" r="6" fill="#2a2d33" />
          </g>
        ))}
        <rect x="548" y="128" width="12" height="8" rx="3" fill="#fff4dd" />
        <rect x="42" y="130" width="10" height="8" rx="3" fill="#ff2a3a" />
      </svg>
      <p className="mt-2 text-xs text-white/50">3D view unavailable, showing a static preview</p>
    </div>
  );
}
