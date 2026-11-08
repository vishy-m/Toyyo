// The overview's sentences and figures, shared by the guided tour and the plain summary so both
// say the same thing in the same words.

import { findOption } from "@/lib/client/data-store";
import { shortDate } from "@/lib/client/format";
import { leaseFacts } from "@/lib/client/lease";
import type { DashboardData, MoveOption } from "@/lib/types";

export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export const miles = (n: number) => Math.round(n).toLocaleString("en-US");

export function impactOf(o: MoveOption) {
  if (o.upgradeModel && o.monthlyCost) return { value: o.monthlyCost, suffix: "/mo", caption: "a month for a new lease, with miles to spare" };
  const s = o.savingsVsBaseline ?? 0;
  if (o.moveType === "insurance" && s > 0) return { value: s, suffix: "/yr", caption: "a year less than your current premium" };
  if (s > 0) return { value: s, suffix: "", caption: o.moveType === "lease-end" ? "saved against returning the car" : "saved over the loan" };
  if (o.monthlyCost) return { value: o.monthlyCost, suffix: "/mo", caption: "a month, estimated" };
  return null;
}

export function nextMove(d: DashboardData) {
  const top = d.ranked[0];
  const opt = top ? findOption(d, top.optionId) : undefined;
  const impact = opt ? impactOf(opt) : null;
  const sentence = opt && impact ? `${money(impact.value)}${impact.suffix} ${impact.caption}${opt.deadline ? `. Decide by ${shortDate(opt.deadline)}.` : "."}` : "Your lease or loan, insurance and protection all look on track.";
  return { opt, impact, sentence };
}

export function situation(d: DashboardData) {
  const v = d.persona.vehicle;
  const c = d.persona.contract;
  return c.kind === "lease"
    ? `Your lease ends in ${c.monthsRemaining} ${c.monthsRemaining === 1 ? "month" : "months"}, with ${miles(v.odometer)} miles on the clock.`
    : `${c.monthsRemaining} payments left at ${c.apr}% APR, with ${miles(v.odometer)} miles on the clock.`;
}

export function contractFacts(d: DashboardData) {
  const c = d.persona.contract;
  const lease = leaseFacts(d);
  if (c.kind === "lease" && lease) {
    const over = lease.overMiles > 0;
    const used = lease.projectedOdo - lease.startOdo;
    const scale = Math.max(lease.allowanceTotal, used) * 1.04;
    return {
      kind: "lease" as const,
      title: "Lease",
      line: over
        ? `At ${miles(lease.monthlyMiles)} miles a month, you'll return the car ${miles(lease.overMiles)} miles over your allowance.`
        : `At ${miles(lease.monthlyMiles)} miles a month, you'll return the car with ${miles(lease.limitOdo - lease.projectedOdo)} miles to spare.`,
      figure: lease.projectedOdo,
      figureFrom: d.persona.vehicle.odometer,
      figureUnit: "mi",
      figureCaption: `on the odometer when the lease ends, against a limit of ${miles(lease.limitOdo)}.`,
      bar: used / scale,
      marker: lease.allowanceTotal / scale,
      tone: over ? ("warn" as const) : ("good" as const),
      barLabels: ["Projected", "Allowance"] as [string, string],
      link: { href: "/moves", label: "Compare lease-end options" },
    };
  }
  if (c.kind !== "loan") return null;
  const paid = (c.termMonths - c.monthsRemaining) / c.termMonths;
  return {
    kind: "loan" as const,
    title: "Loan",
    line: `${c.monthsRemaining} payments of ${money(c.monthlyPayment)} left, at ${c.apr}% APR.`,
    figure: c.principalRemaining,
    figureFrom: 0,
    figureUnit: "",
    figureCaption: "still owed on the loan.",
    bar: paid,
    marker: undefined,
    tone: "data" as const,
    barLabels: [`${Math.round(paid * 100)}% of the term paid`, `${c.termMonths} months`] as [string, string],
    link: { href: "/finances", label: "See your payments" },
  };
}

export function drivingFacts(d: DashboardData) {
  const tripMiles = d.trips.reduce((a, t) => a + t.miles, 0);
  const brakes = d.trips.reduce((a, t) => a + t.hardBrakes, 0);
  const trail = d.driving.categoryMiles?.trailhead ?? 0;
  const factors = [...d.driving.scoreFactors]
    .filter((f) => Math.round(f.impact * 10) !== 0)
    .sort((a, b) => a.impact - b.impact)
    .slice(0, 3);
  return {
    on: d.persona.consent.driving,
    line: `${d.trips.length} trips and ${miles(tripMiles)} miles in the last 90 days.`,
    score: Math.round(d.driving.score),
    streak: d.driving.smoothStreak,
    factors,
    callout: trail > 0 ? `${miles(trail)} trail miles` : `${brakes} hard brakes in 90 days`,
  };
}

export function protectionFacts(d: DashboardData) {
  const tc = d.persona.toyotaCare;
  const end = new Date(tc.startDate + "T12:00:00Z");
  end.setUTCMonth(end.getUTCMonth() + tc.expiresMonths);
  const endLabel = end.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const ended = end.getTime() < Date.parse("2026-10-27T12:00:00Z");
  const e = d.engines.protection;
  const prot = e?.options.find((o) => o.id !== e.baselineOptionId && o.eligible);
  return {
    line: ended ? `ToyotaCare ended in ${endLabel}. Service and repairs are now yours to cover.` : `ToyotaCare covers scheduled service until ${endLabel} or ${miles(tc.expiresMiles)} miles.`,
    prot,
    callout: prot?.monthlyCost ? `${prot.title}, $${Math.round(prot.monthlyCost)} a month` : "ToyotaCare",
  };
}

export function insuranceFacts(d: DashboardData) {
  const ins = d.persona.insurance;
  const e = d.engines.insurance;
  const ubi = e.options.find((o) => o.id !== e.baselineOptionId && o.eligible);
  const quote = ubi?.monthlyCost ?? null;
  const cheaper = quote != null && quote < ins.monthlyPremium;
  return {
    ins,
    quote,
    cheaper,
    line:
      quote != null
        ? cheaper
          ? `Insurers would charge less for the way you drive: ${money(quote)} a month instead of ${money(ins.monthlyPremium)}.`
          : `A usage-based policy would cost more for now: ${money(quote)} a month against your ${money(ins.monthlyPremium)}.`
        : `You pay ${money(ins.monthlyPremium)} a month with ${ins.carrier}.`,
    callout: d.persona.consent.driving ? `Driving score ${Math.round(d.driving.score)}` : "Driving data off",
  };
}
