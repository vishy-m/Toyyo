import type { PersonaId, Persona, Trip, CashflowSummary } from '../types';
import maya from '../../data/personas/maya.json';
import garcia from '../../data/personas/garcia.json';
import jordan from '../../data/personas/jordan.json';
import raj from '../../data/personas/raj.json';
import mayaTrips from '../../data/trips/maya.trips.json';
import garciaTrips from '../../data/trips/garcia.trips.json';
import jordanTrips from '../../data/trips/jordan.trips.json';
import rajTrips from '../../data/trips/raj.trips.json';
import mayaCashflow from '../../data/cashflow/maya.json';
import garciaCashflow from '../../data/cashflow/garcia.json';
import jordanCashflow from '../../data/cashflow/jordan.json';
import rajCashflow from '../../data/cashflow/raj.json';

const personas = { maya, garcia, jordan, raj } as Record<PersonaId, Persona>;
const trips = { maya: mayaTrips, garcia: garciaTrips, jordan: jordanTrips, raj: rajTrips } as unknown as Record<PersonaId, Trip[]>;
const cashflows = { maya: mayaCashflow, garcia: garciaCashflow, jordan: jordanCashflow, raj: rajCashflow } as Record<PersonaId, CashflowSummary>;
const ids: PersonaId[] = ['maya', 'garcia', 'jordan', 'raj'];
// Return copies so runtime preference edits cannot mutate the shared seed.
export function getPersona(id: PersonaId): Persona {
  if (!Object.hasOwn(personas, id)) throw new Error(`Unknown persona: ${id}`);
  return structuredClone(personas[id]);
}
export function listPersonas(): Persona[] { return ids.map(getPersona); }
export function getTrips(id: PersonaId): Trip[] { getPersona(id); return structuredClone(trips[id]); }
export function getTrip(tripId: string): Trip | undefined {
  const found = ids.flatMap(id => trips[id]).find(trip => trip.id === tripId);
  return found ? structuredClone(found) : undefined;
}
export function getCashflow(id: PersonaId): CashflowSummary { getPersona(id); return structuredClone(cashflows[id]); }
