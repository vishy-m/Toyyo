"use client";

import { ArrowLeft, Percent } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { caseView } from "@/lib/cinematic/case-view";
import { consentLabel, usd } from "@/lib/client/format";
import type { DashboardData, MoveOption } from "@/lib/types";
import { useScenario } from "./OwnershipTools";
import { useConsentToggle } from "./use-consent";

interface Props {
  data: DashboardData;
  backHref: string;
  onBack(): void;
  onReload(): void;
}

const money = (n: number) => (n < 0 ? `−${usd(-n, { cents: !Number.isInteger(n) })}` : usd(n, { cents: !Number.isInteger(n) }));
const ordinal = (n: number) => {
  const mod100 = n % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th");
  return `${n}${suffix}`;
};

export function FinancesPage({ data, backHref, onBack, onReload }: Props) {
  const { persona, cashflow, caseFile } = data;
  const c = persona.contract;
  const consent = useConsentToggle(persona.id, onReload);
  const view = caseFile ? caseView(data, caseFile) : undefined;
  const pack = caseFile?.source === "pack";
  const bestId = caseFile?.bestMove.optionId;
  const options = (view?.options ?? [])
    .filter((option) => option.eligibility === "Y" || option.eligibility === "Review")
    .sort((a, b) => Number(b.optionId === bestId) - Number(a.optionId === bestId));
  const refinance = data.engines.payment.options.find((option) => option.id === "payment:refinance");
  const years = Math.floor(c.monthsRemaining / 12);
  const rest = c.monthsRemaining % 12;
  const remaining = c.monthsRemaining === 0 ? "Ends now" : [years ? `${years} yr` : "", rest ? `${rest} mo` : ""].filter(Boolean).join(" ");

  useEffect(() => {
    document.getElementById("finances-heading")?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="fin">
      <div className="dash-bar-row">
      <a className="dash-back" href={backHref} onClick={(event) => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onBack(); } }}>
        <ArrowLeft size={18} aria-hidden="true" /> Back to dashboard
      </a>
      <h2 id="finances-heading" tabIndex={-1} className="dash-page-title"><Percent size={22} aria-hidden="true" /> Finances</h2>
      </div>

      <dl className="fin-stats">
        <div><dt>Monthly payment</dt><dd>{usd(c.monthlyPayment)}<small> {c.kind === "lease" ? "lease" : "loan"}</small></dd></div>
        <div><dt>Time remaining</dt><dd className="is-text">{remaining}<small> of {c.termMonths} mo</small></dd></div>
        {c.kind === "loan"
          ? <div><dt>Principal left</dt><dd>{usd(c.principalRemaining)}<small> {c.apr}% APR</small></dd></div>
          : <div><dt>Residual</dt><dd>{usd(c.residualValue)}<small> plus {usd(c.purchaseOptionFee)} fee</small></dd></div>}
        <div><dt>Insurance</dt><dd>{usd(persona.insurance.monthlyPremium)}<small> /mo</small></dd></div>
      </dl>

      <div className="fin-split">
      <ul className="fin-rows">
        {c.kind === "lease" ? (
          <>
            <li><span>Mileage allowance</span><strong>{c.annualMileageAllowance.toLocaleString("en-US")} mi / year</strong></li>
            <li><span>Over the allowance</span><strong>{usd(c.overageRatePerMile, { cents: true })} / mi</strong></li>
            <li><span>Return fee</span><strong>{usd(c.dispositionFee)}</strong></li>
          </>
        ) : (
          <li><span>Autopay</span><strong>{c.autopay ? "On" : "Off"}</strong></li>
        )}
        <li><span>Payment due</span><strong>{cashflow ? `${ordinal(cashflow.paymentDueDay)} of the month` : "Banking data is off"}</strong></li>
        {cashflow && <li><span>Average balance</span><strong>{usd(cashflow.avgBalance)}</strong></li>}
        {cashflow && <li><span>Late payments, last 12 months</span><strong>{cashflow.latePaymentsLast12}</strong></li>}
      </ul>

      <div className="fin-col">
      {pack && caseFile && (
        <p className="fin-best"><span className="dash-label">Best next move</span><strong>{caseFile.bestMove.title}</strong>{caseFile.bestMove.message}</p>
      )}

      {!pack && c.kind === "loan" && refinance && <Refinance option={refinance} />}

      {c.kind === "lease" ? <LeaseScenario data={data} /> : <LoanScenario data={data} />}
      {pack && <p className="dash-muted">These sliders use the calculator, not the case’s own figures, so numbers can differ from the options below. Taxes and registration are extra.</p>}
      </div>
      </div>

      {options.length > 0 && (
        <section className="fin-options" aria-labelledby="fin-options-h">
          <h3 id="fin-options-h" className="dash-label">Options in this case</h3>
          {view?.specialist && <p className="dash-muted">{view.specialistReason}</p>}
          <ul>
            {options.map((option) => (
              <li key={option.optionId} className="fin-opt">
                <strong>{option.optionName}{option.optionId === bestId && <span className="fin-pick">Best move</span>}</strong>
                <p>{option.plainLanguageSummary}</p>
                <p className="fin-nums">
                  {option.newMonthlyPayment != null && <span>New payment <b>{money(option.newMonthlyPayment)}/mo</b></span>}
                  {option.upfrontCost != null && <span>Upfront <b>{money(option.upfrontCost)}</b></span>}
                  {option.totalCostVsKeepAsIs != null && <span>Vs. keeping as is <b>{money(option.totalCostVsKeepAsIs)}</b></span>}
                  <span>{option.eligibility === "Review" ? "Needs review" : "Eligible"}</span>
                </p>
                <p className="dash-muted">Trade-off: {option.tradeoff}{option.eligibility === "Review" ? " Needs a person to confirm." : ""}</p>
                <p className="dash-muted">Assumes: {option.keyAssumption}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <label className="dash-check">
        <input type="checkbox" checked={persona.consent.banking} disabled={consent.busy} onChange={(event) => void consent.setConsent("banking", event.target.checked)} />
        {consentLabel.banking}
      </label>
      {consent.error && <p className="dash-muted" role="alert">{consent.error}</p>}
      <p className="dash-muted">Illustrative demo estimates, not an offer. Taxes and registration are extra.</p>
    </div>
  );
}

function LeaseScenario({ data }: { data: DashboardData }) {
  const id = useId();
  const allowance = (data.persona.contract.kind === "lease" ? data.persona.contract.annualMileageAllowance : 12000) / 12;
  const base = Math.round((data.driving.avgMonthlyMiles || allowance) / 100) * 100 || 1000;
  const [monthly, setMonthly] = useState(Math.min(2800, Math.max(300, base)));
  const { result, state } = useScenario(data.persona.id, "lease-end", { monthlyMiles: monthly }, true);
  const ret = result?.options.find((option) => option.id === "lease-end:return");
  const buyout = result?.options.find((option) => option.id === "lease-end:buyout");
  return (
    <div className="fin-scenario">
      <h3 className="dash-label">Try a mileage scenario</h3>
      <label htmlFor={id}>Miles per month <strong>{monthly.toLocaleString("en-US")}</strong></label>
      <input id={id} type="range" min={300} max={2800} step={100} value={monthly} onChange={(event) => setMonthly(Number(event.target.value))} />
      <p className="dash-muted" aria-live="polite">
        {state === "error" ? "The estimate could not be refreshed."
          : ret ? `Estimated return invoice ${usd(ret.totalCost ?? 0)}.${buyout?.monthlyCost != null ? ` Buying it out and financing it: about ${usd(buyout.monthlyCost)}/mo.` : ""}`
          : "Calculating…"}
        {" "}Allowance is about {Math.round(allowance).toLocaleString("en-US")} mi a month.
      </p>
    </div>
  );
}

function LoanScenario({ data }: { data: DashboardData }) {
  const id = useId();
  const cashflowDay = data.cashflow?.paymentDueDay;
  const [extra, setExtra] = useState(100);
  const [day, setDay] = useState(cashflowDay ?? 15);
  const overrides = useMemo(() => ({ extraPrincipal: extra, paymentDueDay: day }), [extra, day]);
  const { result, state } = useScenario(data.persona.id, "payment", overrides, true);
  const extraOpt = result?.options.find((option) => option.id === "payment:extra-principal");
  const dueOpt = result?.options.find((option) => option.id === "payment:due-date");
  return (
    <div className="fin-scenario">
      <h3 className="dash-label">Try a payment scenario</h3>
      <label htmlFor={`${id}-x`}>Extra toward principal <strong>{usd(extra)} / month</strong></label>
      <input id={`${id}-x`} type="range" min={0} max={500} step={25} value={extra} onChange={(event) => setExtra(Number(event.target.value))} />
      <label htmlFor={`${id}-d`}>Payment due day</label>
      <select id={`${id}-d`} value={day} onChange={(event) => setDay(Number(event.target.value))}>
        {Array.from({ length: 28 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{ordinal(value)} of the month</option>)}
      </select>
      <p className="dash-muted" aria-live="polite">
        {state === "error" ? "The estimate could not be refreshed." : extra > 0 && extraOpt
          ? `${extraOpt.summary}${extraOpt.savingsVsBaseline != null ? ` Interest saved about ${usd(extraOpt.savingsVsBaseline)}.` : ""}`
          : "Add an extra amount to see the interest it could save."}
        {dueOpt && day !== cashflowDay ? ` ${dueOpt.summary}` : ""}
        {" "}An estimate, not a quote.
      </p>
    </div>
  );
}

function Refinance({ option }: { option: MoveOption }) {
  return (
    <section className="fin-refi" aria-labelledby="fin-refi-h">
      <h3 id="fin-refi-h" className="dash-label">Refinance</h3>
      {option.eligible ? (
        <>
          <p>{option.summary}</p>
          <p className="fin-nums">
            {option.monthlyCost != null && <span>New payment <b>{usd(option.monthlyCost)}/mo</b></span>}
            {option.savingsVsBaseline != null && <span>Net saving <b>{usd(option.savingsVsBaseline)}</b></span>}
          </p>
          <ul className="fin-assume">
            {option.assumptions.slice(0, 4).map((a) => <li key={a.label}><span>{a.label}</span><span>{a.value}</span></li>)}
          </ul>
        </>
      ) : <p className="dash-muted">{option.ineligibleReason ?? "Refinancing isn’t available right now."}</p>}
      <p className="dash-muted">A simulated rate and an estimate, not an offer.</p>
    </section>
  );
}
