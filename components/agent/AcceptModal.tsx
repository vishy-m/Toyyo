"use client";

import { blur, scale, spring, transition as motionTransition, useShouldReduceMotion, useTempoTransition } from "@animate-ui/react/utils/motion";
import { Check, Loader2, PhoneCall, UserRound } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Overlay";
import { findOption, useDataStore } from "@/lib/client/data-store";
import { consentLabel, shortDate, usd } from "@/lib/client/format";
import { useOverlayStore } from "@/lib/client/overlay-store";
import type { ConsentSource, DashboardData, HandoffPacket } from "@/lib/types";

type Phase = { kind: "confirm" } | { kind: "sending"; mode: HandoffPacket["mode"] } | { kind: "done"; mode: HandoffPacket["mode"]; packet?: HandoffPacket } | { kind: "error"; message: string };

function AcceptStep({ done = false, children }: { done?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const present = useIsPresent();
  const reveal = useTempoTransition(motionTransition.reveal);
  const fade = useTempoTransition(motionTransition.fade);
  useLayoutEffect(() => {
    const content = ref.current;
    if (!content) return;
    if (!present && content.contains(document.activeElement)) {
      // Keep focus in the dialog while the one-off success step waits to enter.
      content.closest('[role="dialog"]')?.querySelector<HTMLElement>('button[aria-label="Close"]')?.focus({ preventScroll: true });
    }
    content.inert = !present;
    if (present && done) content.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }, [present, done]);
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, filter: blur.surface }}
      animate={{ opacity: 1, filter: "blur(0px)", transition: reveal, transitionEnd: { filter: "none" } }}
      exit={{ opacity: 0, filter: blur.surface, transition: fade }}
      className={done ? "text-center" : undefined}
    >
      {children}
    </motion.div>
  );
}

export function AcceptModal({ data }: { data?: DashboardData }) {
  const id = useOverlayStore((s) => s.acceptOptionId);
  const close = useOverlayStore((s) => s.openAccept);
  const accept = useDataStore((s) => s.accept);
  const reduced = useShouldReduceMotion();
  const checkPop = useTempoTransition(spring.checkPop);
  const [phaseFor, setPhaseFor] = useState<{ id: string | null; phase: Phase }>({ id: null, phase: { kind: "confirm" } });
  const phase: Phase = phaseFor.id === id ? phaseFor.phase : { kind: "confirm" };
  const setPhase = (p: Phase) => setPhaseFor({ id, phase: p });
  const o = id ? findOption(data, id) : undefined;

  if (!data) return null;
  const consented = (Object.keys(data.persona.consent) as ConsentSource[]).filter((k) => data.persona.consent[k]);

  const go = async (mode: HandoffPacket["mode"]) => {
    if (!o) return;
    setPhase({ kind: "sending", mode });
    try {
      const packet = await accept(data.persona.id, o, mode);
      setPhase({ kind: "done", mode, packet });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : "Something went wrong" });
    }
  };

  return (
    <Modal open={!!o} onClose={() => close(null)} labelledBy="accept-title">
      <span role="status" className="sr-only">
        {o && phase.kind === "done" ? (phase.mode === "specialist-callback" ? "A specialist will call you" : "You're all set") : ""}
      </span>
      <AnimatePresence mode="wait" initial={false}>
      {o && phase.kind !== "done" && (
        <AcceptStep key="confirm">
          <p className="text-sm text-ink-3">Confirm your move</p>
          <h2 id="accept-title" className="font-display mt-1 text-2xl text-ink">
            {o.title}
          </h2>
          <dl className="mt-5 space-y-3 rounded-lg border border-line p-4 text-sm">
            <div>
              <dt className="text-xs text-ink-3">What happens</dt>
              <dd className="mt-0.5 text-ink">{o.summary}</dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {o.monthlyCost != null && (
                <div>
                  <dt className="text-xs text-ink-3">Monthly</dt>
                  <dd className="num mt-0.5 font-semibold text-ink">{usd(o.monthlyCost)}/mo</dd>
                </div>
              )}
              {o.totalCost != null && (
                <div>
                  <dt className="text-xs text-ink-3">Total today</dt>
                  <dd className="num mt-0.5 font-semibold text-ink">{usd(o.totalCost)}</dd>
                </div>
              )}
              {(o.savingsVsBaseline ?? 0) > 0 && (
                <div>
                  <dt className="text-xs text-ink-3">Saves</dt>
                  <dd className="num mt-0.5 font-semibold text-good">{usd(o.savingsVsBaseline!)}</dd>
                </div>
              )}
              {o.deadline && (
                <div>
                  <dt className="text-xs text-ink-3">Decide by</dt>
                  <dd className="mt-0.5 font-semibold text-ink">{shortDate(o.deadline)}</dd>
                </div>
              )}
            </div>
            <div>
              <dt className="text-xs text-ink-3">Shared with TFS</dt>
              <dd className="mt-0.5 text-ink-2">{consented.length ? consented.map((c) => consentLabel[c]).join(", ") : "Contract details only"}</dd>
            </div>
          </dl>
          {phase.kind === "error" && (
            <p role="alert" className="mt-3 text-sm text-warn">
              That didn&apos;t go through ({phase.message}). Try again.
            </p>
          )}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
            <Button variant="primary" size="lg" className="flex-1" disabled={phase.kind === "sending"} onClick={() => void go("self-service")} data-autofocus>
              {phase.kind === "sending" && phase.mode === "self-service" ? <Loader2 size={16} className="animate-spin" /> : <UserRound size={16} />}
              {o.highStakes ? "Do it myself" : "Confirm (simulated)"}
            </Button>
            <Button variant="outline" size="lg" className="flex-1" disabled={phase.kind === "sending"} onClick={() => void go("specialist-callback")}>
              {phase.kind === "sending" && phase.mode === "specialist-callback" ? <Loader2 size={16} className="animate-spin" /> : <PhoneCall size={16} />}
              {o.highStakes ? "Have a specialist call me" : "Talk to a specialist"}
            </Button>
          </div>
          <p className="mt-4 text-center text-xs text-ink-3">
            {o.highStakes ? "Big decision: a person is always one tap away. " : ""}Simulated. No money moves in this prototype.
          </p>
        </AcceptStep>
      )}
      {o && phase.kind === "done" && (
        <AcceptStep key="done" done>
          <motion.div
            initial={{ transform: `scale(${reduced ? 1 : scale.icon})`, opacity: 0, filter: blur.icon }}
            animate={{ transform: "scale(1)", opacity: 1, filter: "blur(0px)", transition: checkPop, transitionEnd: { filter: "none" } }}
            className="mx-auto grid size-16 place-items-center rounded-full bg-good text-bg"
          >
            <Check size={30} strokeWidth={3} />
          </motion.div>
          <h2 id="accept-title" tabIndex={-1} className="font-display mt-5 text-2xl text-ink">
            {phase.mode === "specialist-callback" ? "A specialist will call you" : "You're all set"}
          </h2>
          <p className="mx-auto mt-2 max-w-[36ch] text-sm text-ink-2">
            {phase.mode === "specialist-callback"
              ? "They'll already have your numbers and preferences, so you won't have to repeat yourself."
              : `We've started “${o.title}”. You'll get a confirmation with next steps.`}
          </p>
          <ol className="mx-auto mt-5 max-w-[320px] space-y-2 text-left text-sm text-ink-2">
            <li className="flex gap-2.5">
              <Check size={16} className="mt-0.5 shrink-0 text-good" /> Handoff packet created{phase.packet ? `, reference #${phase.packet.id.slice(0, 8)}` : ""}
            </li>
            <li className="flex gap-2.5">
              <Check size={16} className="mt-0.5 shrink-0 text-good" /> Added to your Next steps
            </li>
          </ol>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button variant="solid" size="lg" className="flex-1" onClick={() => close(null)} data-autofocus>
              Done
            </Button>
            <Link href="/tfs" className="inline-flex h-12 flex-1 items-center justify-center rounded-lg border border-line-2 text-[15px] font-medium text-ink hover:bg-[var(--glass-hi)]" onClick={() => close(null)}>
              See it in the TFS view
            </Link>
          </div>
        </AcceptStep>
      )}
      </AnimatePresence>
    </Modal>
  );
}
