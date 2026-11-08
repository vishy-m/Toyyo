"use client";

// The dashboard layout's client shell. It stays mounted across page navigations, so the 3D
// stage (and the car on it) persists while the pages change around it.

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, type ReactNode } from "react";
import { AcceptModal } from "@/components/agent/AcceptModal";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { WhyDrawer } from "@/components/agent/WhyDrawer";
import { useDataStore } from "@/lib/client/data-store";
import { useDashboard } from "@/lib/client/use-dashboard";
import { useDirector, SHOTS } from "@/lib/client/director";
import { useReducedMotionSync } from "@/lib/client/hooks";
import { useUiStore } from "@/lib/client/ui-store";
import type { Hotspot, PersonaId } from "@/lib/types";
import { ConsentSheet } from "./ConsentSheet";
import { Footer } from "./Footer";
import { MoveDrawer } from "./MoveDrawer";
import { RideReplaySlot } from "./RideReplaySlot";
import { TopBar } from "./TopBar";

const CarStage = dynamic(() => import("@/components/stage/CarStage"), { ssr: false, loading: () => null });

// The agent can point at a part of the car (ui_action focus_vehicle_hotspot): fly there.
const hotspotShot: Record<Hotspot, keyof typeof SHOTS> = {
  odometer: "move-lease-end",
  "driver-seat": "move-insurance",
  engine: "move-protection",
  tires: "tires",
};

export function DashboardShell({ children }: { children: ReactNode }) {
  useReducedMotionSync();
  const personaId = useUiStore((s) => s.personaId);
  const activeHotspot = useUiStore((s) => s.activeHotspot);
  const { data, error } = useDashboard();
  // The car belongs to the landing page. Elsewhere the stage fades out and stops rendering.
  const onLanding = usePathname() === "/";
  const loadDashboard = useDashboardLoaders();

  useEffect(() => {
    loadDashboard(personaId);
  }, [personaId, loadDashboard]);

  useEffect(() => {
    if (activeHotspot) useDirector.getState().setPose(SHOTS[hotspotShot[activeHotspot]]);
  }, [activeHotspot]);

  return (
    <div className="relative flex min-h-dvh flex-col">
      <CarStage vehicle={data?.persona.vehicle} active={onLanding} />
      <TopBar data={data} />
      <main id="main" className="relative z-[2] flex-1">
        {error && !data ? (
          <div role="alert" className="glass mx-auto mt-8 max-w-xl rounded-xl p-6 text-sm text-ink-2">
            Your dashboard didn&apos;t load ({error}). Check that the dev server is running, then reload the page.
          </div>
        ) : null}
        {children}
      </main>
      <div className="relative z-[2] bg-[var(--bg)]">
        <div className="mx-auto w-full max-w-[1440px] px-5 pb-20 sm:px-10">
          <Footer />
        </div>
      </div>

      <AgentPanel data={data} />
      <MoveDrawer data={data} />
      <WhyDrawer data={data} />
      <AcceptModal data={data} />
      <ConsentSheet data={data} />
      <RideReplaySlot />
    </div>
  );
}

function useDashboardLoaders() {
  const loadDashboard = useDataStore((s) => s.loadDashboard);
  const loadAgent = useDataStore((s) => s.loadAgent);
  return useCallback(
    (id: PersonaId) => {
      void loadDashboard(id);
      void loadAgent(id);
    },
    [loadDashboard, loadAgent],
  );
}
