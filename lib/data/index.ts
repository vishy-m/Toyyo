import type { PersonaId, Persona, Trip, CashflowSummary, CaseFile } from '../types';
import maya from '../../data/personas/maya.json';
import garcia from '../../data/personas/garcia.json';
import jordan from '../../data/personas/jordan.json';
import raj from '../../data/personas/raj.json';
import nora from '../../data/personas/nora.json';
import eli from '../../data/personas/eli.json';
import ava from '../../data/personas/ava.json';
import theo from '../../data/personas/theo.json';
import ryan from '../../data/personas/ryan.json';
import devon from '../../data/personas/devon.json';
import priya from '../../data/personas/priya.json';
import mayaTrips from '../../data/trips/maya.trips.json';
import garciaTrips from '../../data/trips/garcia.trips.json';
import jordanTrips from '../../data/trips/jordan.trips.json';
import rajTrips from '../../data/trips/raj.trips.json';
import noraTrips from '../../data/trips/nora.trips.json';
import eliTrips from '../../data/trips/eli.trips.json';
import avaTrips from '../../data/trips/ava.trips.json';
import theoTrips from '../../data/trips/theo.trips.json';
import ryanTrips from '../../data/trips/ryan.trips.json';
import devonTrips from '../../data/trips/devon.trips.json';
import priyaTrips from '../../data/trips/priya.trips.json';
import mayaCashflow from '../../data/cashflow/maya.json';
import garciaCashflow from '../../data/cashflow/garcia.json';
import jordanCashflow from '../../data/cashflow/jordan.json';
import rajCashflow from '../../data/cashflow/raj.json';
import noraCashflow from '../../data/cashflow/nora.json';
import eliCashflow from '../../data/cashflow/eli.json';
import avaCashflow from '../../data/cashflow/ava.json';
import theoCashflow from '../../data/cashflow/theo.json';
import ryanCashflow from '../../data/cashflow/ryan.json';
import devonCashflow from '../../data/cashflow/devon.json';
import priyaCashflow from '../../data/cashflow/priya.json';
import jordanCase from '../../data/cases/jordan.json';
import noraCase from '../../data/cases/nora.json';
import eliCase from '../../data/cases/eli.json';
import theoCase from '../../data/cases/theo.json';
import ryanCase from '../../data/cases/ryan.json';
import devonCase from '../../data/cases/devon.json';
import priyaCase from '../../data/cases/priya.json';

const personas = { maya, garcia, jordan, raj, nora, eli, ava, theo, ryan, devon, priya } as Record<PersonaId, Persona>;
const trips = { maya: mayaTrips, garcia: garciaTrips, jordan: jordanTrips, raj: rajTrips, nora: noraTrips, eli: eliTrips, ava: avaTrips, theo: theoTrips, ryan: ryanTrips, devon: devonTrips, priya: priyaTrips } as unknown as Record<PersonaId, Trip[]>;
const cashflows = { maya: mayaCashflow, garcia: garciaCashflow, jordan: jordanCashflow, raj: rajCashflow, nora: noraCashflow, eli: eliCashflow, ava: avaCashflow, theo: theoCashflow, ryan: ryanCashflow, devon: devonCashflow, priya: priyaCashflow } as Record<PersonaId, CashflowSummary>;
const ids: PersonaId[] = ['maya', 'garcia', 'jordan', 'raj', 'nora', 'eli', 'ava', 'theo', 'ryan', 'devon', 'priya'];
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

// Case files exist for the seven carousel personas only (data/cases).
const cases: Partial<Record<PersonaId, CaseFile>> = { jordan: jordanCase, nora: noraCase, eli: eliCase, theo: theoCase, ryan: ryanCase, devon: devonCase, priya: priyaCase } as Partial<Record<PersonaId, CaseFile>>;
export function getCaseFile(id: PersonaId): CaseFile | undefined { return cases[id] ? structuredClone(cases[id]) : undefined; }
