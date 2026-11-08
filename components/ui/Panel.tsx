"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { usePanelVariant } from "./Sheet";

/**
 * A titled section. On its own it is a card; inside a <Sheet> it becomes a statement row with the
 * title in a left column. Pass `variant` to force one or the other.
 */
export function Panel({
  title,
  aside,
  children,
  className,
  id,
  as: As = "section",
  variant,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  as?: "section" | "div";
  variant?: "card" | "row";
}) {
  const fromSheet = usePanelVariant();
  const v = variant ?? fromSheet;
  const label = typeof title === "string" ? title : undefined;

  if (v === "row") {
    return (
      <As
        id={id}
        tabIndex={id ? -1 : undefined}
        aria-label={label}
        className={clsx("grid scroll-mt-24 grid-cols-1 gap-x-10 gap-y-5 border-t border-line py-8 outline-none first:border-t-0 lg:grid-cols-[200px_minmax(0,1fr)] lg:py-10", className)}
      >
        {(title || aside) && (
          <div className="flex items-start justify-between gap-3 lg:sticky lg:top-[calc(var(--hdr)+24px)] lg:flex-col lg:self-start">
            {title && <h2 className="text-[20px] leading-tight font-bold tracking-[-0.01em] text-ink">{title}</h2>}
            {aside && <div className="-ml-2.5 flex items-center gap-1.5">{aside}</div>}
          </div>
        )}
        <div className="min-w-0">{children}</div>
      </As>
    );
  }

  return (
    <As id={id} tabIndex={id ? -1 : undefined} aria-label={label} className={clsx("glass scroll-mt-24 rounded-xl p-5 outline-none sm:p-6", className)}>
      {(title || aside) && (
        <div className="mb-4 flex min-h-8 items-center justify-between gap-3">
          {title && <h2 className="text-[16px] font-bold text-ink">{title}</h2>}
          {aside && <div className="flex items-center gap-1.5">{aside}</div>}
        </div>
      )}
      {children}
    </As>
  );
}
