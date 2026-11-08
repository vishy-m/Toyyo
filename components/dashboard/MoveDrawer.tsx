"use client";

import { blur, spring, transition as motionTransition, useShouldReduceMotion, useTempoTransition } from "@animate-ui/react/utils/motion";
import clsx from "clsx";
import { Bot, Info, Loader2, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Drawer } from "@/components/ui/Overlay";
import { postWhatIf } from "@/lib/client/api";
import { consentLabel, moveLabel, shortDate } from "@/lib/client/format";
import { useDebounced } from "@/lib/client/hooks";
import { leaseFacts, leaseSeries } from "@/lib/client/lease";
import { useOverlayStore } from "@/lib/client/overlay-store";
import { useUiStore } from "@/lib/client/ui-store";
import type { DashboardData, EngineResult, MoveOption, MoveType, WhatIfOverrides } from "@/lib/types";
import { bestOption } from "./MoveTiles";

const subtitles: Record<MoveType, string> = {
  "lease-end": "End of Lease Options, projected from how you actually drive.",
  insurance: "What your driving could do to your premium.",
  payment: "Ways to lower what you pay or when you pay it.",
  protection: "Coverage that fits how long you keep the car and where you drive it.",
};

/* ---------- what-if controls ---------- */

function Control({
  id,
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  agentMoved,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (n: number) => string;
  onChange: (n: number) => void;
  agentMoved: boolean;
  hint?: string;
}) {
  const swap = useTempoTransition(motionTransition.swap);
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm text-ink-2">
          {label}
        </label>
        <span className="flex items-center gap-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {agentMoved && (
              <motion.span initial={{ opacity: 0, filter: blur.icon }} animate={{ opacity: 1, filter: "blur(0px)", transition: swap }} exit={{ opacity: 0, filter: blur.icon, transition: swap }}>
                <Chip tone="accent" icon={<Bot size={12} />}>
                  Copilot set this
                </Chip>
              </motion.span>
            )}
          </AnimatePresence>
          <output htmlFor={id} className="num text-lg font-semibold text-ink">
            {format(value)}
          </output>
        </span>
      </div>
      <input
        id={id}
        type="range"
        className={clsx("range mt-1", agentMoved && "agent-moved")}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--fill" as string]: `${fill}%` }}
        aria-valuetext={format(value)}
      />
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

/** Tracks which what-if keys changed without a local slider touch (i.e. the agent moved them). */
function useAgentMoved(whatIf: WhatIfOverrides) {
  const local = useRef<WhatIfOverrides>({});
  const [moved, setMoved] = useState<Partial<Record<keyof WhatIfOverrides, number>>>({});
  useEffect(() => {
    const changed = (Object.keys(whatIf) as (keyof WhatIfOverrides)[]).filter((k) => whatIf[k] !== undefined && whatIf[k] !== local.current[k]);
    if (!changed.length) return;
    const stamp = Date.now();
    setMoved((m) => ({ ...m, ...Object.fromEntries(changed.map((k) => [k, stamp])) }));
    changed.forEach((k) => (local.current[k] = whatIf[k]));
    const t = setTimeout(() => setMoved((m) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== stamp))), 4000);
    return () => clearTimeout(t);
  }, [whatIf]);
  const markLocal = (patch: WhatIfOverrides) => {
    Object.assign(local.current, patch);
    setMoved((m) => {
      const n = { ...m };
      (Object.keys(patch) as (keyof WhatIfOverrides)[]).forEach((k) => delete n[k]);
      return n;
    });
  };
  return { moved, markLocal };
}

/* ---------- lease chart ---------- */

function LeaseChart({ data, monthlyMiles, monthsAhead }: { data: DashboardData; monthlyMiles?: number; monthsAhead: number }) {
  const reduced = useShouldReduceMotion();
  // Window: last 12 months + the projection, so the crossing over the allowance is legible.
  const rows = useMemo(() => {
    const all = leaseSeries(data, monthlyMiles);
    const f0 = leaseFacts(data, monthlyMiles);
    return f0 ? all.slice(Math.max(0, f0.monthsElapsed - 12)) : all;
  }, [data, monthlyMiles]);
  const f = leaseFacts(data, monthlyMiles);
  if (!f || rows.length === 0) return null;
  const focusM = f.monthsElapsed + monthsAhead;
  const focus = rows.find((r) => r.m === focusM) ?? rows[rows.length - 1];
  const focusOdo = focus.projected ?? focus.actual ?? 0;
  const overAtFocus = focusOdo - focus.allowance;
  const minY = Math.floor(Math.min(...rows.map((r) => Math.min(r.actual ?? Infinity, r.allowance))) / 1000) * 1000;
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm text-ink-2">
          Odometer in <span className="text-ink">{focus.label.replace(" ", " ’")}</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="num text-2xl font-semibold text-ink">
            <AnimatedNumber value={focusOdo} /> <span className="text-sm font-medium text-ink-3">mi</span>
          </span>
          <span className={clsx("num text-sm font-semibold", overAtFocus > 0 ? "text-warn" : "text-good")}>
            {overAtFocus > 0 ? "+" : "−"}
            <AnimatedNumber value={Math.abs(overAtFocus)} /> vs allowance
          </span>
        </div>
      </div>
      <div className="h-[200px] sm:h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--ink-3)", fontSize: 11 }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis
              domain={[minY, (max: number) => Math.ceil((max * 1.02) / 1000) * 1000]}
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fill: "var(--ink-3)", fontSize: 11 }}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={{ background: "var(--glass-strong)", border: "1px solid var(--line-2)", borderRadius: 12, color: "var(--ink)", fontSize: 12 }}
              formatter={(v, name) => [`${Number(v).toLocaleString()} mi`, name === "allowance" ? "Allowance" : name === "actual" ? "Driven" : "Projected"]}
            />
            <Line dataKey="allowance" stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
            <Line dataKey="projected" stroke="var(--warn)" strokeWidth={2.5} strokeLinecap="round" dot={false} isAnimationActive={!reduced} animationDuration={350} connectNulls />
            <Line dataKey="actual" stroke="var(--ink)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            <ReferenceLine x={focus.label} stroke="var(--line-2)" />
            <ReferenceDot x={focus.label} y={focusOdo} r={5} fill="var(--accent)" stroke="var(--bg)" strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-ink" /> Driven
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-warn" /> Projected
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-4 border-t border-dashed border-ink-3" /> Allowance
        </span>
      </div>
    </div>
  );
}

/* ---------- option cards ---------- */

function optionHeadline(o: MoveOption, baselineId: string) {
  if (o.id === baselineId && o.totalCost != null) return { label: "Cost at turn-in", value: o.totalCost, unit: "" };
  if (o.savingsVsBaseline != null && o.savingsVsBaseline !== 0 && o.id !== baselineId)
    return { label: o.savingsVsBaseline > 0 ? (o.moveType === "insurance" ? "Saves per year" : "Saves") : "Costs more", value: Math.abs(o.savingsVsBaseline), unit: "" };
  if (o.monthlyCost != null) return { label: "Monthly", value: o.monthlyCost, unit: "/mo" };
  if (o.totalCost != null) return { label: "Total", value: o.totalCost, unit: "" };
  return null;
}

function OptionCard({ o, recommended, baselineId, accepted }: { o: MoveOption; recommended: boolean; baselineId: string; accepted: boolean }) {
  const reflow = useTempoTransition(spring.reflow);
  const openWhy = useOverlayStore((s) => s.openWhy);
  const openAccept = useOverlayStore((s) => s.openAccept);
  const h = optionHeadline(o, baselineId);
  const negative = o.savingsVsBaseline != null && o.savingsVsBaseline < 0 && o.id !== baselineId;
  return (
    <motion.article
      layout="position"
      transition={{ layout: reflow }}
      className={clsx(
        "group relative flex flex-col rounded-xl border p-4 transition-colors duration-200 ease-ui-color sm:p-5",
        recommended ? "glow-accent border-transparent bg-[var(--glass)]" : "border-line bg-[var(--glass-hi)] hover:border-line-2",
        !o.eligible && "opacity-60",
      )}
      aria-label={`${o.title}${recommended ? " (recommended)" : ""}`}
    >
      <div className="flex min-h-6 items-center justify-between gap-2">
        {recommended ? <span className="text-xs font-semibold text-accent-ink">Recommended</span> : o.id === baselineId ? <span className="text-xs text-ink-3">Baseline</span> : <span />}
        {accepted && <Chip tone="good">Accepted</Chip>}
      </div>
      <h3 className="mt-1 text-[15px] leading-snug font-semibold text-ink">{o.title}</h3>
      {h && o.eligible ? (
        <div className="mt-3">
          <div className="text-xs text-ink-3">{h.label}</div>
          <div className={clsx("num text-[28px] leading-tight font-semibold", negative ? "text-warn" : o.id !== baselineId && (o.savingsVsBaseline ?? 0) > 0 ? "text-good" : "text-ink")}>
            $<AnimatedNumber value={h.value} />
            {h.unit && <span className="text-sm font-medium text-ink-3">{h.unit}</span>}
          </div>
          {o.equity != null && <div className="num text-xs text-ink-2">Equity ${Math.round(o.equity).toLocaleString()}</div>}
        </div>
      ) : null}
      <p className="mt-2 text-[13px] leading-snug text-ink-2">{o.eligible ? o.summary : o.ineligibleReason}</p>
      {o.tradeoffs.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-3 text-[12.5px] text-ink-3 transition-colors duration-200 ease-ui-color group-focus-within:text-ink-2 group-hover:text-ink-2" aria-label="Trade-offs">
          {o.tradeoffs.map((t) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-current" />
              {t}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-1 pt-4">
        {o.eligible && o.id !== baselineId && !accepted && (
          <Button size="sm" variant={recommended ? "primary" : "outline"} onClick={() => openAccept(o.id)}>
            Choose this
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => openWhy(o.id)}>
          <Info size={14} />
          Why?
        </Button>
      </div>
    </motion.article>
  );
}

/* ---------- drawer ---------- */

export function MoveDrawer({ data }: { data?: DashboardData }) {
  const move = useUiStore((s) => s.openMove);
  const setOpenMove = useUiStore((s) => s.setOpenMove);
  const whatIf = useUiStore((s) => s.whatIf);
  const setWhatIf = useUiStore((s) => s.setWhatIf);
  const [result, setResult] = useState<{ key: string; r: EngineResult | null } | null>(null);
  const debounced = useDebounced(whatIf, 220);
  const { moved, markLocal } = useAgentMoved(whatIf);

  const relevant = useMemo<WhatIfOverrides>(() => {
    if (!move) return {};
    const keys: Record<MoveType, (keyof WhatIfOverrides)[]> = {
      "lease-end": ["monthlyMiles", "monthsAhead"],
      insurance: ["scoreImprovement"],
      payment: ["extraPrincipal", "paymentDueDay"],
      protection: ["monthlyMiles"],
    };
    return Object.fromEntries(keys[move].filter((k) => debounced[k] !== undefined).map((k) => [k, debounced[k]]));
  }, [debounced, move]);

  const personaId = data?.persona.id;
  const hasOverrides = Object.keys(relevant).length > 0;
  const reqKey = move && personaId && hasOverrides ? JSON.stringify([personaId, move, relevant]) : null;
  useEffect(() => {
    if (!reqKey || !move || !personaId) return;
    let alive = true;
    postWhatIf({ personaId, moveType: move, overrides: relevant })
      .then((r) => alive && setResult({ key: reqKey, r }))
      .catch(() => alive && setResult({ key: reqKey, r: null }));
    return () => {
      alive = false;
    };
  }, [reqKey, move, personaId, relevant]);
  const busy = !!reqKey && result?.key !== reqKey;
  const live = reqKey && result?.key === reqKey ? result.r : null;

  if (!data) return null;
  const engine = move ? (live && live.moveType === move ? live : data.engines[move]) : null;
  const rec = engine ? bestOption(data, engine) : undefined;
  const c = data.persona.contract;
  const set = (patch: WhatIfOverrides) => {
    markLocal(patch);
    setWhatIf(patch);
  };
  const reset = () => {
    const keys = Object.keys(relevant) as (keyof WhatIfOverrides)[];
    const patch = Object.fromEntries(keys.map((k) => [k, undefined])) as WhatIfOverrides;
    markLocal(patch);
    setWhatIf(patch);
  };
  const avg = Math.round(data.driving.avgMonthlyMiles / 10) * 10;

  return (
    <Drawer
      open={!!move}
      onClose={() => setOpenMove(null)}
      labelledBy="move-drawer-title"
      width={880}
      title={move ? moveLabel[move] : ""}
      subtitle={
        move ? (
          <span className="flex flex-wrap items-center gap-2">
            {subtitles[move]}
            {engine?.limitedBy?.length ? <Chip tone="warn">Limited: {engine.limitedBy.map((s) => consentLabel[s].toLowerCase()).join(", ")} off</Chip> : null}
          </span>
        ) : null
      }
    >
      {move && engine && (
        <div className="space-y-6">
          {/* What-if */}
          {move !== "protection" && (
            <section aria-labelledby="whatif-h" className="rounded-xl border border-line p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 id="whatif-h" className="flex items-center gap-2 text-sm font-semibold text-ink">
                  What if…
                  {busy && <Loader2 size={14} className="animate-spin text-ink-3" aria-label="Recalculating" />}
                </h3>
                {Object.keys(relevant).length > 0 && (
                  <Button size="sm" variant="ghost" onClick={reset}>
                    <RotateCcw size={13} />
                    Reset
                  </Button>
                )}
              </div>
              <div className="space-y-5">
                {move === "lease-end" && c.kind === "lease" && (
                  <>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Control
                        id="wi-miles"
                        label="Miles per month"
                        value={whatIf.monthlyMiles ?? avg}
                        min={300}
                        max={2500}
                        step={50}
                        format={(n) => `${n.toLocaleString()} mi`}
                        onChange={(n) => set({ monthlyMiles: n })}
                        agentMoved={!!moved.monthlyMiles}
                        hint={`You average ${avg.toLocaleString()}`}
                      />
                      <Control
                        id="wi-months"
                        label="Look ahead"
                        value={whatIf.monthsAhead ?? c.monthsRemaining}
                        min={0}
                        max={c.monthsRemaining}
                        step={1}
                        format={(n) => (n === 0 ? "Today" : n === c.monthsRemaining ? "Lease end" : `+${n} mo`)}
                        onChange={(n) => set({ monthsAhead: n })}
                        agentMoved={!!moved.monthsAhead}
                      />
                    </div>
                    <LeaseChart data={data} monthlyMiles={whatIf.monthlyMiles} monthsAhead={whatIf.monthsAhead ?? c.monthsRemaining} />
                  </>
                )}
                {move === "lease-end" && c.kind !== "lease" && <p className="text-sm text-ink-2">You finance this car, so there is no lease end to plan for.</p>}
                {move === "insurance" && (
                  <Control
                    id="wi-score"
                    label="If your driving score improves by"
                    value={whatIf.scoreImprovement ?? 10}
                    min={0}
                    max={30}
                    step={1}
                    format={(n) => `+${n} pts`}
                    onChange={(n) => set({ scoreImprovement: n })}
                    agentMoved={!!moved.scoreImprovement}
                    hint={`Today: ${data.driving.score}/100`}
                  />
                )}
                {move === "payment" && (
                  <div className="grid gap-5 sm:grid-cols-2">
                    {c.kind === "loan" && (
                      <Control
                        id="wi-extra"
                        label="Extra toward principal"
                        value={whatIf.extraPrincipal ?? 100}
                        min={0}
                        max={500}
                        step={25}
                        format={(n) => `$${n}/mo`}
                        onChange={(n) => set({ extraPrincipal: n })}
                        agentMoved={!!moved.extraPrincipal}
                      />
                    )}
                    <Control
                      id="wi-due"
                      label="Payment due day"
                      value={whatIf.paymentDueDay ?? data.cashflow?.paymentDueDay ?? 15}
                      min={1}
                      max={28}
                      step={1}
                      format={(n) => `Day ${n}`}
                      onChange={(n) => set({ paymentDueDay: n })}
                      agentMoved={!!moved.paymentDueDay}
                      hint={data.cashflow ? `Today: day ${data.cashflow.paymentDueDay}` : "Banking data off: payday unknown"}
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Options */}
          <section aria-label="Options">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
              {engine.options.map((o) => (
                <OptionCard
                  key={o.id}
                  o={o}
                  recommended={o.id === rec?.id && o.id !== engine.baselineOptionId}
                  baselineId={engine.baselineOptionId}
                  accepted={data.preferences.accepted.some((a) => a.optionId === o.id)}
                />
              ))}
            </div>
            {rec?.deadline && <p className="mt-3 text-xs text-ink-3">Decide by {shortDate(rec.deadline)} (30 days before your lease ends).</p>}
          </section>
        </div>
      )}
    </Drawer>
  );
}
