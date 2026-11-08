import type { PersonaId, Persona, Preferences, DashboardData, MoveType, WhatIfOverrides, EngineResult, Trip } from '../types';
import { getPersona, getTrips, getCashflow } from '../data';
import { computeDrivingSummary } from './driving';
import { computeLeaseEndOptions } from './lease-end';
import { computeInsuranceOptions } from './insurance';
import { computePaymentOptions } from './payment';
import { computeProtectionOptions } from './protection';
import { computeTripInsights } from './insights';
import { rankMoves } from './rank';
export { computeTfsMetrics } from './tfs';
export type EngineRuntime = { preferences: Preferences; consent: Persona['consent']; currentVehicle?: Persona['vehicle']; currentContract?: Persona['contract']; currentPaymentDueDay?: number };
function tripSummary(trip: Trip): Omit<Trip, 'path' | 'events'> {
  return {
    id: trip.id, personaId: trip.personaId, start: trip.start, end: trip.end,
    miles: trip.miles, highwayPct: trip.highwayPct, nightPct: trip.nightPct,
    speedingPct: trip.speedingPct, hardBrakes: trip.hardBrakes,
    fastAccels: trip.fastAccels, harshCorners: trip.harshCorners,
    category: trip.category, destinationLabel: trip.destinationLabel,
    score: trip.score, showcase: trip.showcase,
  };
}
function context(personaId:PersonaId,runtime:EngineRuntime) {
  const persona=getPersona(personaId);
  if(runtime.currentVehicle) persona.vehicle=structuredClone(runtime.currentVehicle);
  if(runtime.currentContract) persona.contract=structuredClone(runtime.currentContract);
  persona.consent=structuredClone(runtime.consent);
  persona.preferences=structuredClone(runtime.preferences);
  const trips=persona.consent.driving?getTrips(personaId):[];
  const driving=computeDrivingSummary(persona,trips);
  const cashflow=persona.consent.banking?getCashflow(personaId):null;
  if(cashflow&&runtime.currentPaymentDueDay) cashflow.paymentDueDay=runtime.currentPaymentDueDay;
  if(cashflow&&!persona.consent.paymentHistory) cashflow.latePaymentsLast12=0;
  return {persona,trips,driving,cashflow};
}
export function buildDashboard(personaId:PersonaId,runtime:EngineRuntime):DashboardData {
  const {persona,trips,driving,cashflow}=context(personaId,runtime);
  const engines:Record<MoveType,EngineResult>={
    'lease-end':computeLeaseEndOptions(persona,driving),insurance:computeInsuranceOptions(persona,driving),payment:computePaymentOptions(persona,cashflow),protection:computeProtectionOptions(persona,driving),
  };
  return {persona,driving,cashflow,engines,ranked:rankMoves(persona,engines,driving,cashflow,persona.preferences),tripInsights:computeTripInsights(persona,trips,driving),trips:trips.map(tripSummary),preferences:persona.preferences};
}
export function runWhatIf(personaId:PersonaId,moveType:MoveType,overrides:WhatIfOverrides,runtime:EngineRuntime):EngineResult {
  const {persona,driving,cashflow}=context(personaId,runtime);
  switch(moveType) {
    case 'lease-end':return computeLeaseEndOptions(persona,driving,overrides);
    case 'insurance':return computeInsuranceOptions(persona,driving,overrides);
    case 'payment':return computePaymentOptions(persona,cashflow,overrides);
    case 'protection':return computeProtectionOptions(persona,driving);
    default:throw new Error(`Unknown move type: ${moveType}`);
  }
}
