"use client";

// Which dialog is open (Why panel, Accept flow, consent sheet). Shared by dashboard + agent panel.
import { create } from "zustand";

interface OverlayState {
  whyOptionId: string | null;
  acceptOptionId: string | null;
  consentOpen: boolean;
  openWhy: (id: string | null) => void;
  openAccept: (id: string | null) => void;
  setConsentOpen: (v: boolean) => void;
}

export const useOverlayStore = create<OverlayState>((set) => ({
  whyOptionId: null,
  acceptOptionId: null,
  consentOpen: false,
  openWhy: (whyOptionId) => set({ whyOptionId }),
  openAccept: (acceptOptionId) => set({ acceptOptionId }),
  setConsentOpen: (consentOpen) => set({ consentOpen }),
}));
