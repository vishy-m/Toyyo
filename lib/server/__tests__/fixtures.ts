import type { DashboardData, MoveOption, Persona, PersonaId, Preferences } from "../../types";
export const option: MoveOption = {
  id: "payment:refinance", moveType: "payment", title: "Refinance your loan", summary: "Estimated savings of $1,120.", monthlyCost: 300, savingsVsBaseline: 1120,
  tradeoffs: ["Subject to approval"], assumptions: [{ label: "APR", value: "6.9%" }], math: [{ label: "Savings", formula: "baseline - cost", result: "$1,120" }], dataUsed: [], confidence: "medium", highStakes: true, eligible: true,
};
export function fakeDashboard(id: PersonaId, runtime: { preferences: Preferences; consent: Persona["consent"] }, persona: Persona): DashboardData {
  const lease = { ...option, id: "lease-end:buyout", moveType: "lease-end" as const, title: "Buy out your Toyota" };
  return {
    persona: { ...persona, consent: runtime.consent, preferences: runtime.preferences }, preferences: runtime.preferences,
    driving: { windowDays: 90, totalMiles: 3600, avgMonthlyMiles: 1200, monthlyMiles: [], categoryMiles: { commute: 3600, errand: 0, childcare: 0, "road-trip": 0, trailhead: 0, other: 0 }, topDestinations: [], score: 90, scoreFactors: [], smoothStreak: 5, lifestyleTags: ["road-tripper"] },
    cashflow: { payday: "biweekly-fri", avgBalance: 1000, paymentDueDay: 15, latePaymentsLast12: 1, recurringShortfall: false },
    engines: { payment: { moveType: "payment", baselineOptionId: option.id, options: [option, { ...option, id: "payment:hardship", title: "Payment support", summary: "Review with a specialist." }] }, "lease-end": { moveType: "lease-end", baselineOptionId: lease.id, options: [lease] }, insurance: { moveType: "insurance", baselineOptionId: "", options: [] }, protection: { moveType: "protection", baselineOptionId: "", options: [] } },
    ranked: [{ rank: 1, optionId: option.id, moveType: "payment", score: 1, breakdown: { impact: 1, preferenceFit: 1, urgency: 1, confidence: 1 } }], trips: [], tripInsights: [],
  };
}
