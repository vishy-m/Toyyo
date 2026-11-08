import { buildDashboard } from "../engines";
import { getCaseFile } from "../data";
import type { DashboardData, PersonaId } from "../types";
import { getState } from "./store";
import { seedDrivingLearning } from "./learning";

export function getDashboard(id: PersonaId): DashboardData {
  const state = getState(id);
  const dashboard = buildDashboard(id, state);
  seedDrivingLearning(state, dashboard.driving);
  dashboard.preferences = structuredClone(state.preferences);
  dashboard.persona = { ...dashboard.persona, consent: { ...state.consent }, preferences: dashboard.preferences };
  dashboard.ranked = dashboard.ranked.filter(move => !state.suppressedOptionIds.has(move.optionId) && !state.acceptedOptionIds.has(move.optionId) && !state.preferences.suppressedMoveTypes.includes(move.moveType));
  dashboard.caseFile = getCaseFile(id);
  if (!state.consent.banking) dashboard.cashflow = null;
  if (!state.consent.paymentHistory && dashboard.cashflow) dashboard.cashflow = { ...dashboard.cashflow, latePaymentsLast12: 0 };
  if (!state.consent.driving) {
    dashboard.trips = [];
    dashboard.tripInsights = [];
    dashboard.driving = { windowDays: 0, totalMiles: 0, avgMonthlyMiles: 0, monthlyMiles: [], categoryMiles: { commute: 0, errand: 0, childcare: 0, "road-trip": 0, trailhead: 0, other: 0 }, topDestinations: [], score: 0, scoreFactors: [], smoothStreak: 0, lifestyleTags: [] };
  }
  return dashboard;
}
// Model context omits fields entirely when consent is off; zero-filled UI data is not evidence.
export function agentContext(dashboard: DashboardData) {
  const consent = dashboard.persona.consent;
  const cashflow = dashboard.cashflow ? { ...dashboard.cashflow, latePaymentsLast12: consent.paymentHistory ? dashboard.cashflow.latePaymentsLast12 : undefined } : null;
  return {
    persona: dashboard.persona, preferences: dashboard.preferences, caseFile: dashboard.caseFile,
    driving: consent.driving ? dashboard.driving : null,
    cashflow, engines: dashboard.engines, ranked: dashboard.ranked,
    tripInsights: dashboard.tripInsights, trips: dashboard.trips,
  };
}
