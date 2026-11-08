import clsx from "clsx";
import type { ReactNode } from "react";

export type Tone = "neutral" | "good" | "warn" | "accent" | "quiet";

const tones: Record<Tone, string> = {
  neutral: "bg-transparent text-ink-2 border-line-2",
  quiet: "bg-transparent text-ink-3 border-line",
  good: "bg-good-soft text-good border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  accent: "bg-accent-soft text-accent-ink border-transparent",
};

export function Chip({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex h-6 items-center gap-1 rounded-md border px-2 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
