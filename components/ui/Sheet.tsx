"use client";

import clsx from "clsx";
import { createContext, useContext, type ReactNode } from "react";

/** Panels inside a Sheet render as statement rows instead of separate cards. */
export const PanelVariantContext = createContext<"card" | "row">("card");
export const usePanelVariant = () => useContext(PanelVariantContext);

/**
 * One continuous sheet for a page's content, the way a statement is one sheet of paper.
 * Sections inside are rows: the section name in a left column, the content to its right,
 * a rule between rows.
 */
export function Sheet({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <PanelVariantContext.Provider value="row">
      <div className={clsx("rounded-xl bg-[var(--glass)] px-5 sm:px-8 lg:px-10", className)}>{children}</div>
    </PanelVariantContext.Provider>
  );
}

/** A page title on the ground, above the sheet. Plain: a title and one sentence. */
export function PageHeader({ title, lead, children }: { title: string; lead?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 pt-10 pb-8 sm:pt-14">
      <div className="max-w-[640px]">
        <h1 className="font-display text-[clamp(39px,4.4vw,61px)] text-ink">{title}</h1>
        {lead && <p className="mt-3 max-w-[56ch] text-[17px] leading-relaxed text-ink-2">{lead}</p>}
      </div>
      {children}
    </header>
  );
}

/** Page frame for the plain pages: ground, header, sheet. */
export function PageFrame({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1240px] px-4 pb-16 sm:px-8">{children}</div>;
}
