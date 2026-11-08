"use client";

import type { CaseFile } from "@/lib/types";
import "./case.css";

/** Who drives this car and what's going on: one line of who, one of context. Options live on the detail pages. */
export function CaseSection({ kase }: { kase: CaseFile }) {
  const { driver } = kase;
  return (
    <section className="case" aria-label="The owner and their situation">
      <div className="case-story">
        <p className="case-who">{driver.firstName}, {driver.age} · {driver.city}{driver.occupation ? ` · ${driver.occupation}` : ""}</p>
        <p className="case-context">{kase.context}</p>
      </div>
    </section>
  );
}
