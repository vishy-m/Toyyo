"use client";

// Shared client state: the bridge between the agent panel (task 03) and the 3D views (task 04).
// Agent `ui_action` stream events are dispatched here; 3D components subscribe.
// Changing this shape is a cross-team change: note it in .plans/tasks/STATUS.md.

import { create } from "zustand";
import type { Hotspot, MoveType, PersonaId, UiAction, WhatIfOverrides } from "@/lib/types";

export interface ReplayState {
  tripId: string;
  focusEventT?: number;
}

interface UiState {
  personaId: PersonaId;
  activeHotspot: Hotspot | null;
  replay: ReplayState | null; // non-null => replay view open
  openMove: MoveType | null; // move detail page/drawer
  whatIf: WhatIfOverrides;
  agentPanelOpen: boolean;
  agentContext: { widget?: string; optionId?: string; tripId?: string } | null;
  reducedMotion: boolean;
  /** Landing page: the guided scroll tour, or a plain summary. Remembered per browser. */
  overviewMode: "tour" | "summary";

  setOverviewMode: (m: "tour" | "summary") => void;
  setPersona: (id: PersonaId) => void;
  setHotspot: (h: Hotspot | null) => void;
  openReplay: (r: ReplayState | null) => void;
  setOpenMove: (m: MoveType | null) => void;
  setWhatIf: (patch: Partial<WhatIfOverrides>) => void;
  setAgentPanelOpen: (open: boolean) => void;
  askAgent: (context: UiState["agentContext"]) => void;
  setReducedMotion: (v: boolean) => void;
  dispatchUiAction: (action: UiAction) => void;
}

export const useUiStore = create<UiState>((set) => ({
  personaId: "maya",
  activeHotspot: null,
  replay: null,
  openMove: null,
  whatIf: {},
  agentPanelOpen: false, // the copilot opens over the stage on demand
  agentContext: null,
  reducedMotion: false,
  overviewMode: "tour",

  setOverviewMode: (overviewMode) => {
    try {
      localStorage.setItem("nm-overview", overviewMode);
    } catch {
      /* private mode */
    }
    set({ overviewMode });
  },
  setPersona: (personaId) =>
    set({ personaId, activeHotspot: null, replay: null, openMove: null, whatIf: {}, agentContext: null }),
  setHotspot: (activeHotspot) => set({ activeHotspot }),
  openReplay: (replay) => set({ replay }),
  setOpenMove: (openMove) => set({ openMove }),
  setWhatIf: (patch) => set((s) => ({ whatIf: { ...s.whatIf, ...patch } })),
  setAgentPanelOpen: (agentPanelOpen) => set({ agentPanelOpen }),
  askAgent: (agentContext) => set({ agentContext, agentPanelOpen: true }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  dispatchUiAction: (action) => {
    switch (action.kind) {
      case "open_trip_replay":
        set({ replay: { tripId: action.tripId, focusEventT: action.focusEventT } });
        break;
      case "focus_vehicle_hotspot":
        set({ activeHotspot: action.hotspot });
        break;
      case "set_whatif":
        set((s) => ({ whatIf: { ...s.whatIf, [action.control]: action.value } }));
        break;
      case "open_move":
        set({ openMove: action.moveType });
        break;
    }
  },
}));
