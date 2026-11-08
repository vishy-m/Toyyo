export type RepairCategory = "brakes" | "battery" | "tires" | "wipers" | "ac" | "engine" | "transmission" | "unknown";
export type DecisionPath = "keep" | "trade" | "refinance";

export interface RepairAdvisorInput {
  vehicle: { year: number; model: string; mileage: number };
  issue: string;
  manualQuote?: number;
  loanBalance: number;
  currentPayment: number;
  currentApr: number;
  savings: number;
  monthlySurplus: number;
  downPayment: number;
  credit: "excellent" | "good" | "fair" | "building";
  keepYears: number;
  researchSeverity?: "low" | "medium" | "high";
  researchVerdict?: string;
}

export interface RepairEstimate {
  category: RepairCategory;
  label: string;
  low: number;
  high: number;
  estimate: number;
  source: "estimate" | "shop quote";
  needsInspection: boolean;
}

export interface ReplacementOption {
  name: string;
  price: number;
  monthly: number;
  fit: string;
}

export interface DecisionOption {
  path: DecisionPath;
  title: string;
  monthly: number;
  upfront: number;
  eligible: boolean;
  summary: string;
}

export interface RepairDecision {
  estimate: RepairEstimate;
  privateSaleValue: number;
  tradeInValue: number;
  recommendation: DecisionPath;
  score: number;
  options: DecisionOption[];
  replacements: ReplacementOption[];
  reasons: string[];
}

const repairTable: Record<Exclude<RepairCategory, "unknown">, { label: string; low: number; high: number; words: string[] }> = {
  wipers: { label: "Wiper repair", low: 25, high: 240, words: ["wiper", "washer fluid", "wiper blade"] },
  brakes: { label: "Brake repair", low: 420, high: 980, words: ["brake", "brakes", "rotor", "pads", "squeal"] },
  battery: { label: "Battery or charging", low: 190, high: 620, words: ["battery", "alternator", "charge", "starting", "start"] },
  tires: { label: "Tires", low: 620, high: 1180, words: ["tire", "tires", "flat", "tread"] },
  ac: { label: "A/C repair", low: 760, high: 1900, words: ["a/c", "ac ", "air conditioning", "compressor", "cold air"] },
  engine: { label: "Engine repair", low: 1450, high: 4600, words: ["engine", "overheat", "oil leak", "knock", "misfire"] },
  transmission: { label: "Transmission repair", low: 2400, high: 5600, words: ["transmission", "gear", "shifting", "shift", "slipping"] },
};

const baseValues: Record<string, number> = {
  camry: 31000,
  corolla: 25000,
  rav4: 35000,
  tacoma: 41000,
  highlander: 44000,
  "4runner": 47000,
  sienna: 45000,
  prius: 32000,
  supra: 46000,
};

const replacementCatalog = [
  { name: "2026 Corolla LE", price: 24450, fit: "Lowest payment" },
  { name: "2026 Camry LE", price: 29895, fit: "Balanced sedan" },
  { name: "2025 Corolla Cross LE", price: 29100, fit: "More cargo room" },
  { name: "2025 RAV4 LE", price: 32550, fit: "Everyday SUV" },
];

const aprByCredit = { excellent: 4.9, good: 6.4, fair: 9.5, building: 13.5 } as const;
const CURRENT_MODEL_YEAR = 2026;

const round = (value: number) => Math.round(value);

export function classifyRepair(issue: string, year: number, manualQuote?: number): RepairEstimate {
  const text = issue.toLowerCase();
  const match = Object.entries(repairTable).find(([, row]) => row.words.some((word) => text.includes(word))) as
    | [Exclude<RepairCategory, "unknown">, (typeof repairTable)[Exclude<RepairCategory, "unknown">]]
    | undefined;
  const age = Math.max(0, CURRENT_MODEL_YEAR - year);
  const ageFactor = Math.min(1.38, 1 + Math.max(0, age - 5) * 0.035);
  const low = round((match?.[1].low ?? 250) * ageFactor);
  const high = round((match?.[1].high ?? 1400) * ageFactor);
  return {
    category: match?.[0] ?? "unknown",
    label: match?.[1].label ?? "Inspection needed",
    low: manualQuote ?? low,
    high: manualQuote ?? high,
    estimate: manualQuote ?? high,
    source: manualQuote ? "shop quote" : "estimate",
    needsInspection: !match && !manualQuote,
  };
}

function monthlyPayment(principal: number, apr: number, months: number) {
  if (principal <= 0) return 0;
  const rate = apr / 1200;
  return rate === 0 ? principal / months : (principal * rate) / (1 - Math.pow(1 + rate, -months));
}

export function vehicleValue(year: number, model: string, mileage: number) {
  const key = Object.keys(baseValues).find((name) => model.toLowerCase().includes(name));
  const original = key ? baseValues[key] : 30000;
  const age = Math.max(0, CURRENT_MODEL_YEAR - year);
  const ageValue = original * Math.pow(0.86, age);
  const expectedMiles = Math.max(12000, age * 12000);
  const mileageAdjustment = Math.max(0.62, Math.min(1.08, 1 - (mileage - expectedMiles) * 0.0000032));
  const privateSale = Math.max(1800, round(ageValue * mileageAdjustment));
  return { privateSale, tradeIn: round(privateSale * 0.88) };
}

export function analyzeRepairDecision(input: RepairAdvisorInput): RepairDecision {
  const estimate = classifyRepair(input.issue, input.vehicle.year, input.manualQuote);
  const values = vehicleValue(input.vehicle.year, input.vehicle.model, input.vehicle.mileage);
  const horizon = Math.max(24, input.keepYears * 12);
  const age = Math.max(0, CURRENT_MODEL_YEAR - input.vehicle.year);
  const maintenanceReserve = Math.max(35, age * 11 + input.vehicle.mileage / 2500);
  const repairMonthly = estimate.estimate / horizon;
  const keepMonthly = round(input.currentPayment + repairMonthly + maintenanceReserve);

  // Do not treat the full savings balance as spendable. The advisor preserves the
  // larger of $1,000 or 25% of savings as a basic emergency cushion.
  const protectedSavings = Math.min(input.savings, Math.max(1000, input.savings * 0.25));
  const repairCashAvailable = Math.max(0, input.savings - protectedSavings);
  const repairShortfall = Math.max(0, estimate.estimate - repairCashAvailable);
  const repairAffordable = repairShortfall === 0 || repairShortfall <= input.monthlySurplus * 3;

  const refiApr = Math.max(3.9, aprByCredit[input.credit] - 0.5);
  const refiPayment = round(monthlyPayment(input.loanBalance, refiApr, 60));
  const refinanceSavings = input.currentPayment - refiPayment;
  const refinanceEligible = !estimate.needsInspection && input.loanBalance > 2000 && input.currentApr > refiApr + 0.75 && refinanceSavings >= 25;
  const repairAndRefiMonthly = round(refiPayment + repairMonthly + maintenanceReserve);

  const maxComfortable = Math.max(250, input.monthlySurplus * 0.45 + input.currentPayment);
  const equity = values.tradeIn - input.loanBalance;
  const availableDown = Math.max(0, Math.min(input.downPayment, input.savings * 0.75));
  const replacements = replacementCatalog
    .map((car) => ({
      ...car,
      monthly: round(monthlyPayment(Math.max(0, car.price - availableDown - Math.max(0, equity)), aprByCredit[input.credit], 60)),
    }))
    .filter((car) => car.monthly <= maxComfortable * 1.15)
    .slice(0, 3);
  const selected = replacements[0] ?? {
    ...replacementCatalog[0],
    monthly: round(monthlyPayment(replacementCatalog[0].price - availableDown - Math.max(0, equity), aprByCredit[input.credit], 60)),
  };
  const tradeEligible = selected.monthly <= maxComfortable && equity > -Math.max(2500, input.savings * 0.5);

  const repairRatio = estimate.estimate / Math.max(1, values.privateSale);
  const majorRepair = estimate.category === "engine" || estimate.category === "transmission";
  const ageRisk = Math.min(18, age * 1.5);
  const mileageRisk = input.vehicle.mileage >= 150_000 ? 18 : input.vehicle.mileage >= 120_000 ? 12 : input.vehicle.mileage >= 90_000 ? 6 : 0;
  const repairRisk = Math.min(50, repairRatio * 100);
  const responseRisk = input.researchSeverity === "high" ? 8 : input.researchSeverity === "medium" ? 3 : 0;
  const problemRisk = (majorRepair ? 14 : estimate.category === "unknown" ? 10 : 0) + responseRisk;
  const affordabilityRisk = repairAffordable ? 0 : 12;
  const tradeConstraint = tradeEligible ? 0 : 18;
  const score = Math.max(0, Math.min(100, round(repairRisk + ageRisk + mileageRisk + problemRisk + affordabilityRisk - tradeConstraint)));

  const keepEligible = !estimate.needsInspection && repairAffordable;
  const tradeIsEconomicallyStrong = tradeEligible && (repairRatio >= 0.4 || score >= 65 || (majorRepair && age >= 8 && input.vehicle.mileage >= 100_000));
  let recommendation: DecisionPath = "keep";
  if (estimate.needsInspection) recommendation = "keep";
  else if (tradeIsEconomicallyStrong) recommendation = "trade";
  else if (refinanceEligible && keepEligible && repairAndRefiMonthly + 25 < keepMonthly) recommendation = "refinance";
  else if (!keepEligible && tradeEligible) recommendation = "trade";

  const options: DecisionOption[] = [
    {
      path: "keep",
      title: estimate.needsInspection ? "Inspect before deciding" : "Repair & keep",
      monthly: estimate.needsInspection ? input.currentPayment : keepMonthly,
      upfront: estimate.needsInspection ? 0 : estimate.estimate,
      eligible: keepEligible,
      summary: estimate.needsInspection
        ? "Get a written diagnosis before choosing a repair or replacement."
        : repairAffordable
          ? `Repair is ${round(repairRatio * 100)}% of the car’s value and fits the available cash or three-month surplus.`
          : `The repair exceeds available savings after preserving a ${round(protectedSavings).toLocaleString()} emergency cushion.`,
    },
    {
      path: "trade",
      title: "Trade in",
      monthly: selected.monthly,
      upfront: availableDown,
      eligible: tradeEligible,
      summary: tradeEligible ? `${selected.name} fits the estimated comfortable payment.` : "The estimated payment is above your comfortable range.",
    },
    {
      path: "refinance",
      title: "Repair + refinance",
      monthly: repairAndRefiMonthly,
      upfront: estimate.estimate + 350,
      eligible: refinanceEligible && !estimate.needsInspection,
      summary: refinanceEligible
        ? `Repairs the problem and estimates ${refiApr.toFixed(1)}% APR over 60 months, about $${round(refinanceSavings).toLocaleString()} less on the loan payment.`
        : "Refinancing does not materially improve the current loan or the problem still needs diagnosis.",
    },
  ];
  const recommended = options.find((option) => option.path === recommendation)!;
  const reasons = [
    input.researchVerdict ? `Symptom review: ${input.researchVerdict}` : "No symptom review was completed; the plan uses the written description only.",
    estimate.needsInspection ? "The problem needs a written diagnosis before costs can be compared." : `${estimate.label} is estimated at $${estimate.estimate.toLocaleString()}, about ${round(repairRatio * 100)}% of the car’s value.`,
    estimate.needsInspection ? "Repair affordability will be calculated after an inspection provides a real quote." : repairAffordable ? `$${round(repairCashAvailable).toLocaleString()} is available for repairs after preserving an emergency cushion.` : `The repair leaves a $${round(repairShortfall).toLocaleString()} funding gap beyond the available cash reserve.`,
    equity >= 0 ? `Estimated trade equity is $${round(equity).toLocaleString()}.` : `The loan is about $${round(Math.abs(equity)).toLocaleString()} above the estimated trade value.`,
    recommendation === "refinance" ? `Refinancing lowers the estimated loan payment by about $${round(refinanceSavings).toLocaleString()} while the repair is completed.` : recommendation === "trade" ? "Replacement is recommended only because repair burden and vehicle risk outweigh the affordable keep path." : estimate.needsInspection ? "Inspection is the next step; replacing the car is not recommended from an unknown symptom alone." : "Repairing is favored because it is affordable and the replacement case is not strong enough.",
  ];
  return { estimate, privateSaleValue: values.privateSale, tradeInValue: values.tradeIn, recommendation: recommended.path, score, options, replacements, reasons };
}
