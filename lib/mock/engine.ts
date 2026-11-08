// Mock engines: a small, deterministic stand-in for lib/engines (task 01) so the UI and its
// what-if controls behave realistically before the backend lands. Not used once /api is live.

import type {
  ConsentSource,
  EngineResult,
  MoveOption,
  MoveType,
  Persona,
  PersonaId,
  WhatIfOverrides,
} from "@/lib/types";

export const SNAPSHOT_DATE = "2026-10-27";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

function addMonths(iso: string, months: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function amortPayment(principal: number, aprPct: number, months: number) {
  const r = aprPct / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - (1 + r) ** -months);
}

/** Months to pay off and total interest with an extra monthly principal amount. */
function payoff(principal: number, aprPct: number, payment: number, extra: number) {
  const r = aprPct / 100 / 12;
  let bal = principal;
  let months = 0;
  let interest = 0;
  while (bal > 0.01 && months < 600) {
    const i = bal * r;
    interest += i;
    bal = bal + i - payment - extra;
    months++;
  }
  return { months, interest };
}

// Per-persona tuning the real engines read from data/reference/*.json.
const leaseTuning: Partial<
  Record<PersonaId, { startOdo: number; marketValueAt: number; marketValueOdo: number; wear: number; reLease: number; upgrade: { name: string; monthly: number; asset: string; body: "sedan" | "suv" | "truck"; why: string } }>
> = {
  maya: {
    startOdo: 7000,
    marketValueAt: 21380,
    marketValueOdo: 47000,
    wear: 0,
    reLease: 429,
    upgrade: { name: "2027 Camry Hybrid XSE", monthly: 459, asset: "/models/camry.glb", body: "sedan", why: "Your I-35 commute would burn ~30% less fuel." },
  },
  raj: {
    startOdo: 0,
    marketValueAt: 30200,
    marketValueOdo: 48850,
    wear: 300,
    reLease: 519,
    upgrade: { name: "2026 4Runner TRD Off-Road", monthly: 559, asset: "/models/4runner.glb", body: "suv", why: "Built for the trail miles you already drive." },
  },
};

export const mockDrivingBase: Record<PersonaId, { avgMonthlyMiles: number; score: number }> = {
  maya: { avgMonthlyMiles: 1450, score: 82 },
  garcia: { avgMonthlyMiles: 620, score: 91 },
  jordan: { avgMonthlyMiles: 780, score: 64 },
  raj: { avgMonthlyMiles: 1050, score: 86 },
};

function leaseEnd(p: Persona, o: WhatIfOverrides): EngineResult {
  const c = p.contract;
  const t = leaseTuning[p.id];
  if (c.kind !== "lease" || !t) {
    return {
      moveType: "lease-end",
      baselineOptionId: "lease-end:keep",
      options: [
        {
          id: "lease-end:keep",
          moveType: "lease-end",
          title: "Keep your loan on track",
          summary: `You finance this ${p.vehicle.model}, so there is no lease end. Trade-in options open once you have equity.`,
          tradeoffs: [],
          assumptions: [{ label: "Contract", value: "Retail loan" }],
          math: [],
          dataUsed: [{ source: "Contract", detail: "Loan, not a lease" }],
          confidence: "high",
          highStakes: false,
          eligible: false,
          ineligibleReason: "Financed vehicle: no lease end",
        },
      ],
    };
  }
  const miles = o.monthlyMiles ?? mockDrivingBase[p.id].avgMonthlyMiles;
  const projectedOdo = p.vehicle.odometer + miles * c.monthsRemaining;
  const allowance = (c.annualMileageAllowance * c.termMonths) / 12;
  const driven = projectedOdo - t.startOdo;
  const overMiles = Math.max(0, driven - allowance);
  const overage = overMiles * c.overageRatePerMile;
  const returnTotal = overage + c.dispositionFee + t.wear;
  const tax = c.residualValue * 0.0625;
  const buyoutPrice = c.residualValue + c.purchaseOptionFee + tax;
  const marketValue = t.marketValueAt + (t.marketValueOdo - projectedOdo) * 0.08;
  const equity = marketValue - buyoutPrice;
  const fees = 700;
  const buySavings = equity + returnTotal - fees;
  const leaseEndDate = addMonths(c.startDate, c.termMonths);
  const deadline = addDays(leaseEndDate, -30);
  const dataUsed = [
    { source: "Trip log", detail: `Last 90 days · ${miles.toLocaleString()} mi/mo` },
    { source: "Lease contract", detail: `${c.termMonths} mo · ${c.annualMileageAllowance.toLocaleString()} mi/yr · residual ${usd(c.residualValue)}` },
  ];
  const sharedAssumptions = [
    { label: "Monthly miles", value: `${miles.toLocaleString()} mi` },
    { label: "Lease starting odometer", value: `${t.startOdo} mi` },
    { label: "Projected odometer at lease end", value: `${Math.round(projectedOdo).toLocaleString()} mi` },
    { label: "Mileage allowance (whole lease)", value: `${allowance.toLocaleString()} mi` },
    { label: "Market value (simulated table)", value: usd(marketValue) },
  ];
  const ret: MoveOption = {
    id: "lease-end:return",
    moveType: "lease-end",
    title: `Return the ${p.vehicle.model.split(" ")[0]}`,
    summary:
      overMiles > 0
        ? `Hand it back and pay about ${usd(returnTotal)} in Excess Mileage and Disposition Fee.`
        : `Hand it back with ${Math.round(allowance - driven).toLocaleString()} miles to spare; only the ${usd(c.dispositionFee)} Disposition Fee applies.`,
    totalCost: r2(returnTotal),
    savingsVsBaseline: 0,
    deadline,
    tradeoffs: ["You walk away with no car to drive", "Excess Mileage charges are due at turn-in"],
    assumptions: [...sharedAssumptions, { label: "Excess wear and use (estimate)", value: usd(t.wear) }],
    math: [
      { label: "Excess mileage", formula: `max(0, ${Math.round(driven).toLocaleString()} − ${allowance.toLocaleString()}) × $${c.overageRatePerMile}`, result: usd(overage) },
      { label: "Turn-in total", formula: `${usd(overage)} + ${usd(c.dispositionFee)} disposition + ${usd(t.wear)} wear`, result: usd(returnTotal) },
    ],
    dataUsed,
    confidence: "high",
    highStakes: false,
    eligible: true,
  };
  const buy: MoveOption = {
    id: "lease-end:buyout",
    moveType: "lease-end",
    title: `Buy out your ${p.vehicle.model.split(" ")[0]}`,
    summary: `Pay ${usd(buyoutPrice)} out the door and keep a car worth about ${usd(marketValue)}.`,
    monthlyCost: r2(amortPayment(buyoutPrice, 6.4, 48)),
    totalCost: r2(buyoutPrice),
    savingsVsBaseline: r2(buySavings),
    equity: r2(equity),
    deadline,
    tradeoffs: ["Monthly payment rises if you finance it", "You own maintenance after warranty"],
    assumptions: [...sharedAssumptions, { label: "Texas sales tax", value: "6.25%" }, { label: "Title, registration, finance fees", value: usd(fees) }, { label: "Finance APR (simulated)", value: "6.4% · 48 mo" }],
    math: [
      { label: "Buyout price", formula: `${usd(c.residualValue)} residual + ${usd(c.purchaseOptionFee)} fee + ${usd(tax)} tax`, result: usd(buyoutPrice) },
      { label: "Equity", formula: `${usd(marketValue)} market − ${usd(buyoutPrice)}`, result: usd(equity) },
      { label: "Saves vs returning", formula: `${usd(equity)} equity + ${usd(returnTotal)} avoided − ${usd(fees)} fees`, result: usd(buySavings) },
    ],
    dataUsed: [...dataUsed, { source: "Market values", detail: "Simulated valuation table" }],
    confidence: "high",
    highStakes: true,
    eligible: true,
  };
  const relSavings = c.dispositionFee - overage;
  const release: MoveOption = {
    id: "lease-end:re-lease",
    moveType: "lease-end",
    title: `Re-lease a new ${p.vehicle.model}`,
    summary: `Start a new lease at about ${usd(t.reLease)}/mo; the Disposition Fee is waived.`,
    monthlyCost: t.reLease,
    savingsVsBaseline: r2(relSavings),
    deadline,
    tradeoffs: ["Payment goes up", "Excess Mileage is still due on this lease"],
    assumptions: [...sharedAssumptions, { label: "New lease (simulated price table)", value: `${usd(t.reLease)}/mo · 36 mo` }],
    math: [{ label: "Saves vs returning", formula: `${usd(c.dispositionFee)} waived − ${usd(overage)} excess mileage`, result: usd(relSavings) }],
    dataUsed,
    confidence: "medium",
    highStakes: false,
    eligible: true,
  };
  const upgrade: MoveOption = {
    id: "lease-end:upgrade",
    moveType: "lease-end",
    title: `Upgrade to a ${t.upgrade.name.replace(/^\d{4} /, "")}`,
    summary: `${t.upgrade.why} About ${usd(t.upgrade.monthly)}/mo.`,
    monthlyCost: t.upgrade.monthly,
    savingsVsBaseline: r2(relSavings),
    deadline,
    tradeoffs: [`${usd(t.upgrade.monthly - c.monthlyPayment)}/mo more than today`, "New-model wait times vary"],
    assumptions: [...sharedAssumptions, { label: "Upgrade lease (simulated)", value: `${usd(t.upgrade.monthly)}/mo · 36 mo` }],
    math: [{ label: "Payment change", formula: `${usd(t.upgrade.monthly)} − ${usd(c.monthlyPayment)}`, result: `${usd(t.upgrade.monthly - c.monthlyPayment)}/mo` }],
    dataUsed: [...dataUsed, { source: "Lifestyle tags", detail: p.preferences.lifestyleTags.join(", ") || "commuter" }],
    confidence: "medium",
    highStakes: false,
    eligible: true,
    upgradeModel: { name: t.upgrade.name, modelAsset: t.upgrade.asset, bodyStyle: t.upgrade.body },
  };
  return { moveType: "lease-end", baselineOptionId: ret.id, options: [ret, buy, release, upgrade] };
}

function insurance(p: Persona, o: WhatIfOverrides): EngineResult {
  const base = mockDrivingBase[p.id].score;
  const prem = p.insurance.monthlyPremium;
  const mult = (s: number) => Math.min(1.15, Math.max(0.65, 1.1 - (s - 50) * 0.012));
  const shared = p.consent.shareWithInsurers && p.consent.driving;
  const improve = o.scoreImprovement ?? 10;
  const ubiNow = Math.round(prem * mult(base));
  const ubiCoached = Math.round(prem * mult(Math.min(100, base + improve)));
  const dataUsed = [
    { source: "Drive Pulse-style score", detail: `${base}/100 · last 90 days` },
    { source: "Insurance policy", detail: `${p.insurance.carrier} · ${usd(prem)}/mo` },
  ];
  const current: MoveOption = {
    id: "insurance:current",
    moveType: "insurance",
    title: "Keep your current policy",
    summary: `Stay at ${usd(prem)}/mo with ${p.insurance.carrier.replace(" (simulated)", "")}.`,
    monthlyCost: prem,
    savingsVsBaseline: 0,
    tradeoffs: ["No savings for safer driving"],
    assumptions: [{ label: "Current premium", value: `${usd(prem)}/mo` }],
    math: [],
    dataUsed: dataUsed.slice(1),
    confidence: "high",
    highStakes: false,
    eligible: true,
  };
  const ubiSave = (prem - ubiNow) * 12;
  const ubi: MoveOption = {
    id: "insurance:ubi",
    moveType: "insurance",
    title: "Switch to usage-based insurance",
    summary:
      ubiSave >= 0
        ? `Your score of ${base} projects ${usd(ubiNow)}/mo, about ${usd(ubiSave)} a year less.`
        : `Your score of ${base} projects ${usd(ubiNow)}/mo, which is ${usd(-ubiSave)} a year more. Not recommended yet.`,
    monthlyCost: ubiNow,
    savingsVsBaseline: ubiSave,
    tradeoffs: ["Premium can rise if your score drops (about 1 in 5 drivers see an increase)", "Shares trip data with the insurer"],
    assumptions: [
      { label: "Score tier multiplier", value: `×${mult(base).toFixed(2)}` },
      { label: "Base premium", value: `${usd(prem)}/mo` },
    ],
    math: [{ label: "Usage-based quote", formula: `${usd(prem)} × ${mult(base).toFixed(2)}`, result: `${usd(ubiNow)}/mo` }],
    dataUsed,
    confidence: "medium",
    highStakes: true,
    eligible: shared,
    ineligibleReason: shared ? undefined : "Turn on “Share with insurers” to get a quote",
  };
  const coachSave = (prem - ubiCoached) * 12;
  const coached: MoveOption = {
    id: "insurance:ubi-coached",
    moveType: "insurance",
    title: "Usage-based + coaching",
    summary: `Lift your score by ${improve} points (fewer hard brakes, less late-night speeding) and pay about ${usd(ubiCoached)}/mo.`,
    monthlyCost: ubiCoached,
    savingsVsBaseline: coachSave,
    tradeoffs: ["Savings depend on actually changing habits", "Takes ~3 months to show in your score"],
    assumptions: [
      { label: "Score improvement", value: `+${improve} pts` },
      { label: "Coached tier multiplier", value: `×${mult(Math.min(100, base + improve)).toFixed(2)}` },
    ],
    math: [
      { label: "Coached quote", formula: `${usd(prem)} × ${mult(Math.min(100, base + improve)).toFixed(2)}`, result: `${usd(ubiCoached)}/mo` },
      { label: "Yearly savings", formula: `(${usd(prem)} − ${usd(ubiCoached)}) × 12`, result: usd(coachSave) },
    ],
    dataUsed,
    confidence: "medium",
    highStakes: true,
    eligible: shared,
    ineligibleReason: shared ? undefined : "Turn on “Share with insurers” to get a quote",
  };
  return {
    moveType: "insurance",
    baselineOptionId: current.id,
    options: [current, ubi, coached],
    limitedBy: shared ? undefined : (["shareWithInsurers"] as ConsentSource[]),
  };
}

const tierApr: Record<Persona["creditTier"], number> = { excellent: 4.9, good: 6.4, fair: 8.9, building: 9.9 };
const paydayDay: Record<string, number> = { "biweekly-fri": 5, "semimonthly-1-15": 2, "monthly-1": 2 };
export const mockCashflowPayday: Record<PersonaId, string> = {
  maya: "semimonthly-1-15",
  garcia: "semimonthly-1-15",
  jordan: "biweekly-fri",
  raj: "biweekly-fri",
};

function payment(p: Persona, o: WhatIfOverrides): EngineResult {
  const c = p.contract;
  const options: MoveOption[] = [];
  const limitedBy: ConsentSource[] = [];
  if (c.kind === "loan") {
    const n = c.monthsRemaining;
    const newApr = tierApr[p.creditTier];
    const newPay = amortPayment(c.principalRemaining, newApr, n);
    const oldPay = amortPayment(c.principalRemaining, c.apr, n);
    const fee = 150;
    const refiSave = (oldPay - newPay) * n - fee;
    options.push({
      id: "payment:current",
      moveType: "payment",
      title: "Keep paying as you are",
      summary: `${usd(c.monthlyPayment)}/mo at ${c.apr}% APR for ${n} more months.`,
      monthlyCost: c.monthlyPayment,
      savingsVsBaseline: 0,
      tradeoffs: [],
      assumptions: [{ label: "APR", value: `${c.apr}%` }],
      math: [],
      dataUsed: [{ source: "Loan contract", detail: `${usd(c.principalRemaining)} remaining` }],
      confidence: "high",
      highStakes: false,
      eligible: true,
    });
    options.push({
      id: "payment:refinance",
      moveType: "payment",
      title: `Refinance to ${newApr}% APR`,
      summary: `Your credit tier qualifies for ${newApr}%: about ${usd(oldPay - newPay)}/mo less, ${usd(refiSave)} over the loan.`,
      monthlyCost: r2(c.monthlyPayment - (oldPay - newPay)),
      savingsVsBaseline: r2(refiSave),
      tradeoffs: ["Credit check required", `${usd(fee)} processing fee`],
      assumptions: [
        { label: "Eligible APR (simulated, by credit tier)", value: `${newApr}%` },
        { label: "Remaining principal", value: usd(c.principalRemaining) },
        { label: "Term", value: `${n} months (unchanged)` },
      ],
      math: [
        { label: "Monthly change", formula: `amort(${usd(c.principalRemaining)}, ${c.apr}%→${newApr}%, ${n} mo)`, result: `−${usd(oldPay - newPay)}/mo` },
        { label: "Lifetime savings", formula: `${usd(oldPay - newPay)} × ${n} − ${usd(fee)} fee`, result: usd(refiSave) },
      ],
      dataUsed: [
        { source: "Loan contract", detail: `${c.apr}% APR · ${n} mo left` },
        { source: "Payment history", detail: "On-time record" },
      ],
      confidence: p.consent.paymentHistory ? "high" : "medium",
      highStakes: true,
      eligible: newApr < c.apr,
      ineligibleReason: newApr < c.apr ? undefined : "Your current rate is already competitive",
    });
    const extra = o.extraPrincipal ?? 100;
    const base = payoff(c.principalRemaining, c.apr, c.monthlyPayment, 0);
    const withExtra = payoff(c.principalRemaining, c.apr, c.monthlyPayment, extra);
    const interestSaved = base.interest - withExtra.interest;
    options.push({
      id: "payment:extra-principal",
      moveType: "payment",
      title: `Add ${usd(extra)}/mo to principal`,
      summary: `Finish ${base.months - withExtra.months} months early and save ${usd(interestSaved)} in interest.`,
      monthlyCost: r2(c.monthlyPayment + extra),
      savingsVsBaseline: r2(interestSaved),
      tradeoffs: ["Less cash on hand each month"],
      assumptions: [{ label: "Extra principal", value: `${usd(extra)}/mo` }],
      math: [{ label: "Interest saved", formula: `simulate payoff with +${usd(extra)}/mo`, result: usd(interestSaved) }],
      dataUsed: [{ source: "Loan contract", detail: `${usd(c.principalRemaining)} at ${c.apr}%` }],
      confidence: "high",
      highStakes: false,
      eligible: true,
    });
  } else {
    options.push({
      id: "payment:current",
      moveType: "payment",
      title: "Keep paying as you are",
      summary: `${usd(c.monthlyPayment)}/mo lease payment, ${c.monthsRemaining} left.`,
      monthlyCost: c.monthlyPayment,
      savingsVsBaseline: 0,
      tradeoffs: [],
      assumptions: [],
      math: [],
      dataUsed: [{ source: "Lease contract", detail: `${c.monthsRemaining} payments left` }],
      confidence: "high",
      highStakes: false,
      eligible: true,
    });
  }
  const banking = p.consent.banking;
  if (!banking) limitedBy.push("banking");
  const target = o.paymentDueDay ?? paydayDay[mockCashflowPayday[p.id]] + 1;
  options.push({
    id: "payment:due-date",
    moveType: "payment",
    title: `Move your due date to the ${ordinal(target)}`,
    summary: banking ? `Lands right after payday, so the payment never races your balance.` : "Turn on banking data to match your due date to payday.",
    savingsVsBaseline: p.id === "jordan" ? 78 : 0,
    tradeoffs: ["One partial-month payment during the switch"],
    assumptions: [
      { label: "Payday (from cash flow)", value: banking ? mockCashflowPayday[p.id] : "unknown" },
      { label: "Late fees avoided (est.)", value: p.id === "jordan" ? "$78/yr" : "$0" },
    ],
    math: [],
    dataUsed: banking ? [{ source: "Cash flow", detail: "Payday cadence, average balance" }] : [],
    confidence: banking ? "high" : "low",
    highStakes: false,
    eligible: banking,
    ineligibleReason: banking ? undefined : "Banking data is off",
  });
  return { moveType: "payment", baselineOptionId: "payment:current", options, limitedBy: limitedBy.length ? limitedBy : undefined };
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function protection(p: Persona): EngineResult {
  const startMonths = monthsBetween(p.toyotaCare.startDate, SNAPSHOT_DATE);
  const milesPerMonth = mockDrivingBase[p.id].avgMonthlyMiles;
  const monthsLeftByTime = Math.max(0, 24 - startMonths);
  const tcMilesUsed = Math.min(25000, milesPerMonth * startMonths);
  const monthsLeftByMiles = Math.max(0, Math.round((25000 - tcMilesUsed) / milesPerMonth));
  const monthsLeft = Math.min(monthsLeftByTime, monthsLeftByMiles);
  const expired = monthsLeft === 0;
  const offroad = p.preferences.lifestyleTags.includes("off-road");
  const keeps = p.contract.kind === "loan";
  const options: MoveOption[] = [
    {
      id: "protection:none",
      moveType: "protection",
      title: "No added protection",
      summary: expired ? "ToyotaCare has ended; repairs outside warranty are out of pocket." : `ToyotaCare covers scheduled maintenance for about ${monthsLeft} more months.`,
      savingsVsBaseline: 0,
      tradeoffs: ["Unplanned repair costs"],
      assumptions: [{ label: "ToyotaCare", value: "2 yr / 25,000 mi, whichever first" }],
      math: [],
      dataUsed: [{ source: "ToyotaCare", detail: `Started ${p.toyotaCare.startDate}` }],
      confidence: "high",
      highStakes: false,
      eligible: true,
    },
    {
      id: "protection:extended",
      moveType: "protection",
      title: "Extended service contract",
      summary: keeps ? `You plan to keep this car; coverage after ToyotaCare runs about $46/mo.` : "Worth it mainly if you buy out the car.",
      monthlyCost: 46,
      savingsVsBaseline: keeps ? 380 : -120,
      deadline: expired ? undefined : addMonths(SNAPSHOT_DATE, monthsLeft),
      tradeoffs: ["Adds to monthly cost", "Covers mechanical, not wear items"],
      assumptions: [
        { label: "Expected repair cost avoided (simulated)", value: keeps ? "$932 over 3 yrs" : "$432" },
        { label: "Plan price", value: "$46/mo · 36 mo" },
      ],
      math: [{ label: "ToyotaCare ends", formula: `min(${monthsLeftByTime} mo by time, ${monthsLeftByMiles} mo by miles)`, result: `${monthsLeft} mo` }],
      dataUsed: [
        { source: "ToyotaCare", detail: `${Math.round(tcMilesUsed).toLocaleString()} of 25,000 mi used` },
        { source: "Trip log", detail: `${milesPerMonth.toLocaleString()} mi/mo` },
      ],
      confidence: "medium",
      highStakes: false,
      eligible: true,
    },
    {
      id: "protection:tire-wheel",
      moveType: "protection",
      title: "Tire & wheel protection",
      summary: offroad ? "Your trail and ranch-road miles put tires at real risk; about $19/mo." : "Low pothole and trail exposure; probably not worth it.",
      monthlyCost: 19,
      savingsVsBaseline: offroad ? 290 : -110,
      tradeoffs: ["Pays off only if you damage a tire or wheel"],
      assumptions: [{ label: "Unpaved / trailhead share", value: offroad ? "18% of miles" : "<2% of miles" }],
      math: [],
      dataUsed: [{ source: "Trip log", detail: "Trailhead and unpaved destinations" }],
      confidence: offroad ? "high" : "medium",
      highStakes: false,
      eligible: true,
    },
  ];
  return { moveType: "protection", baselineOptionId: "protection:none", options, limitedBy: p.consent.driving ? undefined : ["driving"] };
}

function monthsBetween(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  return (db.getUTCFullYear() - da.getUTCFullYear()) * 12 + (db.getUTCMonth() - da.getUTCMonth());
}

export function mockRunWhatIf(p: Persona, moveType: MoveType, overrides: WhatIfOverrides = {}): EngineResult {
  switch (moveType) {
    case "lease-end":
      return leaseEnd(p, overrides);
    case "insurance":
      return insurance(p, overrides);
    case "payment":
      return payment(p, overrides);
    case "protection":
      return protection(p);
  }
}

export function mockEngines(p: Persona): Record<MoveType, EngineResult> {
  return {
    "lease-end": leaseEnd(p, {}),
    insurance: insurance(p, {}),
    payment: payment(p, {}),
    protection: protection(p),
  };
}
