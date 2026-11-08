"use client";

import { spring, transition as motionTransition, useShouldReduceMotion, useTempoTransition } from "@animate-ui/react/utils/motion";
import clsx from "clsx";
import { motion } from "motion/react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Chip } from "@/components/ui/Chip";
import { Panel } from "@/components/ui/Panel";
import { Ring } from "@/components/ui/Ring";
import { Skeleton } from "@/components/ui/Skeleton";
import { usd } from "@/lib/client/format";
import { leaseFacts } from "@/lib/client/lease";
import { useUiStore } from "@/lib/client/ui-store";
import type { DashboardData } from "@/lib/types";
import { AskButton } from "./AskButton";

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="num mt-1 truncate text-lg font-semibold text-ink">{children}</dd>
    </div>
  );
}

export function ContractCard({ data }: { data?: DashboardData }) {
  const whatIfMiles = useUiStore((s) => s.whatIf.monthlyMiles);
  if (!data) return <Skeleton className="h-[260px] rounded-xl" />;
  const c = data.persona.contract;
  const elapsed = c.termMonths - c.monthsRemaining;
  const lease = leaseFacts(data, whatIfMiles);

  return (
    <Panel id="w-contract" title={c.kind === "lease" ? "Lease" : "Loan"} aside={<AskButton widget="contract" />}>
      <div className="flex items-center gap-5">
        <Ring value={elapsed / c.termMonths} label={`${c.monthsRemaining} of ${c.termMonths} months left`} tone={c.kind === "lease" && c.monthsRemaining <= 6 ? "warn" : "ink"}>
          <div>
            <div className="num text-2xl leading-none font-semibold text-ink">
              <AnimatedNumber value={c.monthsRemaining} />
            </div>
            <div className="mt-0.5 text-[11px] text-ink-3">mo left</div>
          </div>
        </Ring>
        <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3">
          <Stat label="Monthly payment">
            $<AnimatedNumber value={c.monthlyPayment} format={(n) => n.toLocaleString("en-US", { maximumFractionDigits: 0 })} />
          </Stat>
          {c.kind === "loan" ? (
            <>
              <Stat label="APR">{c.apr}%</Stat>
              <Stat label="Still owed">
                $<AnimatedNumber value={c.principalRemaining} />
              </Stat>
              <Stat label="Autopay">{c.autopay ? "On" : "Off"}</Stat>
            </>
          ) : (
            <>
              <Stat label="Term">{c.termMonths} mo</Stat>
              <Stat label="Residual">{usd(c.residualValue)}</Stat>
              <Stat label="Allowance">{(c.annualMileageAllowance / 1000).toFixed(0)}k mi/yr</Stat>
            </>
          )}
        </dl>
      </div>

      {lease && (
        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-ink-2">Miles at lease end</span>
            <span className={clsx("num font-semibold", lease.overMiles > 0 ? "text-warn" : "text-good")}>
              {lease.overMiles > 0 ? (
                <>
                  <AnimatedNumber value={lease.overMiles} /> mi over
                </>
              ) : (
                <>
                  <AnimatedNumber value={lease.limitOdo - lease.projectedOdo} /> mi to spare
                </>
              )}
            </span>
          </div>
          <MileageBar used={lease.projectedOdo - lease.startOdo} now={data.persona.vehicle.odometer - lease.startOdo} allowance={lease.allowanceTotal} />
          <div className="mt-2 flex justify-between text-xs text-ink-3">
            <span>
              Driving <span className="num text-ink-2">{Math.round(lease.monthlyMiles).toLocaleString()}</span> mi/mo
            </span>
            <span>
              Allowance <span className="num text-ink-2">{lease.allowancePerMonth.toLocaleString()}</span> mi/mo
            </span>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Chip tone="quiet">ToyotaCare: 2 yr / 25k mi from {new Date(data.persona.toyotaCare.startDate + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}</Chip>
        <Chip tone="quiet">Credit: {data.persona.creditTier}</Chip>
      </div>
    </Panel>
  );
}

/** Allowance bar: solid = driven so far, hatched = projected to lease end, tick = allowance. */
function MileageBar({ used, now, allowance }: { used: number; now: number; allowance: number }) {
  const reduced = useShouldReduceMotion();
  const number = useTempoTransition(spring.number);
  const max = Math.max(used, allowance) * 1.04;
  const pctNow = (now / max) * 100;
  const pctProj = (used / max) * 100;
  const pctAllow = (allowance / max) * 100;
  const over = used > allowance;
  return (
    <div className="relative mt-3 h-3 w-full rounded-full bg-line" role="img" aria-label={`${Math.round(now).toLocaleString()} miles driven, ${Math.round(used).toLocaleString()} projected, ${allowance.toLocaleString()} allowed`}>
      <div className="absolute inset-0 overflow-hidden rounded-full">
        <motion.div
          className="absolute inset-0 rounded-full"
          initial={false}
          animate={{ transform: `translateX(-${100 - pctProj}%)` }}
          transition={reduced ? motionTransition.instant : number}
          style={{
            background: over
              ? "repeating-linear-gradient(135deg, var(--warn) 0 4px, transparent 4px 8px)"
              : "repeating-linear-gradient(135deg, var(--ink-3) 0 4px, transparent 4px 8px)",
            opacity: 0.7,
          }}
        />
        <motion.div
          className="absolute inset-0 rounded-full bg-ink"
          initial={false}
          animate={{ transform: `translateX(-${100 - pctNow}%)` }}
          transition={reduced ? motionTransition.instant : number}
        />
      </div>
      <div className="absolute -top-1.5 -bottom-1.5 w-0.5 rounded bg-ink-2" style={{ left: `${pctAllow}%` }} aria-hidden />
    </div>
  );
}
