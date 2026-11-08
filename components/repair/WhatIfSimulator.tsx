"use client";

import clsx from "clsx";
import { ArrowRightLeft, RotateCcw, SlidersHorizontal, TrendingDown, TrendingUp, X } from "lucide-react";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Overlay";
import { analyzeRepairDecision, type DecisionOption, type DecisionPath, type RepairAdvisorInput } from "@/lib/engines/repair-advisor";
import { parseLifeScenario, projectFlexibleCash } from "@/lib/engines/repair-scenario";

const dollars = (value: number) => `$${Math.round(value).toLocaleString()}`;

function RangeField({ label, value, min, max, step, format = dollars, onChange }: { label: string; value: number; min: number; max: number; step: number; format?: (value: number) => string; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-3 text-xs text-ink-2"><span>{label}</span><strong className="num text-ink">{format(value)}</strong></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full accent-[var(--accent)]" />
    </label>
  );
}

function AssumptionControls({ input, setInput, compact = false }: { input: RepairAdvisorInput; setInput: (input: RepairAdvisorInput) => void; compact?: boolean }) {
  const quote = analyzeRepairDecision(input).estimate.estimate;
  return (
    <div className={clsx("grid gap-x-6 gap-y-4", compact ? "sm:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3")}>
      <RangeField label="Monthly room after bills" value={input.monthlySurplus} min={0} max={Math.max(2500, input.monthlySurplus)} step={50} onChange={(monthlySurplus) => setInput({ ...input, monthlySurplus })} />
      <RangeField label="Available savings" value={input.savings} min={0} max={Math.max(25000, input.savings)} step={250} onChange={(savings) => setInput({ ...input, savings })} />
      <RangeField label="Repair quote" value={quote} min={100} max={Math.max(7500, quote)} step={100} onChange={(manualQuote) => setInput({ ...input, manualQuote })} />
      <RangeField label="Down payment" value={input.downPayment} min={0} max={Math.max(15000, input.downPayment)} step={250} onChange={(downPayment) => setInput({ ...input, downPayment })} />
      <RangeField label="Vehicle mileage" value={input.vehicle.mileage} min={0} max={250000} step={5000} format={(value) => `${value.toLocaleString()} mi`} onChange={(mileage) => setInput({ ...input, vehicle: { ...input.vehicle, mileage } })} />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-ink-2">Credit range<select value={input.credit} onChange={(event) => setInput({ ...input, credit: event.target.value as RepairAdvisorInput["credit"] })} className="mt-2 h-9 w-full rounded-lg border border-line-2 bg-[var(--glass-hi)] px-2 text-sm text-ink"><option value="building">Building</option><option value="fair">Fair</option><option value="good">Good</option><option value="excellent">Excellent</option></select></label>
        <label className="text-xs text-ink-2">Keep the car<select value={input.keepYears} onChange={(event) => setInput({ ...input, keepYears: Number(event.target.value) })} className="mt-2 h-9 w-full rounded-lg border border-line-2 bg-[var(--glass-hi)] px-2 text-sm text-ink">{[2, 3, 4, 5, 6, 7].map((year) => <option key={year} value={year}>{year} years</option>)}</select></label>
      </div>
    </div>
  );
}

function CashChart({ options, input }: { options: DecisionOption[]; input: RepairAdvisorInput }) {
  const data = useMemo(() => projectFlexibleCash(options, input), [options, input]);
  const colors = ["#e31837", "#3978c5", "#2f8f65"];
  return (
    <div className="h-[260px] w-full" role="img" aria-label={`Projected flexible cash over ${input.keepYears} years`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={(month) => `${month / 12}y`} tick={{ fill: "var(--ink-3)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(value) => `${value < 0 ? "−" : ""}$${Math.abs(Math.round(value / 1000))}k`} width={48} tick={{ fill: "var(--ink-3)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(value) => dollars(Number(value))} labelFormatter={(month) => `Month ${month}`} contentStyle={{ border: "1px solid var(--line)", borderRadius: 10, background: "var(--bg)", color: "var(--ink)" }} />
          {options.map((option, index) => <Line key={option.path} type="monotone" dataKey={option.path} name={option.title} stroke={colors[index]} strokeWidth={3} dot={false} activeDot={{ r: 4 }} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ComparisonModal({ open, onClose, input, setInput }: { open: boolean; onClose: () => void; input: RepairAdvisorInput; setInput: (input: RepairAdvisorInput) => void }) {
  const result = useMemo(() => analyzeRepairDecision(input), [input]);
  const available = result.options.filter((option) => option.eligible);
  const [leftPath, setLeftPath] = useState<DecisionPath>(available[0]?.path ?? "keep");
  const [rightPath, setRightPath] = useState<DecisionPath>(available[1]?.path ?? available[0]?.path ?? "trade");
  const effectiveLeft = available.some((option) => option.path === leftPath) ? leftPath : available[0]?.path ?? "keep";
  const effectiveRight = available.some((option) => option.path === rightPath) && rightPath !== effectiveLeft
    ? rightPath
    : available.find((option) => option.path !== effectiveLeft)?.path ?? available[0]?.path ?? "trade";
  const compared = [result.options.find((option) => option.path === effectiveLeft), result.options.find((option) => option.path === effectiveRight)]
    .filter((option): option is DecisionOption => Boolean(option))
    .filter((option, index, options) => options.findIndex((candidate) => candidate.path === option.path) === index);

  return (
    <Modal open={open} onClose={onClose} labelledBy="compare-plans-title" className="max-h-[92dvh] max-w-[980px] overflow-y-auto">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-medium text-ink-3">Interactive comparison</p><h2 id="compare-plans-title" className="font-display mt-1 text-2xl text-ink">Compare two plans</h2><p className="mt-2 text-sm text-ink-2">Change an assumption and both paths update together.</p></div><IconButton label="Close comparison" onClick={onClose}><X size={18} /></IconButton></div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {[{ value: effectiveLeft, other: effectiveRight, set: setLeftPath }, { value: effectiveRight, other: effectiveLeft, set: setRightPath }].map((selection, index) => <label key={index} className="text-xs text-ink-2">Plan {index + 1}<select value={selection.value} onChange={(event) => selection.set(event.target.value as DecisionPath)} className="mt-1.5 h-10 w-full rounded-lg border border-line-2 bg-[var(--glass-hi)] px-3 text-sm font-medium text-ink">{available.filter((option) => option.path === selection.value || option.path !== selection.other).map((option) => <option key={option.path} value={option.path}>{option.title}</option>)}</select></label>)}
      </div>
      <div className="mt-5 rounded-xl border border-line p-3"><div className="mb-1 px-2 text-xs font-medium text-ink-3">Projected flexible cash after each plan</div><CashChart options={compared} input={input} /></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{compared.map((option) => <div key={option.path} className={clsx("rounded-lg border p-4", option.path === result.recommendation ? "border-accent bg-accent-soft" : "border-line")}><div className="flex items-center justify-between"><h3 className="font-semibold text-ink">{option.title}</h3>{option.path === result.recommendation && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white">Recommended now</span>}</div><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-ink-3">Monthly</dt><dd className="num mt-1 font-semibold text-ink">{dollars(option.monthly)}</dd></div><div><dt className="text-xs text-ink-3">Upfront</dt><dd className="num mt-1 font-semibold text-ink">{dollars(option.upfront)}</dd></div></dl><p className="mt-3 text-xs leading-relaxed text-ink-2">{option.summary}</p></div>)}</div>
      <div className="mt-6 border-t border-line pt-5"><h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink"><SlidersHorizontal size={15} />Adjust both plans</h3><AssumptionControls input={input} setInput={setInput} compact /></div>
    </Modal>
  );
}

export function WhatIfSimulator({ baseInput }: { baseInput: RepairAdvisorInput }) {
  const baselineQuote = useMemo(() => analyzeRepairDecision(baseInput).estimate.estimate, [baseInput]);
  const baselineResult = useMemo(() => analyzeRepairDecision(baseInput), [baseInput]);
  const [input, setInput] = useState<RepairAdvisorInput>({ ...baseInput });
  const [scenarioText, setScenarioText] = useState("");
  const [scenarioSummary, setScenarioSummary] = useState("Using the finances entered in your plan.");
  const [scenarioError, setScenarioError] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);
  const result = useMemo(() => analyzeRepairDecision(input), [input]);
  const available = result.options.filter((option) => option.eligible);
  const recommended = result.options.find((option) => option.path === result.recommendation)!;
  const oldRecommended = baselineResult.options.find((option) => option.path === baselineResult.recommendation)!;
  const monthlyDelta = recommended.monthly - oldRecommended.monthly;

  const updateScenario = (text: string) => {
    setScenarioText(text);
    if (!text.trim()) {
      setInput({ ...baseInput, vehicle: { ...baseInput.vehicle } });
      setScenarioSummary("Using the finances entered in your plan.");
      setScenarioError("");
      return;
    }
    let parsed;
    try {
      parsed = parseLifeScenario(text, baseInput, baselineQuote);
    } catch {
      setInput({ ...baseInput, vehicle: { ...baseInput.vehicle } });
      setScenarioError("That scenario could not be calculated safely. Check the amounts and try a simpler sentence.");
      return;
    }
    if (!parsed.input) {
      setInput({ ...baseInput, vehicle: { ...baseInput.vehicle } });
      setScenarioError(parsed.error ?? "Keep typing to complete the scenario.");
      return;
    }
    setScenarioError("");
    setScenarioSummary(parsed.summary ?? "Scenario applied.");
    setInput(parsed.input);
  };
  const reset = () => {
    setInput({ ...baseInput, vehicle: { ...baseInput.vehicle } });
    setScenarioText("");
    setScenarioSummary("Using the finances entered in your plan.");
    setScenarioError("");
  };

  return (
    <section className="rounded-xl border border-line bg-[var(--glass)] p-5 sm:p-6" aria-labelledby="what-if-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-medium text-ink-3">Pressure-test your plan</p><h3 id="what-if-title" className="font-display mt-1 text-xl text-ink">What if life changes?</h3><p className="mt-2 max-w-[58ch] text-sm text-ink-2">Try an everyday scenario, then tune the assumptions. The recommendation and estimated costs update live.</p></div><Button onClick={reset} size="sm"><RotateCcw size={14} />Reset</Button></div>
      <div className="mt-5">
        <label className="text-xs font-medium text-ink-2">Describe what changed<textarea value={scenarioText} onChange={(event) => updateScenario(event.target.value)} rows={3} maxLength={500} placeholder="Example: I got a $10k annual raise, but my rent went up $200 a month." className="mt-1.5 w-full resize-none rounded-lg border border-line-2 bg-[var(--glass-hi)] px-3 py-3 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-3 focus:border-[var(--focus)]" /></label>
        <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-ink-3">Updates as you type. Try a $5k annual raise, $400 monthly pay cut, $2k bonus, $1,500 emergency bill, $300 rent increase, $4k repair quote, better credit, 20k extra miles, or keeping the car two more years. For a percentage raise, include current annual income.</p>
        {scenarioError ? <p aria-live="polite" className="mt-3 rounded-lg border border-line bg-[var(--glass-hi)] px-4 py-3 text-sm text-ink-3">{scenarioError}</p> : <p aria-live="polite" className="mt-3 rounded-lg bg-[var(--glass-hi)] px-4 py-3 text-sm text-ink-2"><strong className="text-ink">Applied math:</strong> {scenarioSummary}</p>}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-line p-3"><div className="mb-1 flex items-center justify-between px-2"><span className="text-xs font-medium text-ink-3">Projected flexible cash</span><span className="text-[11px] text-ink-3">Savings − upfront cost + monthly room</span></div><CashChart options={available} input={input} /></div>
        <div className="space-y-3"><div className="rounded-xl border border-accent bg-accent-soft p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-accent-ink">Recommended under this scenario</p><h4 className="mt-1 text-xl font-semibold text-ink">{recommended.title}</h4></div>{result.recommendation === baselineResult.recommendation ? <span className="rounded-full bg-[var(--glass-hi)] px-2 py-1 text-[10px] font-semibold text-ink-2">Plan holds</span> : <span className="rounded-full bg-accent px-2 py-1 text-[10px] font-semibold text-white">Plan changed</span>}</div><p className="mt-3 text-sm leading-relaxed text-ink-2">{recommended.summary}</p><div className="mt-4 flex items-center gap-5"><div><div className="num text-2xl font-semibold text-ink">{dollars(recommended.monthly)}<span className="text-xs text-ink-3">/mo</span></div><div className="mt-1 flex items-center gap-1 text-xs text-ink-3">{monthlyDelta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{monthlyDelta === 0 ? "No monthly change" : `${dollars(Math.abs(monthlyDelta))} ${monthlyDelta > 0 ? "more" : "less"} than the original recommendation`}</div></div><div><div className="num text-2xl font-semibold text-ink">{result.score}<span className="text-xs text-ink-3">/100</span></div><div className="mt-1 text-xs text-ink-3">repair-to-trade signal</div></div></div></div>
          <Button className="w-full" disabled={available.length < 2} onClick={() => setCompareOpen(true)}><ArrowRightLeft size={15} />{available.length >= 2 ? "Compare two plans" : "Only one plan is currently available"}</Button>
        </div>
      </div>
      <details className="mt-5 rounded-lg border border-line"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink">Fine-tune the assumptions</summary><div className="border-t border-line p-4"><AssumptionControls input={input} setInput={setInput} /></div></details>
      <p className="mt-4 text-[11px] leading-relaxed text-ink-3">What-if results are illustrative estimates, not quotes or guarantees. Annual pay changes are divided by 12 and applied to monthly room after bills. Taxes and payroll deductions are not estimated, so enter a take-home change when possible.</p>
      <ComparisonModal open={compareOpen} onClose={() => setCompareOpen(false)} input={input} setInput={setInput} />
    </section>
  );
}
