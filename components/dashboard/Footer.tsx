"use client";

import { useEffect, useState } from "react";
import ModelCredits from "@/components/three/ModelCredits";
import { subscribeSources, type Source } from "@/lib/client/api";
import { ToyyoLogo } from "@/components/branding/ToyyoLogo";

export function Footer() {
  const [sources, setSources] = useState<Record<string, Source>>({});
  useEffect(() => subscribeSources(setSources), []);
  const mocked = Object.entries(sources).filter(([, s]) => s === "mock").map(([k]) => k);
  return (
    <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-1 pt-2 pb-4 text-xs text-ink-3">
      <div className="flex w-full flex-wrap items-center gap-4">
        <ToyyoLogo />
        <p className="max-w-[75ch] flex-1 basis-64">Toyyo is an independent hackathon prototype with synthetic data. Toyota Financial Services is the challenge sponsor. Toyyo is not an official Toyota or TFS product and is not financial advice.</p>
      </div>
      <ModelCredits className="w-full sm:w-auto" />
      {mocked.length > 0 && (
        <p title={`Mocked: ${mocked.join(", ")}`}>
          Offline demo data for {mocked.length} {mocked.length === 1 ? "service" : "services"}
        </p>
      )}
    </footer>
  );
}
