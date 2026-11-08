"use client";

import clsx from "clsx";
import { Lock } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { useOverlayStore } from "@/lib/client/overlay-store";
import type { CashflowSummary, DashboardData } from "@/lib/types";
import { AskButton } from "./AskButton";

const paydayText: Record<CashflowSummary["payday"], string> = {
  "biweekly-fri": "Every other Friday",
  "semimonthly-1-15": "1st and 15th",
  "monthly-1": "1st of the month",
};

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function Limited({ what, source }: { what: string; source: string }) {
  const open = useOverlayStore((s) => s.setConsentOpen);
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-line-2 p-4 text-sm">
      <Lock size={16} className="mt-0.5 shrink-0 text-warn" />
      <div>
        <p className="font-medium text-ink">Limited: {source} off</p>
        <p className="mt-0.5 text-ink-2">{what}</p>
        <button type="button" onClick={() => open(true)} className="mt-2 text-[13px] font-medium text-ink underline decoration-line-2 underline-offset-4 hover:decoration-ink">
          Manage your data
        </button>
      </div>
    </div>
  );
}

/** Last 12 payments as a row of marks: filled = on time, hollow red ring = late. */
function PaymentMarks({ late }: { late: number }) {
  // place late payments deterministically in the older half so the recent streak reads clearly
  const lateIdx = new Set(Array.from({ length: late }, (_, i) => 2 + i * 3));
  return (
    <div className="flex items-end gap-1.5" role="img" aria-label={`Last 12 payments: ${12 - late} on time, ${late} late`}>
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className={clsx("h-7 flex-1 rounded-[5px]", lateIdx.has(i) ? "border-2 border-accent bg-transparent" : "bg-ink/80")}
          style={{ opacity: lateIdx.has(i) ? 1 : 0.35 + (i / 12) * 0.65 }}
        />
      ))}
    </div>
  );
}

export function MoneyCard({ data }: { data?: DashboardData }) {
  if (!data) return <Skeleton className="h-[260px] rounded-xl" />;
  const { persona, cashflow } = data;
  const late = cashflow?.latePaymentsLast12 ?? 0;
  const ins = persona.insurance;
  const ubi = data.engines.insurance.options.find((o) => o.id !== data.engines.insurance.baselineOptionId && o.eligible);
  const dueMismatch = cashflow && cashflow.payday === "biweekly-fri" && cashflow.paymentDueDay < 8;

  return (
    <Panel id="w-money" title="Payments and insurance" aside={<AskButton widget="money" />}>
      <div className="space-y-6">
        <div>
          <div className="mb-2.5 flex items-baseline justify-between text-sm">
            <span className="text-ink-2">Last 12 payments</span>
            {persona.consent.paymentHistory ? (
              <span className={clsx("font-medium", late ? "text-warn" : "text-good")}>{late ? `${late} late` : "All on time"}</span>
            ) : null}
          </div>
          {persona.consent.paymentHistory ? (
            <PaymentMarks late={late} />
          ) : (
            <Limited source="payment history" what="Turn it on to see on-time streaks and refinance eligibility." />
          )}
        </div>

        <div>
          <div className="mb-2.5 text-sm text-ink-2">Cash flow</div>
          {cashflow ? (
            <dl className="grid grid-cols-3 gap-3">
              <div>
                <dt className="text-xs text-ink-3">Payday</dt>
                <dd className="mt-1 text-sm font-medium text-ink">{paydayText[cashflow.payday]}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Payment due</dt>
                <dd className={clsx("mt-1 text-sm font-medium", dueMismatch ? "text-warn" : "text-ink")}>The {ordinal(cashflow.paymentDueDay)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Avg balance</dt>
                <dd className="num mt-1 text-sm font-semibold text-ink">
                  $<AnimatedNumber value={cashflow.avgBalance} />
                </dd>
              </div>
            </dl>
          ) : (
            <Limited source="banking data" what="Without it we can't line your due date up with payday." />
          )}
        </div>

        <div>
          <div className="mb-2.5 text-sm text-ink-2">Insurance</div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="num text-2xl font-semibold text-ink">
                $<AnimatedNumber value={ins.monthlyPremium} />
                <span className="text-sm font-medium text-ink-3">/mo</span>
              </div>
              <div className="mt-0.5 text-xs text-ink-3">{ins.carrier}</div>
            </div>
            {ubi?.monthlyCost != null && (
              <div className="text-right">
                <div className={clsx("num text-lg font-semibold", ubi.monthlyCost < ins.monthlyPremium ? "text-good" : "text-warn")}>
                  ${Math.round(ubi.monthlyCost)}
                  <span className="text-xs font-medium text-ink-3">/mo</span>
                </div>
                <div className="text-xs text-ink-3">usage-based quote</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
