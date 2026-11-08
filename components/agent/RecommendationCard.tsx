"use client";

import { blur, transition as motionTransition, useTempoTransition } from "@animate-ui/react/utils/motion";
import clsx from "clsx";
import { Check, Info, Pencil, X } from "lucide-react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { moveIcon } from "@/components/dashboard/MoveTiles";
import { useDataStore } from "@/lib/client/data-store";
import { prettyDates } from "@/lib/client/format";
import { useOverlayStore } from "@/lib/client/overlay-store";
import { useUiStore } from "@/lib/client/ui-store";
import type { DismissReason, Recommendation } from "@/lib/types";

const REASONS: { id: DismissReason; label: string }[] = [
  { id: "too-expensive", label: "Too expensive" },
  { id: "not-now", label: "Not now" },
  { id: "not-relevant", label: "Not relevant" },
  { id: "already-done", label: "Already done" },
];

const CardControls = forwardRef<HTMLDivElement, {
  reasons: boolean;
  children: React.ReactNode;
}>(function CardControls({ reasons, children }, forwardedRef) {
  const ref = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwardedRef, () => ref.current!);
  const present = useIsPresent();
  const disclosure = useTempoTransition(motionTransition.disclosure);
  const fade = useTempoTransition(motionTransition.fade);
  useLayoutEffect(() => {
    const content = ref.current;
    if (!content) return;
    if (!present && content.contains(document.activeElement)) content.closest("article")?.focus({ preventScroll: true });
    content.inert = !present;
  }, [present]);
  return (
    <motion.div
      ref={ref}
      data-card-controls={reasons ? "reasons" : "actions"}
      initial={reasons ? { opacity: 0, height: 0, filter: blur.disclosure } : { opacity: 0 }}
      animate={reasons
        ? { opacity: 1, height: "auto", filter: "blur(0px)", transition: disclosure, transitionEnd: { filter: "none" } }
        : { opacity: 1, transition: fade }}
      exit={reasons
        ? { opacity: 0, height: 0, filter: blur.disclosure, transition: disclosure }
        : { opacity: 0, transition: fade }}
      className={reasons ? "overflow-hidden" : "mt-3.5 flex flex-wrap items-center gap-1"}
    >
      {children}
    </motion.div>
  );
});

export function RecommendationCard({ rec, primary }: { rec: Recommendation; primary: boolean }) {
  const personaId = useUiStore((s) => s.personaId);
  const askAgent = useUiStore((s) => s.askAgent);
  const dismiss = useDataStore((s) => s.dismiss);
  const setDraft = useDataStore((s) => s.setDraftInput);
  const openWhy = useOverlayStore((s) => s.openWhy);
  const openAccept = useOverlayStore((s) => s.openAccept);
  const [dismissing, setDismissing] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const previousDismissing = useRef(dismissing);
  useLayoutEffect(() => {
    if (previousDismissing.current === dismissing) return;
    previousDismissing.current = dismissing;
    const selector = dismissing ? '[data-card-controls="reasons"] button' : '[data-dismiss-trigger]';
    articleRef.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  }, [dismissing]);
  const Icon = moveIcon[rec.moveType];
  const accepted = rec.status === "accepted";

  if (accepted) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-line px-4 py-3">
        <span className="grid size-7 place-items-center rounded-full bg-good text-bg">
          <Check size={15} strokeWidth={3} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-ink">{rec.title}</div>
          <div className="text-xs text-ink-3">Accepted. See Next steps below.</div>
        </div>
      </div>
    );
  }

  return (
    <article
      ref={articleRef}
      tabIndex={-1}
      className={clsx("relative rounded-xl border p-4", primary ? "glow-accent border-transparent bg-[var(--glass)]" : "border-line bg-[var(--glass)]")}
      aria-label={rec.title}
      data-move={rec.moveType}
    >
      <div className="flex items-start gap-3">
        <span className={clsx("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", primary ? "bg-accent-soft text-accent-ink" : "border border-line text-ink-2")}>
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] leading-snug font-semibold text-ink">{rec.title}</h3>
          <p className="mt-1 text-[13px] leading-snug text-ink-2">{rec.action}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Chip tone="good">{rec.impactLabel}</Chip>
            {rec.urgencyLabel && <Chip tone="warn">{prettyDates(rec.urgencyLabel)}</Chip>}
          </div>
        </div>
      </div>

      <AnimatePresence initial={false} mode="popLayout">
        {dismissing ? (
          <CardControls key="reasons" reasons>
            <div className="mt-3.5 border-t border-line pt-3">
              <p id={`dismiss-${rec.id}`} className="mb-2 text-xs text-ink-3">
                Why are you dismissing this? It helps Toyyo learn.
              </p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`dismiss-${rec.id}`}>
                {REASONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => void dismiss(personaId, rec.optionId, r.id)}
                    className="h-8 rounded-full border border-line-2 px-3 text-[13px] font-medium text-ink transition-colors duration-200 ease-ui-color hover:bg-[var(--glass-hi)]"
                  >
                    {r.label}
                  </button>
                ))}
                <button type="button" onClick={() => setDismissing(false)} className="h-8 rounded-full px-3 text-[13px] text-ink-3 hover:text-ink">
                  Cancel
                </button>
              </div>
            </div>
          </CardControls>
        ) : (
          <CardControls key="actions" reasons={false}>
            <Button size="sm" variant={primary ? "primary" : "solid"} onClick={() => openAccept(rec.optionId)} className="mr-1">
              Accept
            </Button>
            <Button size="sm" variant="ghost" onClick={() => openWhy(rec.optionId)}>
              <Info size={14} />
              Why?
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                askAgent({ widget: "recommendation", optionId: rec.optionId });
                setDraft(`Adjust this: ${rec.title}. `);
              }}
            >
              <Pencil size={13} />
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissing(true)} data-dismiss-trigger aria-label={`Dismiss ${rec.title}`} className="ml-auto">
              <X size={14} />
              Dismiss
            </Button>
          </CardControls>
        )}
      </AnimatePresence>
    </article>
  );
}
