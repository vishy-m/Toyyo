import type { Trip } from '../types';

export type ScoreInput = Pick<Trip, 'miles' | 'hardBrakes' | 'fastAccels' | 'harshCorners' | 'speedingPct' | 'nightPct'>;
export function scorePenalties(trip: ScoreInput) {
  // Cap each event factor so a single event on a very short trip cannot dominate.
  const miles = Math.max(1, trip.miles);
  return {
    braking: Math.min(25, trip.hardBrakes * 100 / miles * 1.5),
    acceleration: Math.min(15, trip.fastAccels * 100 / miles),
    cornering: Math.min(10, trip.harshCorners * 100 / miles),
    speeding: Math.max(0, Math.min(1, trip.speedingPct)) * 20,
    night: Math.max(0, Math.min(1, trip.nightPct)) * 8,
  };
}
/** Synthetic Drive Pulse-style score, not Toyota's proprietary formula. */
export function computeTripScore(trip: ScoreInput): number {
  return Math.round(Math.max(0, Math.min(100, 100 - Object.values(scorePenalties(trip)).reduce((a, b) => a + b, 0))));
}
