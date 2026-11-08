export type RepairCategory = "brakes" | "battery" | "tires" | "ac" | "engine" | "transmission" | "unknown";
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
  brakes: { label: "Brake repair", low: 420, high: 980, words: ["brake", "brakes", "rotor", "disc", "disk", "pads", "squeal", "grind"] },
  battery: { label: "Battery or charging", low: 190, high: 620, words: ["battery", "alternator", "charge", "starting", "start", "dead", "jump"] },
  tires: { label: "Tires", low: 620, high: 1180, words: ["tire", "tires", "flat", "tread", "vibrat", "wobble", "alignment", "pulls"] },
  ac: { label: "A/C repair", low: 760, high: 1900, words: ["a/c", "ac ", "air conditioning", "compressor", "cold air", "blowing warm", "warm air", "heater"] },
  engine: { label: "Engine repair", low: 1450, high: 4600, words: ["engine", "overheat", "oil leak", "knock", "misfire", "check-engine", "check engine", "rough idle", "stall"] },
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
  const keepMonthly = round(input.currentPayment + estimate.estimate / horizon + maintenanceReserve);

  const refiApr = Math.max(3.9, aprByCredit[input.credit] - 0.5);
  const refiPayment = round(monthlyPayment(input.loanBalance, refiApr, 60));
  const refinanceEligible = input.loanBalance > 2000 && refiPayment + 15 < input.currentPayment;

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

  const options: DecisionOption[] = [
    {
      path: "keep",
      title: "Repair & keep",
      monthly: keepMonthly,
      upfront: estimate.estimate,
      eligible: !estimate.needsInspection,
      summary: estimate.needsInspection ? "Get an inspection before deciding." : `Includes the repair and a maintenance reserve over ${input.keepYears} years.`,
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
      title: "Refinance",
      monthly: refiPayment,
      upfront: 350,
      eligible: refinanceEligible,
      summary: refinanceEligible ? `Estimated at ${refiApr.toFixed(1)}% APR over 60 months.` : "The estimated refinance does not meaningfully lower your payment.",
    },
  ];
  const eligible = options.filter((option) => option.eligible);
  const recommended = eligible.sort((a, b) => a.monthly - b.monthly)[0] ?? options[0];
  const repairRatio = estimate.estimate / Math.max(1, values.privateSale);
  const score = Math.max(0, Math.min(100, round(repairRatio * 90 + age * 4 + (input.vehicle.mileage > 120000 ? 18 : 0) - (tradeEligible ? 0 : 18))));
  const reasons = [
    estimate.needsInspection ? "The problem needs a shop diagnosis." : `The repair is about ${round(repairRatio * 100)}% of the car’s value.`,
    values.tradeIn > input.loanBalance ? `You have about $${round(values.tradeIn - input.loanBalance).toLocaleString()} in estimated trade equity.` : "The loan is above the estimated trade value.",
    `${recommended.title} has the lowest eligible monthly estimate.`,
  ];
  return { estimate, privateSaleValue: values.privateSale, tradeInValue: values.tradeIn, recommendation: recommended.path, score, options, replacements, reasons };
}
