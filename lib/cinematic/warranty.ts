import type { Persona } from "../types";
import type { RepairCategory } from "../engines/repair-advisor";

/** Toyota's published new-vehicle limited warranty terms (months / miles). The hybrid battery term is 10 yr / 150,000 mi for model year 2020+, otherwise 8 yr / 100,000 mi. */
export const TERMS = {
  basic: { label: "Basic warranty", months: 36, miles: 36_000 },
  powertrain: { label: "Powertrain warranty", months: 60, miles: 60_000 },
  hybridComponents: { label: "Hybrid components warranty", months: 96, miles: 100_000 },
  hybridBattery: (year: number) => year >= 2020 ? { label: "Hybrid battery warranty", months: 120, miles: 150_000 } : { label: "Hybrid battery warranty", months: 96, miles: 100_000 },
} as const;

export interface WarrantyLine { label: string; term: string; status: "active" | "ended"; detail: string }
export interface Coverage {
  /** True when a warranty term below is still running for this kind of repair. Never a promise. */
  mayBeCovered: boolean;
  lines: WarrantyLine[];
  summary: string;
  inServiceEstimate: string;
}

const monthsBetween = (fromIso: string, toIso: string) => {
  const a = new Date(`${fromIso.slice(0, 10)}T12:00:00Z`), b = new Date(`${toIso.slice(0, 10)}T12:00:00Z`);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + (b.getUTCDate() - a.getUTCDate()) / 30.4;
};
const termText = (t: { months: number; miles: number }) => `${t.months / 12 >= 3 && t.months % 12 === 0 ? `${t.months / 12} yr` : `${t.months} mo`} / ${t.miles.toLocaleString("en-US")} mi`;

/**
 * In-service date: the lease/loan start when the car was bought about when it was built; for a car bought
 * used (contract starts 2+ years after the model year) we only know the model year, so assume mid-year.
 */
export function inServiceDate(vehicle: Persona["vehicle"], contractStart: string) {
  return Number(contractStart.slice(0, 4)) - vehicle.year >= 2 ? `${vehicle.year}-07-01` : contractStart;
}

export function checkCoverage(persona: Persona, category: RepairCategory, opts: { hybridPart: boolean; asOf: string }): Coverage {
  const { vehicle, contract } = persona;
  const start = inServiceDate(vehicle, contract.startDate);
  const age = monthsBetween(start, opts.asOf);
  const wear = category === "brakes" || category === "tires";
  const terms: { label: string; months: number; miles: number }[] = [];
  if (!wear) {
    if (opts.hybridPart && vehicle.isHybrid) terms.push(TERMS.hybridBattery(vehicle.year), TERMS.hybridComponents);
    if (category === "engine" || category === "transmission") terms.push(TERMS.powertrain);
    terms.push(TERMS.basic);
  }
  const lines: WarrantyLine[] = terms.map((t) => {
    const active = age < t.months && vehicle.odometer < t.miles;
    return { label: t.label, term: termText(t), status: active ? "active" : "ended", detail: active ? `Still running (about ${Math.max(0, Math.round(t.months - age))} months left by date, ${(t.miles - vehicle.odometer).toLocaleString("en-US")} mi left).` : vehicle.odometer >= t.miles ? "Past the mileage limit." : "Past the time limit." };
  });
  const mayBeCovered = lines.some((l) => l.status === "active");
  const summary = wear
    ? "Brake pads, rotors and tires are wear items, so they aren’t warranty repairs. ToyotaCare covers scheduled maintenance only, not repairs."
    : mayBeCovered
      ? "This may be covered by Toyota’s factory warranty. Confirm with a Toyota dealer before paying for it. ToyotaCare covers scheduled maintenance only, not repairs."
      : "Toyota’s factory warranty terms for this kind of repair appear to have ended. ToyotaCare covers scheduled maintenance only, not repairs.";
  return { mayBeCovered, lines, summary, inServiceEstimate: start };
}
