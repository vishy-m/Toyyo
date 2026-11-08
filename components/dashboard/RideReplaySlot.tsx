"use client";

// Large overlay that hosts task 04's <RideReplay/> whenever useUiStore.replay is set
// (from a Replay button, an insight link, or the agent's open_trip_replay action).

import { spring, transition as motionTransition, useShouldReduceMotion, useTempoTransition } from "@animate-ui/react/utils/motion";
import { X } from "lucide-react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ToyyoLoadingState } from "@/components/branding/ToyyoLoadingState";
import { getTrip } from "@/lib/client/api";
import { useMounted } from "@/lib/client/hooks";
import { useDataStore } from "@/lib/client/data-store";
import { useUiStore } from "@/lib/client/ui-store";
import type { Trip } from "@/lib/types";

function ReplayLoading({ label = "Loading the 3D map…" }: { label?: string }) {
  return (
    <div className="grid h-full w-full place-items-center">
      <ToyyoLoadingState label={label} />
    </div>
  );
}

const RideReplay = dynamic(() => import("@/components/map/RideReplay"), {
  ssr: false,
  loading: () => <ReplayLoading />,
});

export function RideReplaySlot() {
  const replay = useUiStore((s) => s.replay);
  const openReplay = useUiStore((s) => s.openReplay);
  const reduced = useShouldReduceMotion();
  const dialog = useTempoTransition(spring.dialog);
  const fade = useTempoTransition(motionTransition.dialogFade);
  const dismiss = useTempoTransition(motionTransition.dismiss);
  const resting = "translateY(0px) scale(1)";
  const hidden = { opacity: 0, transform: reduced ? resting : "translateY(16px) scale(0.98)" };
  const personaId = useUiStore((s) => s.personaId);
  const paint = useDataStore((s) => s.dashboards[personaId]?.persona.vehicle.paintHex);
  const [loaded, setLoaded] = useState<{ id: string; trip?: Trip; error?: string } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const tripId = replay?.tripId;
  const mounted = useMounted();
  const current = loaded && loaded.id === tripId ? loaded : null;
  const trip = current?.trip ?? null;
  const error = current?.error ?? null;

  useEffect(() => {
    if (!tripId) return;
    let alive = true;
    getTrip(tripId)
      .then((t) => alive && setLoaded({ id: tripId, trip: t }))
      .catch((e) => alive && setLoaded({ id: tripId, error: e instanceof Error ? e.message : "Trip not found" }));
    return () => {
      alive = false;
    };
  }, [tripId]);

  useEffect(() => {
    if (!tripId || !mounted) return;
    const prev = document.activeElement as HTMLElement | null;
    const root = dialogRef.current;
    root?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") openReplay(null);
      if (e.key !== "Tab" || !root) return;
      const controls = Array.from(root.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'))
        .filter((el) => el.tabIndex >= 0 && !el.matches(":disabled") && !el.closest("[inert]") && el.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) {
        e.preventDefault();
        root.focus();
      } else if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === root)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const ov = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = ov;
      prev?.focus?.();
    };
  }, [tripId, openReplay, mounted]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {replay && (
        <ReplayOverlay
          dialogRef={dialogRef}
          label={trip ? `Trip replay: ${trip.destinationLabel}` : "Trip replay"}
        >
          <motion.div
            className="glass-strong relative h-full w-full overflow-hidden sm:rounded-xl"
            initial={hidden}
            animate={{ opacity: 1, transform: resting, transition: { ...dialog, opacity: fade } }}
            exit={{ ...hidden, transition: dismiss }}
          >
            {error ? (
              <div className="grid h-full place-items-center p-6 text-center">
                <div>
                  <p className="text-ink">This trip couldn&apos;t be loaded ({error}).</p>
                  <button ref={closeRef} type="button" onClick={() => openReplay(null)} className="mt-4 rounded-lg border border-line-2 px-4 py-2 text-sm text-ink">
                    Back to dashboard
                  </button>
                </div>
              </div>
            ) : trip ? (
              <RideReplay trip={trip} onClose={() => openReplay(null)} paintHex={paint} className="h-full w-full" />
            ) : (
              <ReplayLoading label="Loading trip…" />
            )}
            {!trip && (
              <button
                type="button"
                onClick={() => openReplay(null)}
                aria-label="Close replay"
                className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-lg text-ink-2 hover:bg-[var(--glass-hi)] hover:text-ink"
              >
                <X size={18} />
              </button>
            )}
          </motion.div>
        </ReplayOverlay>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function ReplayOverlay({ children, dialogRef, label }: { children: ReactNode; dialogRef: RefObject<HTMLDivElement | null>; label: string }) {
  const present = useIsPresent();
  const overlay = useTempoTransition(motionTransition.overlay);
  return (
    <motion.div
      ref={dialogRef}
      tabIndex={-1}
      inert={!present}
      className="fixed inset-0 z-[55] p-0 outline-none sm:p-4 lg:p-6"
      initial={{ backgroundColor: "rgb(0 0 0 / 0)", backdropFilter: "blur(0px)" }}
      animate={{ backgroundColor: "rgb(0 0 0 / 0.6)", backdropFilter: "blur(8px)", transition: overlay }}
      exit={{ backgroundColor: "rgb(0 0 0 / 0)", backdropFilter: "blur(0px)", transition: overlay }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      {children}
    </motion.div>
  );
}
