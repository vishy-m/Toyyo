"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { postWhatIf } from "@/lib/client/api";
import { categoryLabel, miles, monthLabel, prettyDates, shortDate, usd } from "@/lib/client/format";
import { analyzeRepairDecision, type RepairAdvisorInput } from "@/lib/engines/repair-advisor";
import type { DashboardData, EngineResult, MoveOption, TripCategory } from "@/lib/types";

function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return <div className="ownership-stat"><dt>{label}</dt><dd>{value}</dd>{note && <p>{note}</p>}</div>;
}

function Block({ title, kicker, children }: { title: string; kicker?: string; children: ReactNode }) {
  return <section className="ownership-block">
    {kicker && <p className="ownership-block-kicker">{kicker}</p>}
    <h2>{title}</h2>
    {children}
  </section>;
}

function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return <details className="ownership-disclosure"><summary>{summary} <ChevronRight size={16} aria-hidden /></summary>{children}</details>;
}

const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][(n % 100 - 20) % 10] ?? ["th", "st", "nd", "rd"][n % 100] ?? "th"}`;

/** Runs a what-if after a short pause; ignores stale replies. */
export function useScenario(personaId: DashboardData["persona"]["id"], moveType: "lease-end" | "payment" | "insurance", overrides: Record<string, number>, enabled: boolean) {
  const [result, setResult] = useState<EngineResult>();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const key = JSON.stringify(overrides);
  useEffect(() => {
    if (!enabled) return;
    let stale = false;
    const timer = window.setTimeout(() => {
      setState("loading");
      postWhatIf({ personaId, moveType, overrides: JSON.parse(key) as Record<string, number> })
        .then((next) => { if (!stale) { setResult(next); setState("idle"); } })
        .catch(() => { if (!stale) setState("error"); });
    }, 280);
    return () => { stale = true; window.clearTimeout(timer); };
  }, [personaId, moveType, key, enabled]);
  return { result, state };
}

/* ───────────────────────── Finances ───────────────────────── */

export function OwnershipFinances({ data }: { data: DashboardData }) {
  const { persona, cashflow } = data;
  const c = persona.contract;
  const years = Math.floor(c.monthsRemaining / 12);
  const rest = c.monthsRemaining % 12;
  const remaining = c.monthsRemaining === 0 ? "Ends now" : [years ? `${years} yr` : "", rest ? `${rest} mo` : ""].filter(Boolean).join(" ");
  return <>
    <dl className="ownership-stats">
      <Stat label="Monthly payment" value={usd(c.monthlyPayment)} note={c.kind === "lease" ? "Lease" : "Loan"} />
      <Stat label="Time remaining" value={remaining} note={`of ${c.termMonths} months`} />
      {c.kind === "loan"
        ? <Stat label="Remaining principal" value={usd(c.principalRemaining)} note={`${c.apr}% APR`} />
        : <Stat label="Residual / buyout" value={usd(c.residualValue)} note={`plus ${usd(c.purchaseOptionFee)} purchase fee`} />}
      <Stat label="Insurance" value={<>{usd(persona.insurance.monthlyPremium)}<small> /mo</small></>} note={persona.insurance.carrier.replace(" (simulated)", "")} />
    </dl>
    <ul className="ownership-rows">
      {c.kind === "lease"
        ? <>
          <li><span>Mileage allowance</span><strong>{c.annualMileageAllowance.toLocaleString("en-US")} mi / year</strong></li>
          <li><span>Over the allowance</span><strong>{usd(c.overageRatePerMile, { cents: true })} per mile</strong></li>
          <li><span>Return (disposition) fee</span><strong>{usd(c.dispositionFee)}</strong></li>
        </>
        : <>
          <li><span>Autopay</span><strong>{c.autopay ? "On" : "Off"}</strong></li>
          {cashflow && <li><span>Payment due</span><strong>Day {cashflow.paymentDueDay} of the month</strong></li>}
        </>}
      {cashflow
        ? <>
          {c.kind === "lease" && <li><span>Payment due</span><strong>Day {cashflow.paymentDueDay} of the month</strong></li>}
          <li><span>Average account balance</span><strong>{usd(cashflow.avgBalance)}</strong></li>
          <li><span>Late payments, last 12 months</span><strong>{cashflow.latePaymentsLast12}</strong></li>
          {cashflow.recurringShortfall && <li><span>Cash flow</span><strong>Recurring shortfall noticed</strong></li>}
        </>
        : <li><span>Cash flow</span><strong className="ownership-dim">Banking data is off</strong></li>}
    </ul>
    {!cashflow && <p className="ownership-small">Cash-flow context needs banking data. You can turn it on under “Data used for these estimates” in Overview.</p>}
    {c.kind === "lease" ? <LeaseScenario data={data} /> : <LoanScenario data={data} cashflowDay={cashflow?.paymentDueDay} />}
  </>;
}

function LeaseScenario({ data }: { data: DashboardData }) {
  const id = useId();
  const base = Math.round(data.driving.avgMonthlyMiles / 100) * 100 || 1000;
  const [monthly, setMonthly] = useState(base);
  const { result, state } = useScenario(data.persona.id, "lease-end", { monthlyMiles: monthly }, true);
  const ret = result?.options.find((o) => o.id === "lease-end:return");
  const buyout = result?.options.find((o) => o.id === "lease-end:buyout");
  const allowance = (data.persona.contract.kind === "lease" ? data.persona.contract.annualMileageAllowance : 12000) / 12;
  return <Block title="Try a mileage scenario" kicker="Scenario · estimate">
    <p className="ownership-lead-small">If you drove a different number of miles each month until the lease ends, what would the return cost?</p>
    <div className="ownership-control">
      <label htmlFor={id}>Miles per month <strong>{monthly.toLocaleString("en-US")}</strong></label>
      <input id={id} type="range" min={300} max={2800} step={100} value={monthly} onChange={(e) => setMonthly(Number(e.target.value))} aria-describedby={`${id}-n`} />
      <p id={`${id}-n`} className="ownership-small">Allowance is about {Math.round(allowance).toLocaleString("en-US")} mi a month. Recent driving: {Math.round(data.driving.avgMonthlyMiles).toLocaleString("en-US")} mi a month.</p>
    </div>
    <div className="ownership-result" aria-live="polite" data-loading={state === "loading"}>
      {ret ? <dl className="ownership-stats">
        <Stat label="Estimated return invoice" value={usd(ret.totalCost ?? 0)} note="Excess miles plus fees" />
        {buyout?.monthlyCost != null && <Stat label="Buyout, financed" value={<>{usd(buyout.monthlyCost)}<small> /mo</small></>} />}
      </dl> : state === "error" ? <p className="ownership-small">The estimate could not be refreshed.</p> : <p className="ownership-small">Calculating…</p>}
      {ret && <p className="ownership-small">{ret.summary} This is an estimate from simulated terms, not a quote.</p>}
    </div>
  </Block>;
}

function LoanScenario({ data, cashflowDay }: { data: DashboardData; cashflowDay?: number }) {
  const id = useId();
  const [extra, setExtra] = useState(100);
  const [day, setDay] = useState(cashflowDay ?? 15);
  const overrides = useMemo(() => ({ extraPrincipal: extra, paymentDueDay: day }), [extra, day]);
  const { result, state } = useScenario(data.persona.id, "payment", overrides, true);
  const extraOpt: MoveOption | undefined = result?.options.find((o) => o.id === "payment:extra-principal");
  const dueOpt = result?.options.find((o) => o.id === "payment:due-date");
  return <Block title="Try a payment scenario" kicker="Scenario · estimate">
    <p className="ownership-lead-small">Adjust what you pay or when it is due and see the estimated effect on this loan.</p>
    <div className="ownership-control">
      <label htmlFor={`${id}-x`}>Extra toward principal <strong>{usd(extra)} / month</strong></label>
      <input id={`${id}-x`} type="range" min={0} max={500} step={25} value={extra} onChange={(e) => setExtra(Number(e.target.value))} />
    </div>
    <div className="ownership-control">
      <label htmlFor={`${id}-d`}>Payment due day</label>
      <select id={`${id}-d`} value={day} onChange={(e) => setDay(Number(e.target.value))}>
        {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{ordinal(d)} of the month</option>)}
      </select>
    </div>
    <div className="ownership-result" aria-live="polite" data-loading={state === "loading"}>
      {result ? <>
        {extra > 0 && extraOpt
          ? <dl className="ownership-stats">
            <Stat label="Monthly with extra" value={usd(extraOpt.monthlyCost ?? 0)} />
            {extraOpt.savingsVsBaseline != null && <Stat label="Interest saved" value={usd(extraOpt.savingsVsBaseline)} />}
          </dl>
          : <p className="ownership-small">Add an extra amount to see the interest it could save.</p>}
        {extra > 0 && extraOpt && <p className="ownership-small">{extraOpt.summary}</p>}
        {dueOpt && day !== cashflowDay && <p className="ownership-small">{dueOpt.summary}</p>}
        <p className="ownership-small">Estimates from simulated terms, not a quote.</p>
      </> : state === "error" ? <p className="ownership-small">The estimate could not be refreshed.</p> : <p className="ownership-small">Calculating…</p>}
    </div>
  </Block>;
}

/* ───────────────────────── Repairs ───────────────────────── */

const quickPicks = ["Brakes squealing", "Slow to start, weak battery", "A/C blowing warm", "Check engine light, rough idle", "Worn tires"];
const pathLabel = { keep: "Repair and keep", trade: "Trade in", refinance: "Refinance" } as const;

export function OwnershipRepairs({ data }: { data: DashboardData }) {
  const { persona, cashflow, engines } = data;
  const id = useId();
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState("");
  const result = useRef<HTMLDivElement>(null);
  const care = engines.protection.options.find((o) => o.id === "protection:current");
  const extras = engines.protection.options.filter((o) => o.id !== "protection:current");
  const expiry = care?.math.find((m) => /projected expiry/i.test(m.label))?.result;
  const monthsLeft = care?.math.find((m) => /months of toyotacare/i.test(m.label))?.result;
  const expired = /expired/i.test(care?.summary ?? "");

  const decision = useMemo(() => {
    if (!submitted) return undefined;
    const c = persona.contract;
    const input: RepairAdvisorInput = {
      vehicle: { year: persona.vehicle.year, model: persona.vehicle.model, mileage: persona.vehicle.odometer },
      issue: submitted,
      loanBalance: c.kind === "loan" ? c.principalRemaining : 0,
      currentPayment: c.monthlyPayment,
      currentApr: c.kind === "loan" ? c.apr : 7.5,
      savings: cashflow ? Math.round(cashflow.avgBalance * 1.5) : 5000,
      monthlySurplus: cashflow ? Math.max(300, Math.round(cashflow.avgBalance * 0.18)) : 700,
      downPayment: 3000,
      credit: persona.creditTier,
      keepYears: 3,
    };
    return analyzeRepairDecision(input);
  }, [submitted, persona, cashflow]);

  const run = (value: string) => {
    const v = value.trim();
    if (!v) return;
    setText(v);
    setSubmitted(v);
    window.setTimeout(() => result.current?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), 50);
  };
  const onSubmit = (e: FormEvent) => { e.preventDefault(); run(text); };

  return <>
    <Block title="Maintenance and coverage" kicker="ToyotaCare">
      {care ? <>
        <p className={`ownership-status${expired ? " is-ended" : ""}`}>
          <span className="ownership-status-dot" aria-hidden />
          {expired ? `Complimentary ToyotaCare maintenance has ended for this ${persona.vehicle.year} ${persona.vehicle.model}.` : prettyDates(care.summary).replace(/(\d+\.\d+) months/, (_, n: string) => `${Math.round(parseFloat(n) * 10) / 10} months`)}
        </p>
        <ul className="ownership-rows">
          {expiry && <li><span>{expired ? "Ended" : "Projected end"}</span><strong>{shortDate(expiry)}, {expiry.slice(0, 4)}</strong></li>}
          {monthsLeft && !expired && <li><span>Time left</span><strong>{monthsLeft.replace(/(\d+(\.\d+)?)/, (n) => String(Math.round(parseFloat(n) * 10) / 10))}</strong></li>}
          <li><span>Odometer</span><strong>{miles(persona.vehicle.odometer)}</strong></li>
          <li><span>Plan limit</span><strong>24 months or 25,000 mi</strong></li>
        </ul>
        <p className="ownership-small">ToyotaCare covers scheduled maintenance. It is not a repair warranty.</p>
      </> : <p className="ownership-small">Coverage details are not available.</p>}
    </Block>

    <Block title="Describe a concern" kicker="Repair advisor · illustrative">
      <form className="ownership-form" onSubmit={onSubmit}>
        <label htmlFor={id}>What is the car doing?</label>
        <div className="ownership-field">
          <input id={id} type="text" value={text} maxLength={140} placeholder="For example, brakes squeal when stopping" onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="ownership-primary" disabled={!text.trim()}>Estimate</button>
        </div>
        <div className="ownership-chips" role="group" aria-label="Common concerns">
          {quickPicks.map((q) => <button type="button" key={q} aria-pressed={submitted === q} onClick={() => run(q)}>{q}</button>)}
        </div>
      </form>
      <div ref={result} aria-live="polite">
        {decision && <div className="ownership-decision">
          <p className="ownership-block-kicker">{decision.estimate.label}</p>
          <p className="ownership-range">{usd(decision.estimate.low)}<span> to </span>{usd(decision.estimate.high)}</p>
          <p className="ownership-small">
            {decision.estimate.needsInspection
              ? "We could not match this to a common repair. A shop inspection comes first; the range is a placeholder."
              : "Illustrative range for this car’s age and mileage. A shop quote is what counts."}
          </p>
          <h3>Keep, trade, or refinance</h3>
          <div className="ownership-options">
            {decision.options.map((o) => <article key={o.path} className={`ownership-option${o.path === decision.recommendation ? " is-featured" : ""}${!o.eligible ? " is-unavailable" : ""}`}>
              <div className="ownership-option-top"><span>{pathLabel[o.path]}</span>{o.path === decision.recommendation && <span className="ownership-best">Lowest eligible monthly</span>}</div>
              <p>{o.summary}</p>
              {o.eligible && <dl className="ownership-option-numbers">
                <Stat label="Monthly" value={usd(o.monthly)} />
                <Stat label="Up front" value={usd(o.upfront)} />
              </dl>}
            </article>)}
          </div>
          <Disclosure summary="Assumptions and reasoning">
            <ul className="ownership-reasons">{decision.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            <ul className="ownership-reasons">
              <li>Estimated private-sale value {usd(decision.privateSaleValue)}; trade-in {usd(decision.tradeInValue)}.</li>
              <li>Keep path spreads the repair over 3 years and adds a maintenance reserve.</li>
              <li>Refinance assumes 60 months at a rate based on a {persona.creditTier} credit tier.</li>
              <li>{cashflow ? "Savings and surplus are inferred from the average account balance." : "Banking data is off, so savings and surplus use generic placeholders."}</li>
              {decision.replacements[0] && <li>Trade-in example: {decision.replacements[0].name}, about {usd(decision.replacements[0].monthly)} a month.</li>}
            </ul>
          </Disclosure>
        </div>}
      </div>
    </Block>

    {extras.length > 0 && <Block title="Protection options" kicker="Optional coverage">
      <ul className="ownership-rows ownership-rows-tall">
        {extras.map((o) => <li key={o.id}><span><strong>{o.title}</strong><small>{o.summary}</small></span><strong>{o.monthlyCost != null ? <>{usd(o.monthlyCost)}<small> /mo</small></> : "—"}</strong></li>)}
      </ul>
      <p className="ownership-small">Simulated prices. Value depends on deductibles and exclusions; no savings are guaranteed.</p>
    </Block>}
  </>;
}

/* ───────────────────────── Driving ───────────────────────── */

export function OwnershipDriving({ data }: { data: DashboardData }) {
  const { driving, trips, tripInsights, persona } = data;
  const [all, setAll] = useState(false);
  const empty = driving.totalMiles === 0 && trips.length === 0;
  if (empty) {
    return <div className="ownership-empty">
      <h2>{persona.consent.driving ? "No trips yet" : "Driving data is off"}</h2>
      <p>{persona.consent.driving
        ? "There are no recorded trips for this car yet."
        : "Mileage, the driving score and trips are hidden because driving data sharing is off for this car."}</p>
      <p className="ownership-small">Turn it on under “Data used for these estimates” in Overview. Next move and Recommendations will use it too.</p>
    </div>;
  }
  const maxMonth = Math.max(1, ...driving.monthlyMiles.map((m) => m.miles));
  const cats = (Object.entries(driving.categoryMiles) as [TripCategory, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const catMax = Math.max(1, ...cats.map(([, v]) => v));
  const peak = driving.monthlyMiles.reduce((a, b) => (b.miles > a.miles ? b : a), driving.monthlyMiles[0]);
  const recent = [...trips].sort((a, b) => b.start.localeCompare(a.start));
  const shown = all ? recent.slice(0, 40) : recent.slice(0, 6);
  const factors = [...driving.scoreFactors].filter((f) => f.impact !== 0).sort((a, b) => a.impact - b.impact).slice(0, 4);
  const factorMax = Math.max(1, ...factors.map((f) => Math.abs(f.impact)));
  return <>
    <dl className="ownership-stats ownership-stats-three">
      <Stat label="Driving score" value={<>{driving.score}<small> / 100</small></>} note="Synthetic, mileage-weighted" />
      <Stat label="Average month" value={<>{Math.round(driving.avgMonthlyMiles).toLocaleString("en-US")}<small> mi</small></>} note={`${driving.windowDays}-day window`} />
      <Stat label="Smooth streak" value={driving.smoothStreak} note="trips scoring 90+" />
    </dl>

    {factors.length > 0 && <Block title="What moves the score">
      <ul className="ownership-bars">
        {factors.map((f) => <li key={f.factor}>
          <div className="ownership-bar-head"><span>{f.factor}</span><strong>−{Math.abs(f.impact).toFixed(1)} pts</strong></div>
          <div className="ownership-bar"><i style={{ width: `${Math.max(3, (Math.abs(f.impact) / factorMax) * 100)}%` }} data-top={f === factors[0]} /></div>
        </li>)}
      </ul>
      <p className="ownership-small">Deductions over the last {driving.windowDays} days. Smaller is better.</p>
    </Block>}

    <Block title="Miles by month">
      <ul className="ownership-columns" aria-label="Monthly miles">
        {driving.monthlyMiles.map((m) => <li key={m.month}>
          <span className="ownership-col-value">{Math.round(m.miles).toLocaleString("en-US")}</span>
          <i style={{ height: `${Math.max(4, (m.miles / maxMonth) * 100)}%` }} data-top={m.month === peak?.month} />
          <span className="ownership-col-label">{monthLabel(m.month)}</span>
        </li>)}
      </ul>
      <p className="ownership-small">Busiest month: {peak ? `${monthLabel(peak.month)}, ${miles(peak.miles)}` : "n/a"}. Earlier months may be extrapolated from the recent pattern.</p>
    </Block>

    {cats.length > 0 && <Block title="Miles by trip type">
      <ul className="ownership-bars">
        {cats.map(([k, v]) => <li key={k}>
          <div className="ownership-bar-head"><span>{categoryLabel[k]}</span><strong>{miles(v)}</strong></div>
          <div className="ownership-bar"><i style={{ width: `${Math.max(3, (v / catMax) * 100)}%` }} /></div>
        </li>)}
      </ul>
    </Block>}

    {tripInsights.length > 0 && <Block title="Patterns noticed">
      <ul className="ownership-reasons">{tripInsights.map((t) => <li key={t.id}>{t.text}</li>)}</ul>
    </Block>}

    {recent.length > 0 && <Block title="Recent trips">
      <ul className="ownership-trips">
        {shown.map((t) => <li key={t.id}>
          <span><strong>{t.destinationLabel}</strong><small>{shortDate(t.start)} · {categoryLabel[t.category]}</small></span>
          <span className="ownership-trip-miles">{miles(t.miles)}</span>
          <span className="ownership-trip-score" aria-label={`Trip score ${t.score}`}>{t.score}</span>
        </li>)}
      </ul>
      {recent.length > 6 && <button className="ownership-text-button" onClick={() => setAll((v) => !v)}>{all ? "Show fewer trips" : `Show more trips (${Math.min(40, recent.length) - 6} more)`}</button>}
    </Block>}
  </>;
}
