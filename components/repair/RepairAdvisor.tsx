"use client";

import clsx from "clsx";
import { AlertTriangle, Building2, Check, ChevronLeft, ChevronRight, ExternalLink, FileUp, Landmark, LoaderCircle, MapPin, RotateCcw, Search, Wrench } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { analyzeRepairDecision, classifyRepair, type RepairAdvisorInput } from "@/lib/engines/repair-advisor";
import type { PlanningResult } from "@/lib/agent/planning-workflow";
import type { RepairGuidance, RepairResearchItem } from "@/lib/engines/repair-research";
import type { DashboardData } from "@/lib/types";
import { ActionAgent } from "./ActionAgent";
import { WhatIfSimulator } from "./WhatIfSimulator";

type Step = 0 | 1 | 2 | 3 | 4;
type FormState = RepairAdvisorInput & { city: string; shopName: string; quoteFile: string };

const steps = ["Problem", "Estimate", "Finances", "Plan", "Action Agent"];
const money = (value: number) => `$${Math.round(value).toLocaleString()}`;
const field = "mt-1.5 h-11 w-full rounded-lg border border-line-2 bg-[var(--glass-hi)] px-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-[var(--focus)]";
const label = "block text-[13px] font-medium text-ink-2";

const shopsByCity: Record<string, { name: string; detail: string }[]> = {
  Austin: [
    { name: "North Austin Toyota Service", detail: "Toyota service, 6.2 mi" },
    { name: "Lone Star Auto Care", detail: "Independent shop, 3.8 mi" },
    { name: "Capitol Car Clinic", detail: "ASE-certified, 5.1 mi" },
  ],
  Houston: [
    { name: "Gulf Coast Toyota Service", detail: "Toyota service, 7.4 mi" },
    { name: "Bayou Auto Care", detail: "Independent shop, 4.2 mi" },
    { name: "Inner Loop Garage", detail: "ASE-certified, 5.9 mi" },
  ],
  Dallas: [
    { name: "North Dallas Toyota Service", detail: "Toyota service, 6.8 mi" },
    { name: "Metroplex Auto Care", detail: "Independent shop, 4.5 mi" },
    { name: "Dallas Car Clinic", detail: "ASE-certified, 5.3 mi" },
  ],
};

function initialState(data?: DashboardData): FormState {
  const vehicle = data?.persona.vehicle;
  const contract = data?.persona.contract;
  return {
    vehicle: { year: vehicle?.year ?? 2018, model: vehicle?.model ?? "Camry", mileage: vehicle?.odometer ?? 75_000 },
    issue: "",
    loanBalance: contract?.kind === "loan" ? contract.principalRemaining : 0,
    currentPayment: contract?.monthlyPayment ?? 0,
    currentApr: contract?.kind === "loan" ? contract.apr : 7.5,
    savings: data?.cashflow ? Math.round(data.cashflow.avgBalance * 1.5) : 5_000,
    monthlySurplus: data?.cashflow ? Math.max(300, Math.round(data.cashflow.avgBalance * 0.18)) : 700,
    downPayment: 3_000,
    credit: data?.persona.creditTier ?? "good",
    keepYears: 3,
    researchSeverity: undefined,
    researchVerdict: undefined,
    city: data?.persona.city ?? "Austin",
    shopName: "",
    quoteFile: "",
  };
}

function Progress({ step }: { step: Step }) {
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Repair decision progress">
      {steps.map((name, index) => (
        <li key={name} className="min-w-0">
          <div className={clsx("h-1 rounded-full", index <= step ? "bg-ink" : "bg-line-2")} />
          <span className={clsx("mt-2 block truncate text-[11px] sm:text-xs", index === step ? "font-semibold text-ink" : "text-ink-3")}>
            {name}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StepHeader({ eyebrow, title, hint }: { eyebrow: string; title: string; hint?: string }) {
  return (
    <div>
      <p className="text-[13px] font-medium text-ink-3">{eyebrow}</p>
      <h2 className="font-display mt-1 text-2xl text-ink sm:text-[28px]">{title}</h2>
      {hint && <p className="mt-2 text-sm text-ink-2">{hint}</p>}
    </div>
  );
}

type ResearchState = { guidance: RepairGuidance; links: RepairResearchItem[] } | null;

function VehicleProblem({ form, update, research, researching, researchError, onResearch }: { form: FormState; update: (patch: Partial<FormState>) => void; research: ResearchState; researching: boolean; researchError: string; onResearch: () => void }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
      <StepHeader eyebrow="Step 1 of 5" title="What’s going on?" />
      <label className={label}>
        Describe the problem
        <textarea
          value={form.issue}
          onChange={(event) => update({ issue: event.target.value })}
          rows={4}
          maxLength={500}
          placeholder="Example: The brakes grind when I stop."
          className={clsx(field, "h-auto resize-none py-3 leading-relaxed")}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={label}>
          Model
          <input value={form.vehicle.model} onChange={(event) => update({ vehicle: { ...form.vehicle, model: event.target.value } })} className={field} />
        </label>
        <label className={label}>
          Year
          <input type="number" min="1990" max="2027" value={form.vehicle.year} onChange={(event) => update({ vehicle: { ...form.vehicle, year: Number(event.target.value) } })} className={field} />
        </label>
        <label className={label}>
          Mileage
          <input type="number" min="0" max="500000" value={form.vehicle.mileage} onChange={(event) => update({ vehicle: { ...form.vehicle, mileage: Number(event.target.value) } })} className={field} />
        </label>
      </div>
      <Button variant="primary" disabled={form.issue.trim().length < 5 || researching} onClick={onResearch}>
        {researching ? <><LoaderCircle size={15} className="animate-spin" />Researching…</> : <><Search size={15} />Research this problem</>}
      </Button>
      {researchError && <p className="text-sm text-accent-ink">{researchError}</p>}
      </div>
      <aside className="rounded-lg border border-line bg-[var(--glass-hi)] p-4" aria-live="polite">
        <h3 className="text-sm font-semibold text-ink">Repair research</h3>
        {!research && !researching && <p className="mt-2 text-sm text-ink-3">Research the symptom for severity and sources.</p>}
        {researching && <div className="mt-4 space-y-3"><div className="skeleton h-16" /><div className="skeleton h-12" /><div className="skeleton h-12" /></div>}
        {research && <div className="mt-3 space-y-4">
          <div className={clsx("rounded-lg border p-3", research.guidance.severity === "high" ? "border-accent bg-accent-soft" : research.guidance.severity === "medium" ? "border-warn bg-warn-soft" : "border-good bg-good-soft")}>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide"><AlertTriangle size={14} />{research.guidance.severity} severity</div>
            <p className="mt-2 text-sm font-medium text-ink">{research.guidance.verdict}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">{research.guidance.simpleSolution}</p>
          </div>
          {research.links.length ? <ul className="space-y-2">{research.links.map((item) => <li key={item.url}><a href={item.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-line p-3 hover:border-line-2"><span className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-ink-3">{item.kind === "community" ? "Community" : "Trusted source"}<ExternalLink size={12} /></span><span className="mt-1 block text-sm font-medium leading-snug text-ink">{item.title}</span><span className="mt-1 block text-xs text-ink-3">{item.source}</span></a></li>)}</ul> : <p className="text-xs text-ink-3">No sources available.</p>}
          <p className="text-[11px] text-ink-3">Confirm safety and diagnosis with a qualified technician.</p>
        </div>}
      </aside>
    </div>
  );
}

function EstimateStep({ form, update }: { form: FormState; update: (patch: Partial<FormState>) => void }) {
  const estimate = classifyRepair(form.issue, form.vehicle.year, form.manualQuote);
  const fileRef = useRef<HTMLInputElement>(null);
  const shops = shopsByCity[form.city] ?? shopsByCity.Austin;
  return (
    <div className="space-y-6">
      <StepHeader eyebrow="Step 2 of 5" title={estimate.needsInspection ? "Start with an inspection" : "Repair estimate"} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-[var(--glass-hi)] p-5">
          <div className="flex items-center gap-2 text-sm text-ink-2"><Wrench size={16} /> {estimate.label}</div>
          <div className="num mt-3 text-3xl font-semibold text-ink">
            {estimate.low === estimate.high ? money(estimate.estimate) : `${money(estimate.low)}–${money(estimate.high)}`}
          </div>
          <p className="mt-2 text-xs text-ink-3">{estimate.source === "shop quote" ? "Your shop quote" : "Parts and labor estimate"}</p>
        </div>
        <div className="rounded-lg border border-line bg-[var(--glass-hi)] p-5">
          <div className="text-sm text-ink-2">Estimated private-sale value</div>
          <div className="num mt-3 text-3xl font-semibold text-ink">{money(analyzeRepairDecision(form).privateSaleValue)}</div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-ink">Have a quote?</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className={label}>
            Quote total
            <input type="number" min="0" placeholder="0" value={form.manualQuote ?? ""} onChange={(event) => update({ manualQuote: event.target.value ? Number(event.target.value) : undefined })} className={field} />
          </label>
          <label className={label}>
            Shop name
            <input value={form.shopName} onChange={(event) => update({ shopName: event.target.value })} placeholder="Optional" className={field} />
          </label>
          <div className="self-end">
            <input ref={fileRef} type="file" accept=".pdf,image/*" className="sr-only" onChange={(event) => update({ quoteFile: event.target.files?.[0]?.name ?? "" })} />
            <Button onClick={() => fileRef.current?.click()} className="w-full"><FileUp size={15} />{form.quoteFile ? "Replace file" : "Attach quote"}</Button>
          </div>
        </div>
        {form.quoteFile && <p className="mt-2 text-xs text-good"><Check size={13} className="mr-1 inline" />{form.quoteFile} attached. Enter the total above.</p>}
      </div>

      <div>
        <div className="flex items-end justify-between gap-3">
          <div><h3 className="text-sm font-semibold text-ink">Nearby shops</h3><p className="mt-1 text-xs text-ink-3">Demo listings—confirm details.</p></div>
          <select value={form.city} onChange={(event) => update({ city: event.target.value })} className="h-9 rounded-lg border border-line-2 bg-[var(--glass-hi)] px-3 text-sm text-ink">
            <option>Austin</option><option>Houston</option><option>Dallas</option>
          </select>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {shops.map((shop) => (
            <li key={shop.name}>
              <button type="button" onClick={() => update({ shopName: shop.name })} className={clsx("h-full w-full rounded-lg border p-3.5 text-left transition-colors duration-200 ease-ui-color", form.shopName === shop.name ? "border-accent bg-accent-soft" : "border-line hover:border-line-2")}>
                <MapPin size={15} className="text-ink-3" /><span className="mt-2 block text-sm font-medium text-ink">{shop.name}</span><span className="mt-1 block text-xs text-ink-3">{shop.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function FinanceStep({ form, update, connected, setConnected }: { form: FormState; update: (patch: Partial<FormState>) => void; connected: boolean; setConnected: (value: boolean) => void }) {
  return (
    <div className="space-y-6">
      <StepHeader eyebrow="Step 3 of 5" title="Your budget" />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>Loan balance<input type="number" min="0" value={form.loanBalance} onChange={(event) => update({ loanBalance: Number(event.target.value) })} className={field} /></label>
        <label className={label}>Current payment<input type="number" min="0" value={form.currentPayment} onChange={(event) => update({ currentPayment: Number(event.target.value) })} className={field} /></label>
        <label className={label}>Savings available<input type="number" min="0" value={form.savings} onChange={(event) => update({ savings: Number(event.target.value) })} className={field} /></label>
        <label className={label}>Monthly room after bills<input type="number" min="0" value={form.monthlySurplus} onChange={(event) => update({ monthlySurplus: Number(event.target.value) })} className={field} /></label>
        <label className={label}>Down payment you’d use<input type="number" min="0" value={form.downPayment} onChange={(event) => update({ downPayment: Number(event.target.value) })} className={field} /></label>
        <label className={label}>Credit range<select value={form.credit} onChange={(event) => update({ credit: event.target.value as FormState["credit"] })} className={field}><option value="excellent">Excellent</option><option value="good">Good</option><option value="fair">Fair</option><option value="building">Building</option></select></label>
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-[var(--glass-hi)] p-4 sm:flex-row sm:items-center">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-ink text-bg"><Landmark size={18} /></span>
        <div className="min-w-0 flex-1 text-sm font-medium text-ink">{connected ? "Profile connected" : "Use profile data"}</div>
        <Button variant={connected ? "solid" : "outline"} onClick={() => setConnected(!connected)}>{connected ? <><Check size={15} />Connected</> : "Connect"}</Button>
      </div>
      <label className={label}>How long would you keep this car?<select value={form.keepYears} onChange={(event) => update({ keepYears: Number(event.target.value) })} className={field}><option value="2">2 years</option><option value="3">3 years</option><option value="5">5 years</option></select></label>
    </div>
  );
}

function PlanStep({ form }: { form: FormState }) {
  const localResult = useMemo(() => analyzeRepairDecision(form), [form]);
  const [planned, setPlanned] = useState<PlanningResult | null>(null);
  const [planning, setPlanning] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/repair-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form), signal: controller.signal })
      .then(async response => response.ok ? response.json() as Promise<PlanningResult> : Promise.reject(new Error("Planning failed")))
      .then(setPlanned)
      .catch(error => { if (error.name !== "AbortError") setPlanned(null); })
      .finally(() => { if (!controller.signal.aborted) setPlanning(false); });
    return () => controller.abort();
  }, [form]);
  const result = planned?.decision ?? localResult;
  const recommendation = planned?.recommendation ?? result.recommendation;
  const recommended = result.options.find((option) => option.path === recommendation)!;
  return (
    <div className="space-y-6">
      <StepHeader eyebrow="Step 4 of 5" title={recommended.title} />
      <div className="rounded-lg border border-line bg-[var(--glass-hi)] p-4">
        <div className="flex items-center justify-between gap-3"><div className="text-sm font-semibold text-ink">Plan review</div>{planning && <Chip>Evaluating…</Chip>}</div>
        <p className="mt-2 text-sm text-ink-2">{planning ? "Comparing options…" : planned?.rationale ?? "Using the calculated recommendation."}</p>
        {planned && <p className="mt-2 text-xs text-ink-3"><span className="font-medium text-ink-2">Main tradeoff:</span> {planned.downside} · {Math.round(planned.confidence * 100)}% confidence</p>}
        {planned && planned.concerns.length > 0 && <p className="mt-2 text-xs text-warn">Review note: {planned.concerns.join(" ")}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg border border-accent bg-accent-soft p-5">
          <div className="text-sm font-medium text-accent-ink">Repair-to-trade signal</div>
          <div className="num mt-3 text-5xl font-semibold text-ink">{result.score}<span className="text-lg text-ink-3">/100</span></div>
        </div>
        <ul className="rounded-lg border border-line p-5">
          {result.reasons.slice(1, 4).map((reason) => <li key={reason} className="flex gap-2.5 py-1.5 text-sm text-ink-2"><Check size={15} className="mt-0.5 shrink-0 text-good" />{reason}</li>)}
        </ul>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-ink">Compare all paths</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {result.options.map((option) => (
            <article key={option.path} className={clsx("rounded-lg border p-4", option.path === recommendation ? "border-accent bg-accent-soft" : "border-line", !option.eligible && "opacity-60")}>
              <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold text-ink">{option.title}</h4>{option.path === recommendation && <Chip tone="accent">Best fit</Chip>}</div>
              <div className="num mt-4 text-3xl font-semibold text-ink">{money(option.monthly)}<span className="text-xs text-ink-3">/mo</span></div>
              <div className="mt-1 text-xs text-ink-3">{money(option.upfront)} estimated upfront</div>
              <p className="mt-2 text-xs leading-relaxed text-ink-2">{option.summary}</p>
            </article>
          ))}
        </div>
      </div>
      {result.replacements.length > 0 && (
        <div><h3 className="text-sm font-semibold text-ink">Affordable replacements</h3><div className="mt-3 grid gap-2 sm:grid-cols-3">{result.replacements.map((car) => <div key={car.name} className="rounded-lg border border-line p-4"><Building2 size={16} className="text-ink-3" /><div className="mt-3 text-sm font-medium text-ink">{car.name}</div><div className="num mt-1 text-lg font-semibold text-ink">{money(car.monthly)}/mo</div><div className="mt-1 text-xs text-ink-3">{car.fit}, {money(car.price)}</div></div>)}</div></div>
      )}
      <WhatIfSimulator baseInput={form} />
    </div>
  );
}

export function RepairAdvisor({ data }: { data?: DashboardData }) {
  const [step, setStep] = useState<Step>(0);
  const [form, setForm] = useState<FormState>(() => initialState(data));
  const [connected, setConnected] = useState(false);
  const [research, setResearch] = useState<ResearchState>(null);
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState("");

  const update = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));
  const canContinue = step !== 0 || form.issue.trim().length >= 5;
  const reset = () => { setForm(initialState(data)); setStep(0); setConnected(false); setResearch(null); setResearchError(""); };
  const runResearch = async () => {
    setResearching(true); setResearchError(""); setResearch(null);
    try {
      const response = await fetch("/api/repair-research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ issue: form.issue, vehicle: form.vehicle }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Research is unavailable right now.");
      setResearch(body);
      update({ researchSeverity: body.guidance.severity, researchVerdict: body.guidance.verdict });
    } catch (error) { setResearchError(error instanceof Error ? error.message : "Research is unavailable right now."); }
    finally { setResearching(false); }
  };

  return (
    <section aria-labelledby="repair-advisor-title" className="w-full">
      <div className="flex items-end justify-between gap-4 pb-8">
        <h1 id="repair-advisor-title" className="font-display text-[clamp(39px,4.4vw,61px)] text-ink">Repair or replace</h1>
        <Button variant="ghost" size="sm" onClick={reset}><RotateCcw size={14} />Start over</Button>
      </div>
      <div className="glass max-w-5xl rounded-xl p-5 sm:p-7">
        <Progress step={step} />
        <div className="mt-8 min-h-[430px]">
          {step === 0 && <VehicleProblem form={form} update={(patch) => { update(patch.issue !== undefined || patch.vehicle !== undefined ? { ...patch, researchSeverity: undefined, researchVerdict: undefined } : patch); if (patch.issue !== undefined || patch.vehicle !== undefined) setResearch(null); }} research={research} researching={researching} researchError={researchError} onResearch={runResearch} />}
          {step === 1 && <EstimateStep form={form} update={update} />}
          {step === 2 && <FinanceStep form={form} update={update} connected={connected} setConnected={setConnected} />}
          {step === 3 && <PlanStep form={form} />}
          {step === 4 && <ActionAgent form={form} customerName={data?.persona.name ?? "Customer"} />}
        </div>
        <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep((step - 1) as Step)}><ChevronLeft size={16} />Back</Button>
          {step < 4 ? <div className="flex flex-wrap justify-end gap-2">{step === 0 && research?.guidance.allowTutorials && research.links.length > 0 && <Button variant="outline" onClick={() => window.open(research.links[0].url, "_blank", "noopener,noreferrer")}>View fix tutorial<ExternalLink size={15} /></Button>}<Button variant="primary" disabled={!canContinue || researching} onClick={() => setStep((step + 1) as Step)}>{step === 0 ? <>{research?.guidance.severity === "high" ? "Go to estimates" : "Continue to estimate"}<ChevronRight size={16} /></> : step === 2 ? <>See my plan<ChevronRight size={16} /></> : step === 3 ? <>Open Action Agent<ChevronRight size={16} /></> : <>Continue<ChevronRight size={16} /></>}</Button></div> : <Button variant="solid" onClick={() => setStep(0)}>Review details</Button>}
        </div>
      </div>
    </section>
  );
}
