"use client";

import { transition as motionTransition, useShouldReduceMotion, useTempoTransition } from "@animate-ui/react/utils/motion";
import { usePageVisible } from "@animate-ui/react/utils/use-page-visible";
import clsx from "clsx";
import { ArrowUp, Check, CircleAlert, CornerDownRight, Loader2, Square, X } from "lucide-react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useRef } from "react";
import { useDataStore, type ChatMessage } from "@/lib/client/data-store";
import { moveLabel, toolLabel } from "@/lib/client/format";
import { useUiStore } from "@/lib/client/ui-store";
import type { DashboardData, UiAction } from "@/lib/types";
import { Markdown } from "./Markdown";

function actionText(a: UiAction) {
  switch (a.kind) {
    case "open_trip_replay":
      return "Opened a trip replay";
    case "focus_vehicle_hotspot":
      return `Pointed to the ${a.hotspot.replace("-", " ")} on your car`;
    case "set_whatif":
      return `Moved the “${{ monthlyMiles: "miles per month", monthsAhead: "look ahead", extraPrincipal: "extra principal", paymentDueDay: "due day", scoreImprovement: "score improvement" }[a.control]}” slider to ${a.value.toLocaleString()}`;
    case "open_move":
      return `Opened ${moveLabel[a.moveType]} details`;
  }
}

function suggestions(d?: DashboardData) {
  if (!d) return [];
  const s: string[] = [];
  if (d.persona.contract.kind === "lease") s.push("What if I drive less for the next few months?", "Compare my lease-end options");
  else s.push("Can I lower my monthly payment?");
  if (d.persona.consent.driving) s.push("Show the trip that hurt my score most");
  s.push("Keep explanations short");
  return s.slice(0, 4);
}

function ThinkingIndicator() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const visible = usePageVisible();
  return (
    <div ref={ref} className="flex gap-1 py-1" aria-label="Toyyo is thinking">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-ink-3"
          animate={{ opacity: inView && visible ? [0.3, 1, 0.3] : 1 }}
          transition={inView && visible
            ? { duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }
            : motionTransition.instant}
        />
      ))}
    </div>
  );
}

function AgentMessage({ m }: { m: ChatMessage }) {
  return (
    <div className="space-y-2">
      {m.tools.length > 0 && (
        <ul className="space-y-1" aria-label="Toyyo activity">
          {m.tools.map((t, i) => (
            <li key={`${t.name}-${i}`} className="flex items-center gap-2 text-xs text-ink-3">
              {t.status === "start" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} className="text-good" />}
              {toolLabel[t.name] ?? t.name.replace(/_/g, " ")}
              {t.status === "start" ? "…" : ""}
            </li>
          ))}
          {/* Text is held server-side until grounding passes, so fill the quiet gap after tools finish. */}
          {m.streaming && !m.text && m.tools.every((t) => t.status === "done") && (
            <li className="flex items-center gap-2 text-xs text-ink-3">
              <Loader2 size={12} className="animate-spin" />
              Checking the numbers…
            </li>
          )}
        </ul>
      )}
      {m.text ? (
        <Markdown text={m.text} className="text-[14px] leading-relaxed text-ink-2" />
      ) : m.streaming && m.tools.length === 0 ? (
        <ThinkingIndicator />
      ) : null}
      {m.actions.map((a, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-ink-3">
          <CornerDownRight size={12} className="text-ink-3" />
          {actionText(a)}
        </div>
      ))}
      {m.drafts.map((d) => (
        <div key={d.id} className="rounded-lg border border-line p-3">
          <div className="mb-1 text-xs font-medium text-ink-3">Draft: {d.title}</div>
          <Markdown text={d.body} className="text-[13px] text-ink-2" />
        </div>
      ))}
      {m.learned.map((l) => (
        <div key={l.id} className="text-xs text-ink-3">
          Learned: <span className="text-ink-2">{l.statement}</span>
        </div>
      ))}
      {m.error &&
        (m.text || m.tools.length ? (
          <div className="flex items-start gap-2 text-xs text-ink-3">
            <CircleAlert size={13} className="mt-px shrink-0" />
            {m.error}
          </div>
        ) : (
          <div role="alert" className="flex items-start gap-2 text-xs text-warn">
            <CircleAlert size={13} className="mt-px shrink-0" />
            {m.error.replace(/\.$/, "")}. Try asking again.
          </div>
        ))}
    </div>
  );
}

export function ChatThread({ data }: { data?: DashboardData }) {
  const personaId = useUiStore((s) => s.personaId);
  const messages = useDataStore((s) => s.chat[personaId]);
  const send = useDataStore((s) => s.send);
  const streaming = useDataStore((s) => s.streaming);
  const endRef = useRef<HTMLDivElement>(null);
  const reduced = useShouldReduceMotion();
  const reveal = useTempoTransition(motionTransition.reveal);

  // Scroll only the panel's own scroller (never the page) as the reply streams in.
  useEffect(() => {
    if (!messages?.length) return;
    const sc = endRef.current?.closest<HTMLElement>("[data-scroll]");
    sc?.scrollTo({ top: sc.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [messages, reduced]);

  const ctx = useUiStore((s) => s.agentContext);
  return (
    <div className="space-y-4" aria-live="polite" aria-busy={streaming}>
      <AnimatePresence initial={false}>
        {(messages ?? []).map((m) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: reveal }}
            className={m.role === "user" ? "flex justify-end" : undefined}
          >
            {m.role === "user" ? (
              <div className="max-w-[85%] rounded-lg rounded-br-md bg-ink px-3.5 py-2 text-[14px] text-bg">{m.text}</div>
            ) : (
              <AgentMessage m={m} />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
      {!streaming && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions(data).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void send(personaId, s, ctx)}
              className="rounded-full border border-line px-3 py-1.5 text-left text-[13px] text-ink-2 transition-colors duration-200 ease-ui-color hover:border-line-2 hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

export function ChatInput() {
  const personaId = useUiStore((s) => s.personaId);
  const ctx = useUiStore((s) => s.agentContext);
  const clearCtx = () => useUiStore.setState({ agentContext: null });
  const value = useDataStore((s) => s.draftInput);
  const setValue = useDataStore((s) => s.setDraftInput);
  const send = useDataStore((s) => s.send);
  const stop = useDataStore((s) => s.stop);
  const streaming = useDataStore((s) => s.streaming);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Focus the input when an "Ask"/"Edit" prefill arrives.
  useEffect(() => {
    if (value && ref.current && document.activeElement !== ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(value.length, value.length);
    }
  }, [value, ctx]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(140, el.scrollHeight)}px`;
  }, [value]);

  const submit = () => {
    const v = value.trim();
    if (!v || streaming) return;
    setValue("");
    void send(personaId, v, ctx);
  };

  const ctxLabel = ctx?.widget
    ? ({ "next-move": "Your next move", contract: "Contract", money: "Money", driving: "Driving life", recommendation: "This recommendation" } as Record<string, string>)[ctx.widget] ??
      (ctx.widget in moveLabel ? moveLabel[ctx.widget as keyof typeof moveLabel] : ctx.widget)
    : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-2"
    >
      {ctxLabel && (
        <div className="flex items-center gap-1.5 text-xs text-ink-3">
          Asking about
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--glass-hi)] py-0.5 pr-1 pl-2 text-ink-2">
            {ctxLabel}
            <button type="button" onClick={clearCtx} aria-label="Clear context" className="grid size-4 place-items-center rounded-full hover:bg-line">
              <X size={10} />
            </button>
          </span>
        </div>
      )}
      <div className="flex items-end gap-2 rounded-lg border border-line-2 bg-[var(--glass-hi)] p-1.5 pl-3.5 focus-within:border-ink-3">
        <label htmlFor="agent-input" className="sr-only">
          Ask Toyyo
        </label>
        <textarea
          id="agent-input"
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask about your car, lease or payments…"
          className="min-h-9 flex-1 resize-none bg-transparent py-2 text-[14px] text-ink outline-none placeholder:text-ink-3"
          style={{ outline: "none" }}
        />
        <button
          type={streaming ? "button" : "submit"}
          onClick={streaming ? stop : undefined}
          aria-label={streaming ? "Stop" : "Send"}
          disabled={!streaming && !value.trim()}
          className={clsx("grid size-9 shrink-0 place-items-center rounded-lg transition-colors duration-200 ease-ui-color", streaming ? "bg-line-2 text-ink" : value.trim() ? "bg-ink text-bg" : "bg-line text-ink-3")}
        >
          {streaming ? <Square size={13} className="fill-current" /> : <ArrowUp size={16} />}
        </button>
      </div>
    </form>
  );
}
