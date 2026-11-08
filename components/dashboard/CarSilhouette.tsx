import type { BodyStyle } from "@/lib/types";

// Side-profile silhouettes used as the loading state and the no-WebGL fallback for the 3D car.
const BODIES: Record<BodyStyle, { body: string; glass: string; wheels: [number, number]; r: number }> = {
  sedan: {
    body: "M40 150 C40 132 52 124 78 120 L150 112 C176 86 206 70 250 66 L352 66 C392 68 420 86 446 110 L520 118 C548 122 562 132 564 148 L564 164 C564 170 560 174 552 174 L48 174 C42 174 40 170 40 164 Z",
    glass: "M170 112 C192 90 216 80 252 78 L300 78 L300 112 Z M312 78 L350 78 C380 80 402 92 424 112 L312 112 Z",
    wheels: [148, 462],
    r: 33,
  },
  suv: {
    body: "M40 150 C40 128 50 118 72 114 L132 104 C150 76 170 58 210 54 L410 54 C440 56 456 70 470 100 L522 108 C552 114 564 126 564 146 L564 166 C564 172 560 176 552 176 L48 176 C42 176 40 172 40 166 Z",
    glass: "M150 104 C164 82 182 68 214 66 L300 66 L300 104 Z M312 66 L404 66 C428 68 440 80 452 104 L312 104 Z",
    wheels: [150, 456],
    r: 37,
  },
  truck: {
    body: "M36 150 C36 126 48 116 70 112 L136 102 C150 74 168 56 204 52 L322 52 C342 52 352 62 356 84 L356 108 L556 108 C566 108 570 116 570 126 L570 166 C570 172 566 176 558 176 L44 176 C38 176 36 172 36 166 Z",
    glass: "M154 102 C166 80 182 66 208 64 L264 64 L264 102 Z M276 64 L320 64 C334 64 340 72 342 86 L342 102 L276 102 Z",
    wheels: [150, 470],
    r: 38,
  },
};

export function CarSilhouette({ bodyStyle, paint, className }: { bodyStyle: BodyStyle; paint: string; className?: string }) {
  const b = BODIES[bodyStyle];
  const id = `car-${bodyStyle}`;
  return (
    <svg viewBox="0 0 604 230" className={className} role="img" aria-label={`${bodyStyle} silhouette`}>
      <defs>
        <linearGradient id={`${id}-paint`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={paint} stopOpacity="1" />
          <stop offset="0.55" stopColor={paint} stopOpacity="0.92" />
          <stop offset="1" stopColor="#000" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-floor`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="302" cy="184" rx="290" ry="20" fill={`url(#${id}-floor)`} />
      <path d={b.body} fill={`url(#${id}-paint)`} />
      <path d={b.body} fill={`url(#${id}-sheen)`} />
      <path d={b.glass} fill="#0b0f15" opacity="0.88" />
      {b.wheels.map((x) => (
        <g key={x}>
          <circle cx={x} cy={176} r={b.r} fill="#0a0c10" />
          <circle cx={x} cy={176} r={b.r * 0.58} fill="#2a2f37" />
          <circle cx={x} cy={176} r={b.r * 0.18} fill="#565d68" />
        </g>
      ))}
      <rect x="548" y="128" width="14" height="6" rx="3" fill="#fff" opacity="0.7" />
      <rect x="40" y="128" width="12" height="6" rx="3" fill="var(--accent)" opacity="0.9" />
    </svg>
  );
}
