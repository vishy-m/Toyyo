"use client";

import { ArrowDown, ArrowUpRight, Check, ChevronRight, Download, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { CinematicVehicle } from "@/lib/cinematic/vehicles";
import { getDashboard, postAction } from "@/lib/client/api";
import { consentLabel, moveLabel, usd } from "@/lib/client/format";
import type { ConsentSource, DashboardData, HandoffPacket, MoveOption } from "@/lib/types";
import { OwnershipDriving, OwnershipFinances, OwnershipRepairs } from "./OwnershipTools";
import { LeaseConversation } from "./LeaseConversation";
import "./ownership.css";

interface OwnershipPanelProps {
  vehicle: CinematicVehicle;
  section: string;
  onSectionChange: (section: string) => void;
}

const scrollPositions = new Map<string, number>();
const descriptions: Record<string, { label: string; title: string; lead: string }> = {
  finances: { label: "02 / Finances", title: "The numbers.\nIn perspective.", lead: "A clear view of the contract, and room to explore what could change." },
  repairs: { label: "03 / Repairs", title: "Keep the good\nthings running.", lead: "Understand a repair, compare the choices, and build a practical plan." },
  driving: { label: "04 / Driving", title: "Every mile\ntells a story.", lead: "How you actually use this car, and what that means for the next decision." },
  "next-move": { label: "05 / Next move", title: "A little clarity.\nA better next move.", lead: "Compare the options that fit this car and this moment." },
  recommendations: { label: "06 / Recommendations", title: "Worth a\ncloser look.", lead: "A shortlist shaped by your priorities, your contract and the data you share." },
};

export function OwnershipPanel(props: OwnershipPanelProps) {
  return <OwnershipCase key={props.vehicle.id} {...props} />;
}

function OwnershipCase({ vehicle, section, onSectionChange }: OwnershipPanelProps) {
  const [data, setData] = useState<DashboardData>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const active = useRef(true);
  const validSection = section in descriptions ? section : "overview";
  const scrollKey = `${vehicle.id}:${validSection}`;

  const reload = useCallback(async () => {
    const next = await getDashboard(vehicle.personaId);
    if (next.persona.id !== vehicle.personaId) throw new Error("This car’s details could not be matched. Please try again.");
    if (active.current) setData(next);
  }, [vehicle.personaId]);

  useEffect(() => {
    active.current = true;
    let cancelled = false;
    getDashboard(vehicle.personaId).then((next) => {
      if (cancelled) return;
      if (next.persona.id !== vehicle.personaId) throw new Error("This car’s details could not be matched.");
      setData(next);
      setError("");
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "This car’s details could not be loaded.");
    });
    return () => { cancelled = true; active.current = false; };
  }, [vehicle.personaId, attempt]);

  const keyRef = useRef(scrollKey);
  const loaded = Boolean(data);
  // Restore this section's scroll once its content exists (content is empty while loading, which would clamp it to 0).
  useLayoutEffect(() => {
    keyRef.current = scrollKey;
    const node = panel.current;
    if (node) node.scrollTop = scrollPositions.get(scrollKey) ?? 0;
  }, [scrollKey, loaded]);
  // Move focus to the new section's heading, but only when nothing has focus, so the tab rail keeps keyboard focus.
  useEffect(() => {
    const node = panel.current;
    const timeout = window.setTimeout(() => {
      const idle = !document.activeElement || document.activeElement === document.body;
      if (idle) node?.querySelector<HTMLElement>("#ownership-heading")?.focus({ preventScroll: true });
    }, 100);
    return () => window.clearTimeout(timeout);
  }, [scrollKey]);

  const changeConsent = async (source: ConsentSource, value: boolean) => {
    setBusy(true);
    setError("");
    try {
      await postAction({ kind: "set_consent", personaId: vehicle.personaId, source, value });
      await reload();
    } catch (reason) {
      if (active.current) setError(reason instanceof Error ? reason.message : "The preference could not be updated.");
    } finally {
      if (active.current) setBusy(false);
    }
  };

  const copy = descriptions[validSection];
  return (
    <div ref={panel} className="ownership-panel" tabIndex={-1} onScroll={(e) => scrollPositions.set(keyRef.current, e.currentTarget.scrollTop)}>
      <section className="ownership-content" aria-labelledby="ownership-heading" key={validSection}>
        <header className="ownership-header">
          <p className="ownership-kicker">{copy?.label ?? "01 / Overview"}<span>{vehicle.year} Toyota {vehicle.name}</span></p>
          <h1 id="ownership-heading" tabIndex={-1}>{copy?.title ?? vehicle.headline}</h1>
          <p className="ownership-lead">{copy?.lead ?? vehicle.descriptor}</p>
        </header>
        {error && <div className="ownership-message ownership-error" role="alert"><p>{error}</p><button className="ownership-text-button" onClick={() => { setError(""); setAttempt((n) => n + 1); }}><RefreshCw size={14} /> Try again</button></div>}
        {!data && !error && <div className="ownership-loading" role="status"><span /><span /><span /><p>Loading your car’s details…</p></div>}
        {data && <>
          {validSection === "overview" && <Overview data={data} vehicle={vehicle} onSectionChange={onSectionChange} busy={busy} onConsent={changeConsent} />}
          {validSection === "finances" && <OwnershipFinances data={data} />}
          {validSection === "repairs" && <OwnershipRepairs data={data} />}
          {validSection === "driving" && <OwnershipDriving data={data} />}
          {validSection === "next-move" && <Moves data={data} onReload={reload} />}
          {validSection === "recommendations" && <Recommendations data={data} onReload={reload} onSectionChange={onSectionChange} />}
        </>}
        <footer className="ownership-footnote"><span className="ownership-demo-dot" /> Demo account · Illustrative figures, not an offer.</footer>
      </section>
    </div>
  );
}

export function OwnershipStat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return <div className="ownership-stat"><dt>{label}</dt><dd>{value}</dd>{note && <p>{note}</p>}</div>;
}

function Overview({ data, vehicle, onSectionChange, busy, onConsent }: {
  data: DashboardData; vehicle: CinematicVehicle; onSectionChange: (section: string) => void;
  busy: boolean; onConsent: (source: ConsentSource, value: boolean) => Promise<void>;
}) {
  const { persona } = data;
  return <>
    <p className="ownership-story-copy">{vehicle.summary}</p>
    <dl className="ownership-stats ownership-stats-three">
      <OwnershipStat label="Monthly payment" value={usd(persona.contract.monthlyPayment)} note={persona.contract.kind === "lease" ? "Lease payment" : "Loan payment"} />
      <OwnershipStat label="On the clock" value={`${(persona.vehicle.odometer / 1000).toFixed(1)}k`} note="Miles driven" />
      <OwnershipStat label="The road ahead" value={<>{persona.contract.monthsRemaining}<small> mo</small></>} note="On this contract" />
    </dl>
    <button className="ownership-primary" onClick={() => onSectionChange("next-move")}>See your next move <ArrowUpRight size={19} /></button>
    <div className="ownership-chapter-links">
      <button onClick={() => onSectionChange("finances")}><span><small>Understand the commitment</small>Contract & payments</span><ArrowUpRight size={20} /></button>
      <button onClick={() => onSectionChange("driving")}><span><small>See the everyday patterns</small>Life on the road</span><ArrowUpRight size={20} /></button>
    </div>
    <details className="ownership-disclosure">
      <summary>Data used for these estimates <ChevronRight size={16} /></summary>
      <p className="ownership-muted">Choose which of this car’s data informs the comparisons. Sharing with insurers is a separate choice.</p>
      <div className="ownership-consents">{(Object.keys(persona.consent) as ConsentSource[]).map((source) => <label key={source}><span>{consentLabel[source]}</span><input type="checkbox" checked={persona.consent[source]} disabled={busy} onChange={(e) => void onConsent(source, e.target.checked)} /></label>)}</div>
      {busy && <p role="status" className="ownership-small">Updating preferences…</p>}
    </details>
  </>;
}

const moveCategories = ["lease-end", "payment", "insurance", "protection"] as const;

function Moves({ data, onReload }: { data: DashboardData; onReload: () => Promise<void> }) {
  const [category, setCategory] = useState<(typeof moveCategories)[number]>(data.persona.contract.kind === "lease" ? "lease-end" : "payment");
  const engine = data.engines[category];
  const [showIneligible, setShowIneligible] = useState(false);
  const options = engine.options.filter((option) => showIneligible || option.eligible);
  return <>
    <div className="ownership-filters" aria-label="Compare option categories">{moveCategories.map((value) => <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{moveLabel[value]}</button>)}</div>
    <p className="ownership-small">{options.length} {options.length === 1 ? "option" : "options"} · Based on this car’s account</p>
    <div className="ownership-options">{options.map((option, index) => <MoveOptionRow key={option.id} option={option} data={data} onReload={onReload} number={index + 1} baseline={option.id === engine.baselineOptionId} />)}</div>
    {category === "lease-end" && data.persona.contract.kind === "lease" && <LeaseConversation personaId={data.persona.id} currentOdometer={data.persona.vehicle.odometer} onApproved={onReload} />}
    <label className="ownership-check"><input type="checkbox" checked={showIneligible} onChange={(e) => setShowIneligible(e.target.checked)} /> Show unavailable options and why</label>
    {engine.limitedBy?.length ? <p className="ownership-message">Some comparisons are limited by {engine.limitedBy.map((key) => consentLabel[key].toLowerCase()).join(" and ")} preferences. You can change these in Overview.</p> : null}
  </>;
}

function Recommendations({ data, onReload, onSectionChange }: { data: DashboardData; onReload: () => Promise<void>; onSectionChange: (section: string) => void }) {
  const all = Object.values(data.engines).flatMap((engine) => engine.options);
  const recommendations = data.ranked.map((ranked) => all.find((option) => option.id === ranked.optionId)).filter((option): option is MoveOption => Boolean(option?.eligible)).slice(0, 3);
  return <>
    <div className="ownership-recommendation-intro"><span className="ownership-red-rule" /><p>The priorities are personal.<br /><strong>The tradeoffs should be clear.</strong></p></div>
    {recommendations.length ? <div className="ownership-options">{recommendations.map((option, index) => <MoveOptionRow key={option.id} option={option} data={data} onReload={onReload} number={index + 1} featured={index === 0} />)}</div> : <div className="ownership-message"><Check size={20} /><p>You’ve reviewed the current shortlist. The full comparison is still available.</p></div>}
    <button className="ownership-text-button" onClick={() => onSectionChange("next-move")}>Compare all options <ArrowUpRight size={17} /></button>
  </>;
}

function MoveOptionRow({ option, data, onReload, number, featured = false, baseline = false }: {
  option: MoveOption; data: DashboardData; onReload: () => Promise<void>; number: number; featured?: boolean; baseline?: boolean;
}) {
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [packet, setPacket] = useState<HandoffPacket>();
  const [dismissed, setDismissed] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const isAccepted = accepted || data.preferences.accepted.some((item) => item.optionId === option.id);
  const isDismissed = dismissed || data.preferences.dismissed.some((item) => item.optionId === option.id);
  const prepare = async (mode: HandoffPacket["mode"]) => {
    setBusy(true); setError("");
    try {
      const result = await postAction({ kind: "accept", personaId: data.persona.id, optionId: option.id, mode });
      if (!result.ok || !result.packet) throw new Error("The handoff could not be prepared. Please try again.");
      setPacket(result.packet); setReview(false); setAccepted(true);
      // The confirmation stays visible; refresh the shortlist when it is closed.
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The request could not be prepared."); }
    finally { setBusy(false); }
  };
  const dismiss = async () => {
    setBusy(true); setError("");
    try {
      await postAction({ kind: "dismiss", personaId: data.persona.id, optionId: option.id, reason: "not-now" });
      setDismissed(true);
      await onReload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The choice could not be saved."); }
    finally { setBusy(false); }
  };
  return <article className={`ownership-option${featured ? " is-featured" : ""}${!option.eligible ? " is-unavailable" : ""}`}>
    <div className="ownership-option-top"><span>{String(number).padStart(2, "0")} / {moveLabel[option.moveType]}</span>{featured ? <span className="ownership-best">First to consider</span> : baseline ? <span>Current arrangement</span> : null}</div>
    <h2>{option.title}</h2>
    <p>{option.summary}</p>
    <dl className="ownership-option-numbers">
      {option.monthlyCost != null && <OwnershipStat label="Monthly" value={usd(option.monthlyCost)} />}
      {option.savingsVsBaseline != null && option.savingsVsBaseline > 0 && <OwnershipStat label={option.moveType === "insurance" ? "Possible annual savings" : "Possible total savings"} value={usd(option.savingsVsBaseline)} />}
      {option.totalCost != null && !option.savingsVsBaseline && <OwnershipStat label="Estimated total" value={usd(option.totalCost)} />}
    </dl>
    <details className="ownership-disclosure"><summary>Why this option <ChevronRight size={16} /></summary>
      <ul className="ownership-reasons">{option.tradeoffs.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      <dl className="ownership-evidence">{option.math.map((line, index) => <div key={`${line.label}-${index}`}><dt>{line.label}</dt><dd>{line.result}</dd><small>{line.formula}</small></div>)}</dl>
      <p className="ownership-small">{option.assumptions.map((item) => `${item.label}: ${item.value}`).join(" ")}</p>
    </details>
    {!option.eligible ? <p className="ownership-small">{option.ineligibleReason}</p> : packet ? <div className="ownership-message" role="status"><Check size={18} /><div><strong>Demo handoff prepared</strong><p>No transaction was made and no callback was scheduled.</p><div className="ownership-inline-actions"><button className="ownership-text-button" onClick={() => downloadText(`toyyo-${data.persona.id}-${option.id.replace(":", "-")}.txt`, `${packet.customerSummary}\n\n${packet.numbers.map((item) => `${item.label}: ${item.value}`).join("\n")}\n\n${packet.statedPreferences.join("\n")}`)}><Download size={14} /> Download summary</button><button className="ownership-text-button" onClick={() => void onReload().catch(() => setError("The options could not be refreshed."))}>Refresh options <ArrowDown size={14} /></button></div></div></div> : isAccepted ? <p className="ownership-saved"><Check size={15} /> Added to this demo’s next steps</p> : isDismissed ? <p className="ownership-small">Set aside for now.</p> : review ? <div className="ownership-confirm">
      <h3>Prepare a demo next step</h3><p>This creates a review summary in the demo. It does not change the account, contact a provider, or schedule a callback.</p>
      <div className="ownership-inline-actions">
        {!/hardship/i.test(option.id) && <button className="ownership-primary" disabled={busy} onClick={() => void prepare("self-service")}>{busy ? "Preparing…" : "Prepare summary"}<ArrowUpRight size={16} /></button>}
        <button className="ownership-secondary" disabled={busy} onClick={() => void prepare("specialist-callback")}>{busy ? "Preparing…" : "Prepare specialist review"}</button>
        <button className="ownership-text-button" disabled={busy} onClick={() => setReview(false)}>Cancel</button>
      </div>
    </div> : !baseline && <div className="ownership-inline-actions"><button className="ownership-text-button" onClick={() => setReview(true)}>Review this move <ArrowUpRight size={16} /></button><button className="ownership-text-button ownership-subtle" disabled={busy} onClick={() => void dismiss()}>{busy ? "Saving…" : "Not now"}</button></div>}
    {error && <p className="ownership-error" role="alert">{error}</p>}
  </article>;
}

export function downloadText(filename: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
