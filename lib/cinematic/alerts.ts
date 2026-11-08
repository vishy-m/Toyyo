import { usd } from "../client/format";
import type { DashboardData, MoveOption } from "../types";

/** Typical US driver, miles per year (FHWA average annual miles per licensed driver, rounded). */
export const TYPICAL_ANNUAL_MILES = 13_500;
/** Fuel alert threshold: this car's monthly fuel cost vs the typical-driver baseline. */
export const FUEL_ALERT_RATIO = 1.1;
/** Driving score under which the insurance/driving alert fires on its own. */
export const LOW_SCORE = 75;
/** ToyotaCare with this many months or fewer left (or already ended) is "act soon". */
export const COVERAGE_ACT_MONTHS = 3;
/** ToyotaCare with this many months or fewer left raises an alert at all. */
export const COVERAGE_ALERT_MONTHS = 6;
export const MAX_ALERTS = 4;

export type AlertSeverity = "watch" | "act";
export type AlertIcon = "mileage" | "fuel" | "rate" | "timing" | "coverage" | "driving";

/** Where an overview alert opens. Mileage, fuel and the driving score share Driving. */
export function sectionForAlert(icon: AlertIcon): "driving" | "finances" | "repairs" {
  if (icon === "rate" || icon === "timing") return "finances";
  if (icon === "coverage") return "repairs";
  return "driving";
}

export interface DashboardAlert {
  id: AlertIcon;
  severity: AlertSeverity;
  icon: AlertIcon;
  title: string;
  detail: string;
}

export interface MonthlyCost {
  id: "payment" | "insurance" | "fuel" | "maintenance";
  label: string;
  /** Dollars per month; null for a line with no number (maintenance covered by ToyotaCare). */
  amount: number | null;
  note?: string;
}

export interface DashboardSummary {
  /** At most MAX_ALERTS, in the order they should be shown. */
  alerts: DashboardAlert[];
  /** Every alert that applies, before the display cap (drives which tell-tale lights are lit). */
  active: DashboardAlert[];
  costs: MonthlyCost[];
  total: number;
  /** Fuel basis footnote when the fuel line is shown. */
  fuelNote?: string;
}

const findOption = (data: DashboardData, id: string): MoveOption | undefined =>
  Object.values(data.engines).flatMap((engine) => engine.options).find((option) => option.id === id);

const mathResult = (option: MoveOption | undefined, label: string) => option?.math.find((line) => line.label === label)?.result;
const toNumber = (text: string | undefined) => {
  const value = Number((text ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(value) ? value : NaN;
};
const whole = (n: number) => Math.round(n).toLocaleString("en-US");
const longDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Monthly fuel cost at an annual mileage, this car's mpg and the given gas price. */
export function fuelPerMonth(milesPerMonth: number, mpg: number, gasPrice: number) {
  return mpg > 0 ? (milesPerMonth / mpg) * gasPrice : 0;
}

export function coverage(data: DashboardData) {
  const current = findOption(data, "protection:current");
  const months = toNumber(mathResult(current, "Projected months of ToyotaCare remaining"));
  const expiry = mathResult(current, "Projected expiry");
  return { months, expiry: expiry && /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : undefined };
}

function rankOf(data: DashboardData, ...optionIds: string[]) {
  const moveType = findOption(data, optionIds[0])?.moveType;
  for (const id of optionIds) {
    const at = data.ranked.findIndex((move) => move.optionId === id);
    if (at >= 0) return at;
  }
  const byType = data.ranked.findIndex((move) => move.moveType === moveType);
  return byType >= 0 ? byType : 50;
}

export function deriveSummary(data: DashboardData, gasPrice: number): DashboardSummary {
  // Hackathon-pack cases carry their own reference answer and figures; engine-only signals that the pack
  // doesn't model (coverage dates, payment-date timing) stay out so nothing contradicts the lead move.
  const pack = data.caseFile?.source === "pack";
  const { vehicle, contract, insurance } = data.persona;
  const driving = data.driving;
  const drivingOn = data.persona.consent.driving && driving.avgMonthlyMiles > 0;
  const found: { alert: DashboardAlert; rank: number }[] = [];
  const push = (alert: DashboardAlert, rank: number) => found.push({ alert, rank });

  // Lease mileage: the engine's own projection of miles over the allowance at lease end.
  const returnOption = findOption(data, "lease-end:return");
  if (contract.kind === "lease" && returnOption?.eligible) {
    const over = toNumber(mathResult(returnOption, "Excess miles"));
    const charge = toNumber(mathResult(returnOption, "Excess mileage charge"));
    if (over > 0) {
      const end = returnOption.deadline ? ` by ${longDate(returnOption.deadline)}` : "";
      push({
        id: "mileage", icon: "mileage", severity: contract.monthsRemaining <= 6 ? "act" : "watch",
        title: "Mileage limit ahead",
        detail: `On pace to finish about ${whole(over)} mi over your ${whole(contract.annualMileageAllowance)} mi/yr allowance${end}: roughly ${usd(charge)} in excess mileage charges at ${usd(contract.overageRatePerMile, { cents: true })}/mi.`,
      }, rankOf(data, "lease-end:return", "lease-end:buyout"));
    }
  }

  // Fuel vs a typical driver of the same car (not peer data: a stated baseline).
  const fuel = drivingOn ? fuelPerMonth(driving.avgMonthlyMiles, vehicle.mpg, gasPrice) : 0;
  const typical = fuelPerMonth(TYPICAL_ANNUAL_MILES / 12, vehicle.mpg, gasPrice);
  const fuelNote = drivingOn ? `Fuel assumes ${usd(gasPrice, { cents: true })}/gal and ${vehicle.mpg} mpg. A typical driver covers ${whole(TYPICAL_ANNUAL_MILES)} mi/yr (US average, FHWA).` : undefined;
  if (drivingOn && typical > 0 && fuel >= typical * FUEL_ALERT_RATIO) {
    const more = Math.round((fuel / typical - 1) * 100);
    push({
      id: "fuel", icon: "fuel", severity: "watch",
      title: "Fuel above typical",
      detail: `About ${usd(fuel)}/mo on fuel, ${more}% more than ${usd(typical)} for a typical 13,500 mi/yr at this car’s ${vehicle.mpg} mpg.`,
    }, 90);
  }

  // Loan rate: the refinance option saves money.
  const refinance = findOption(data, "payment:refinance");
  if (contract.kind === "loan" && refinance?.eligible && (refinance.savingsVsBaseline ?? 0) > 0) {
    const newApr = /(\d+(?:\.\d+)?)% simulated APR/.exec(refinance.summary)?.[1];
    const payment = refinance.monthlyCost !== undefined && refinance.monthlyCost < contract.monthlyPayment
      ? ` and the payment would go from ${usd(contract.monthlyPayment)} to ${usd(refinance.monthlyCost)}/mo` : "";
    push({
      id: "rate", icon: "rate", severity: "watch",
      title: "Loan rate worth a look",
      detail: `Refinancing your ${contract.apr}% APR${newApr ? ` to a simulated ${newApr}%` : ""} could save about ${usd(refinance.savingsVsBaseline ?? 0)} net of fees over ${plural(contract.monthsRemaining, "month")}${payment}.`,
    }, rankOf(data, "payment:refinance"));
  }

  // Payment timing: the due-date option is eligible and the engines ranked it.
  const dueDate = findOption(data, "payment:due-date");
  const dueRank = data.ranked.findIndex((move) => move.optionId === "payment:due-date");
  if (!pack && dueDate?.eligible && dueRank >= 0) {
    const day = data.cashflow?.paymentDueDay;
    push({
      id: "timing", icon: "timing", severity: "watch",
      title: "Payment date off your payday",
      detail: day ? `Your payment is due on the ${ordinal(day)}. Moving the due date could line it up with when you’re paid.` : dueDate.summary,
    }, dueRank);
  }

  // Coverage: ToyotaCare running out (or out), from the protection engine's projection.
  const care = coverage(data);
  if (!pack && Number.isFinite(care.months) && care.months <= COVERAGE_ALERT_MONTHS) {
    const ended = care.months <= 0;
    const when = care.expiry ? ` on ${longDate(care.expiry)}` : "";
    push({
      id: "coverage", icon: "coverage", severity: ended || care.months <= COVERAGE_ACT_MONTHS ? "act" : "watch",
      title: ended ? "ToyotaCare has ended" : "ToyotaCare ending soon",
      detail: ended
        ? "Scheduled maintenance is no longer covered by ToyotaCare. Optional service coverage is $42/mo (simulated)."
        : `ToyotaCare scheduled maintenance ends in about ${plural(Math.max(1, Math.round(care.months)), "month")}${when}.`,
    }, rankOf(data, "protection:service"));
  }

  // Insurance/driving: coaching leads the engines' picks, or the score is low.
  const topInsurance = data.ranked.find((move) => move.moveType === "insurance");
  const coachingRank = data.ranked.findIndex((move) => move.optionId === "insurance:coaching");
  const coaching = findOption(data, "insurance:coaching");
  if (data.persona.consent.driving && coaching?.eligible && ((topInsurance?.optionId === "insurance:coaching" && coachingRank <= 1) || driving.score < LOW_SCORE) && driving.score < 90) {
    const saves = (coaching.savingsVsBaseline ?? 0) > 0 ? `; a better score could save about ${usd(coaching.savingsVsBaseline ?? 0)} a year on insurance` : "";
    push({
      id: "driving", icon: "driving", severity: "watch",
      title: "Driving score can improve",
      detail: `Your score is ${Math.round(driving.score)} out of 100${saves}.`,
    }, coachingRank >= 0 ? coachingRank : 40);
  }

  const active = found.sort((a, b) => a.rank - b.rank).map((entry) => entry.alert);

  // Monthly costs. Maintenance has no number: it is either covered or left out.
  const costs: MonthlyCost[] = [
    { id: "payment", label: contract.kind === "lease" ? "Lease payment" : "Loan payment", amount: contract.monthlyPayment },
    { id: "insurance", label: "Insurance", amount: insurance.monthlyPremium },
  ];
  if (drivingOn) costs.push({ id: "fuel", label: "Fuel", amount: Math.round(fuel) });
  if (Number.isFinite(care.months) && care.months > 0) costs.push({ id: "maintenance", label: "Maintenance", amount: null, note: "Covered by ToyotaCare" });
  const total = Math.round(costs.reduce((sum, cost) => sum + (cost.amount ?? 0), 0) * 100) / 100;

  return { alerts: active.slice(0, MAX_ALERTS), active, costs, total, fuelNote };
}

function ordinal(n: number) {
  const mod100 = n % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}
