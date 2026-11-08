"use client";

import { blur, scale, spring, transition as motionTransition, useShouldReduceMotion, useTempoTransition } from "@animate-ui/react/utils/motion";
import clsx from "clsx";
import { Bell, Check, ChevronDown, FileText, MessageSquareText, PhoneCall, X } from "lucide-react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import Image from "next/image";
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { Drawer } from "@/components/ui/Overlay";
import { Segmented } from "@/components/ui/Segmented";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDataStore } from "@/lib/client/data-store";
import { useMinWidth } from "@/lib/client/hooks";
import { useUiStore } from "@/lib/client/ui-store";
import type { DashboardData, Draft, Preferences } from "@/lib/types";
import { ChatInput, ChatThread } from "./Chat";
import { Markdown } from "./Markdown";
import { RecommendationCard } from "./RecommendationCard";

function ToyyoMascot({ size = "md", count }: { size?: "sm" | "md"; count?: number }) {
  return (
    <span className={clsx("relative grid shrink-0 place-items-center overflow-hidden rounded-lg bg-black", size === "sm" ? "size-9" : "size-10")}>
      <Image src="/toyyo-agent.png" alt="Toyyo mascot" fill sizes={size === "sm" ? "36px" : "40px"} className="scale-[1.55] object-cover" />
      {count != null && count > 0 && <span className="num absolute -top-1.5 -right-1.5 z-10 grid size-5 place-items-center rounded-full bg-accent text-[11px] font-semibold text-white">{count}</span>}
    </span>
  );
}

function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <h2 tabIndex={-1} className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-ink-2">
      {children}
      {count != null && count > 0 && <span className="num rounded-full bg-[var(--glass-hi)] px-1.5 text-[11px] text-ink-3">{count}</span>}
    </h2>
  );
}

// Presence also covers removals delivered by the store, not just a close-button click.
const ListItem = forwardRef<HTMLLIElement, {
  children: React.ReactNode;
  chip?: boolean;
  className?: string;
  title?: string;
}>(function ListItem({ children, chip = false, ...props }, forwardedRef) {
  const ref = useRef<HTMLLIElement>(null);
  useImperativeHandle(forwardedRef, () => ref.current!);
  const present = useIsPresent();
  const reflow = useTempoTransition(spring.reflow);
  const pop = useTempoTransition(spring.pop);
  const fade = useTempoTransition(motionTransition.fade);
  const popOut = useTempoTransition(motionTransition.popOut);

  useLayoutEffect(() => {
    const item = ref.current;
    if (!item) return;
    if (!present && item.contains(document.activeElement)) {
      const siblings = Array.from(item.parentElement?.children ?? []);
      const index = siblings.indexOf(item);
      const neighbor = [...siblings.slice(index + 1), ...siblings.slice(0, index).reverse()]
        .find((element) => element.getAttribute("data-present") === "true");
      (neighbor?.querySelector<HTMLElement>("button:not(:disabled), a[href], input") ??
        item.closest("section")?.querySelector<HTMLElement>("h2"))?.focus({ preventScroll: true });
    }
    item.inert = !present;
  }, [present]);

  return (
    <motion.li
      {...props}
      ref={ref}
      data-present={present}
      layout="position"
      initial={chip ? { opacity: 0, scale: scale.icon } : { opacity: 0, y: 8 }}
      animate={chip
        ? { opacity: 1, scale: 1, transition: { ...pop, layout: reflow } }
        : { opacity: 1, y: 0, transition: { ...reflow, opacity: fade } }}
      exit={{ opacity: 0, scale: chip ? scale.icon : 0.96, transition: chip ? popOut : fade }}
      transition={reflow}
    >
      {children}
    </motion.li>
  );
});

function DraftContent({ body }: { body: string }) {
  const present = useIsPresent();
  const ref = useRef<HTMLDivElement>(null);
  const disclosure = useTempoTransition(motionTransition.disclosure);
  useLayoutEffect(() => {
    const content = ref.current;
    if (!content) return;
    if (!present && content.contains(document.activeElement)) {
      content.closest("li")?.querySelector("button")?.focus({ preventScroll: true });
    }
    content.inert = !present;
  }, [present]);
  return (
    <motion.div
      ref={ref}
      initial={{ height: 0, opacity: 0, filter: blur.disclosure }}
      animate={{ height: "auto", opacity: 1, filter: "blur(0px)", transition: disclosure, transitionEnd: { filter: "none" } }}
      exit={{ height: 0, opacity: 0, filter: blur.disclosure, transition: disclosure }}
      className="overflow-hidden"
    >
      <Markdown text={body} className="px-3.5 pb-3 text-[13px] leading-relaxed text-ink-2" />
    </motion.div>
  );
}

const draftIcon: Record<Draft["type"], typeof FileText> = {
  comparison: FileText,
  message: MessageSquareText,
  reminder: Bell,
  plan: FileText,
};

function DraftItem({ d }: { d: Draft }) {
  const [open, setOpen] = useState(false);
  const Icon = draftIcon[d.type];
  return (
    <li className="rounded-lg border border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left hover:bg-[var(--glass-hi)]"
      >
        <Icon size={15} className="shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{d.title}</span>
        <span className="text-[11px] text-ink-3 capitalize">{d.type}</span>
        <ChevronDown size={14} className={clsx("shrink-0 text-ink-3 transition-transform duration-350 ease-ui-soft motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <DraftContent body={d.body} />
        )}
      </AnimatePresence>
    </li>
  );
}

function StyleControls({ data }: { data?: DashboardData }) {
  const setStyle = useDataStore((s) => s.setStyle);
  if (!data) return null;
  return (
    <Segmented<Preferences["detailLevel"]>
      size="sm"
      label="Explanation detail"
      value={data.preferences.detailLevel}
      onChange={(v) => void setStyle(data.persona.id, { detailLevel: v })}
      options={[
        { value: "brief", label: "Brief" },
        { value: "standard", label: "Standard" },
        { value: "show-math", label: "Show math" },
      ]}
    />
  );
}

function PanelBody({ data }: { data?: DashboardData }) {
  const personaId = useUiStore((s) => s.personaId);
  const agent = useDataStore((s) => s.agent[personaId]);
  const deleteLearned = useDataStore((s) => s.deleteLearned);
  const steps = useDataStore((s) => s.nextSteps).filter((n) => n.personaId === personaId);
  const recs = agent?.recommendations.filter((r) => r.status !== "dismissed") ?? [];
  const primaryId = recs.find((r) => r.status === "proposed")?.id;

  return (
    <div className="space-y-7">
        <section aria-labelledby="sec-next">
          <SectionTitle>
            <span id="sec-next">Recommendations</span>
          </SectionTitle>
          {!agent ? (
            <div className="space-y-3" aria-busy>
              <Skeleton className="h-[148px] rounded-xl" />
              <Skeleton className="h-[120px] rounded-xl" />
            </div>
          ) : (
            <>
            {recs.length === 0 && <p className="rounded-lg border border-dashed border-line-2 p-4 text-[13px] text-ink-2">
              No open recommendations. Ask a what-if below and I&apos;ll draft new ones.
            </p>}
            <ul className="relative flex flex-col gap-3">
              <AnimatePresence initial={false} mode="popLayout">
                {recs.map((r) => (
                  <ListItem key={r.id}>
                    <RecommendationCard rec={r} primary={r.id === primaryId} />
                  </ListItem>
                ))}
              </AnimatePresence>
            </ul>
            </>
          )}
        </section>

        {steps.length > 0 && (
          <section aria-labelledby="sec-steps">
            <SectionTitle count={steps.length}>
              <span id="sec-steps">Next steps</span>
            </SectionTitle>
            <ul className="space-y-2">
              {steps.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-lg bg-good-soft px-3.5 py-2.5">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-good text-bg">
                    {s.mode === "specialist-callback" ? <PhoneCall size={12} /> : <Check size={13} strokeWidth={3} />}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-ink">{s.label}</div>
                    <div className="text-xs text-ink-2">{s.mode === "specialist-callback" ? "A TFS specialist will call you within 1 business day" : "Confirmation sent (simulated)"}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {agent && agent.drafts.length > 0 && (
          <section aria-labelledby="sec-drafts">
            <SectionTitle count={agent.drafts.length}>
              <span id="sec-drafts">Drafts</span>
            </SectionTitle>
            <ul className="space-y-2">
              {agent.drafts.map((d) => (
                <DraftItem key={d.id} d={d} />
              ))}
            </ul>
          </section>
        )}

        {agent && (
          <section aria-labelledby="sec-learned">
            <SectionTitle>
              <span id="sec-learned">What I&apos;ve learned</span>
            </SectionTitle>
            {agent.learned.length === 0 && (
              <p className="text-[13px] text-ink-3">Nothing yet. Accept or dismiss a move and I&apos;ll note what you prefer.</p>
            )}
              <ul className="relative flex flex-wrap gap-1.5">
                <AnimatePresence initial={false} mode="popLayout">
                  {agent.learned.map((l) => (
                    <ListItem
                      key={l.id}
                      chip
                      className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-lg border border-line bg-[var(--glass-hi)] py-1 pr-1 pl-3 text-[13px] leading-snug text-ink"
                      title={`From ${l.source}, ${Math.round(l.confidence * 100)}% confident`}
                    >
                      {l.statement}
                      <button
                        type="button"
                        onClick={() => void deleteLearned(personaId, l.id)}
                        aria-label={`Forget: ${l.statement}`}
                        className="grid size-6 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-line hover:text-ink"
                      >
                        <X size={12} />
                      </button>
                    </ListItem>
                  ))}
                </AnimatePresence>
              </ul>
          </section>
        )}

        <section aria-labelledby="sec-chat" className="border-t border-line pt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="sec-chat" className="text-[13px] font-semibold text-ink-2">
              Chat
            </h2>
            <StyleControls data={data} />
          </div>
          <ChatThread data={data} />
        </section>
    </div>
  );
}

function PanelHeader({ data, onClose }: { data?: DashboardData; onClose?: () => void }) {
  const streaming = useDataStore((s) => s.streaming);
  return (
    <div className="flex items-center gap-3">
      <span className="relative">
        <ToyyoMascot size="sm" />
        {streaming && <span className="absolute -top-0.5 -right-0.5 size-2.5 animate-pulse rounded-full bg-accent ring-2 ring-[var(--bg)]" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-[17px] text-ink">Toyyo</div>
        <div className="truncate text-xs text-ink-3">{data ? `Answers from ${data.persona.name}’s contract and trips` : "Loading…"}</div>
      </div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Hide Toyyo" className="grid size-9 place-items-center rounded-lg text-ink-3 hover:bg-[var(--glass-hi)] hover:text-ink">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export function AgentPanel({ data }: { data?: DashboardData }) {
  const desktop = useMinWidth(1024);
  const open = useUiStore((s) => s.agentPanelOpen);
  const setOpen = useUiStore((s) => s.setAgentPanelOpen);
  const personaId = useUiStore((s) => s.personaId);
  const recCount = useDataStore((s) => s.agent[personaId]?.recommendations.filter((r) => r.status === "proposed").length ?? 0);
  const reduced = useShouldReduceMotion();
  const toast = useTempoTransition(spring.toast);
  const press = useTempoTransition(spring.press);
  const sheet = useTempoTransition(motionTransition.sheet);
  const dismiss = useTempoTransition(motionTransition.dismiss);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const launcherHidden = { opacity: 0, transform: `translateY(${reduced ? 0 : 16}px)` };
  const panelHidden = { opacity: 0, transform: reduced ? "translateX(calc(0% + 0px))" : "translateX(calc(100% + 16px))" };

  // Focus moves with the panel when the user opens or closes it, never on page load (the panel starts
  // open on desktop, and taking focus then would steal it from the page).
  const lastOpen = useRef(open);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const launcher = launcherRef.current;
    const toggled = lastOpen.current !== open;
    lastOpen.current = open;
    if (toggled && desktop && open) (panel?.querySelector<HTMLElement>("textarea") ?? panel?.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
    else if (toggled && panel?.contains(document.activeElement)) launcher?.focus({ preventScroll: true });
    if (panel) panel.inert = !open;
    if (launcher) launcher.inert = open;
  }, [desktop, open]);

  // On phones/tablets the panel is a bottom sheet: start closed so the dashboard shows first.
  useEffect(() => {
    if (!window.matchMedia("(min-width: 1024px)").matches) setOpen(false);
  }, [setOpen]);

  if (!desktop) {
    return (
      <>
        <AnimatePresence>
          {!open && (
            <motion.div
              initial={launcherHidden}
              animate={{ opacity: 1, transform: "translateY(0px)", transition: toast }}
              exit={{ ...launcherHidden, transition: dismiss }}
              className="fixed right-4 bottom-4 z-40"
            >
            <motion.button
              type="button"
              onClick={() => setOpen(true)}
              ref={launcherRef}
              initial={{ transform: "scale(1)" }}
              whileTap={{ transform: `scale(${reduced ? 1 : scale.press})`, transition: press }}
              transition={press}
              className="glass-strong flex h-14 items-center gap-3 rounded-lg p-2 sm:pr-5"
              aria-label="Open Toyyo"
            >
              <ToyyoMascot count={recCount} />
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-semibold text-ink">Toyyo</span>
                <span className="block text-xs text-ink-3">{recCount ? `${recCount} recommendations` : "Ask about your car or contract"}</span>
              </span>
            </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
        <Drawer open={open} onClose={() => setOpen(false)} title="Toyyo" subtitle={data ? `Drafted for ${data.persona.name}` : undefined} labelledBy="toyyo-sheet-title" footer={<ChatInput />}>
          <PanelBody key={data?.persona.id ?? "loading"} data={data} />
        </Drawer>
      </>
    );
  }

  // Desktop: a floating button, and a panel that slides over the stage from the right.
  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.div
            key="copilot-fab"
            initial={launcherHidden}
            animate={{ opacity: 1, transform: "translateY(0px)", transition: toast }}
            exit={{ ...launcherHidden, transition: dismiss }}
            className="fixed right-6 bottom-6 z-40"
          >
          <motion.button
            type="button"
            onClick={() => setOpen(true)}
            ref={launcherRef}
            initial={{ transform: "scale(1)" }}
            whileTap={{ transform: `scale(${reduced ? 1 : scale.press})`, transition: press }}
            transition={press}
            className="glass-strong flex h-14 items-center gap-3 rounded-lg py-2 pr-5 pl-2 transition-colors duration-200 ease-ui-color hover:border-ink-3"
            aria-label="Open Toyyo"
          >
            <ToyyoMascot count={recCount} />
            <span className="text-left">
              <span className="block text-sm font-semibold text-ink">Toyyo</span>
              <span className="block text-xs text-ink-3">{recCount ? `${recCount} recommendations` : "Ask about your car or contract"}</span>
            </span>
          </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <motion.aside
            key="copilot-panel"
            aria-label="Toyyo"
            ref={panelRef}
            initial={panelHidden}
            animate={{ transform: "translateX(calc(0% + 0px))", opacity: 1, transition: sheet }}
            exit={{ ...panelHidden, transition: dismiss }}
            className="glass-strong fixed top-[calc(var(--hdr)+12px)] right-4 bottom-4 z-40 flex w-[420px] flex-col overflow-hidden rounded-xl"
          >
            <div className="border-b border-line px-5 py-4">
              <PanelHeader data={data} onClose={() => setOpen(false)} />
            </div>
            <div data-scroll className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <PanelBody key={data?.persona.id ?? "loading"} data={data} />
            </div>
            <div className="border-t border-line px-4 py-3.5">
              <ChatInput />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
