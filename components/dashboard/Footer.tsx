"use client";

import { useEffect, useState } from "react";
import ModelCredits from "@/components/three/ModelCredits";
import { subscribeSources, type Source } from "@/lib/client/api";

export function Footer() {
  const [sources, setSources] = useState<Record<string, Source>>({});
  useEffect(() => subscribeSources(setSources), []);
  const mocked = Object.entries(sources).filter(([, s]) => s === "mock").map(([k]) => k);
  return (
    <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-1 pt-2 pb-4 text-xs text-ink-3">
      <p>A concept prototype with synthetic data. It is not an official Toyota or TFS product and is not financial advice.</p>
      <ModelCredits className="w-full sm:w-auto" />
      {mocked.length > 0 && (
        <p title={`Mocked: ${mocked.join(", ")}`}>
          Offline demo data for {mocked.length} {mocked.length === 1 ? "service" : "services"}
        </p>
      )}
    </footer>
  );
}
