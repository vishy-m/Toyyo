import { analyzeRepairDecision, classifyRepair, type RepairCategory, type RepairDecision } from "../engines/repair-advisor";
import { SNAPSHOT_DATE } from "../engines/common";
import type { Persona } from "../types";
import { checkCoverage, type Coverage } from "./warranty";

export type UrgencyLevel = "now" | "days" | "weeks" | "routine" | "inspect";
export type Worth = "worth" | "borderline" | "not-worth" | "lease" | "unknown";

export interface RepairDiagnosis {
  /** False when the description matched nothing we know: the only honest answer is an inspection. */
  understood: boolean;
  category: RepairCategory;
  title: string;
  parts: string[];
  urgency: { level: UrgencyLevel; label: string; detail: string };
  repairOrReplace: { verdict: "repair" | "replace" | "inspect"; part: string; text: string };
  cost: { low: number; high: number; basis: string };
  worth: { verdict: Worth; text: string; carValue: number; ratio: number };
  coverage: Coverage;
  hybridSpecific: boolean;
  /** OpenStreetMap service:vehicle:* keys a shop might carry for this job. */
  serviceKeys: string[];
  decision: RepairDecision;
  disclaimer: string;
}

export const DISCLAIMER = "General guidance from what you described, not a diagnosis. A technician has to inspect the car. Cost ranges are estimates, not quotes.";
const has = (text: string, ...words: string[]) => words.some((w) => text.includes(w));
const usdRange = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const SERVICE_KEYS: Record<RepairCategory, string[]> = {
  brakes: ["brakes"],
  battery: ["battery_charging", "batteries", "electrical"],
  tires: ["tyres", "wheel_alignment", "wheels"],
  ac: ["air_conditioning"],
  engine: ["diagnostics", "engine_tuning", "car_repair"],
  transmission: ["transmission"],
  unknown: [],
};

export function diagnoseRepair(issue: string, persona: Persona, opts: { savings?: number; asOf?: string } = {}): RepairDiagnosis {
  const text = issue.toLowerCase().replace(/\s+/g, " ").trim();
  const { vehicle, contract } = persona;
  const estimate = classifyRepair(text, vehicle.year);
  const category = estimate.category;
  const decision = analyzeRepairDecision({
    vehicle: { year: vehicle.year, model: vehicle.model, mileage: vehicle.odometer },
    issue: text,
    loanBalance: contract.kind === "loan" ? contract.principalRemaining : 0,
    currentPayment: contract.monthlyPayment,
    currentApr: contract.kind === "loan" ? contract.apr : 0,
    savings: opts.savings ?? 0,
    monthlySurplus: 300,
    downPayment: 0,
    credit: persona.creditTier,
    keepYears: 3,
  });
  const hybridPart = vehicle.isHybrid && has(text, "hybrid", "traction", "inverter", "hv ", "high voltage");
  const checkEngine = has(text, "check engine", "check-engine", "warning light", "light is on");
  const severe = has(text, "smoke", "overheat", "knock", "flashing", "burning", "no brakes", "pedal goes");

  let title = estimate.label, parts: string[] = [];
  let urgency: RepairDiagnosis["urgency"] = { level: "inspect", label: "Needs an inspection", detail: "Book an inspection so a technician can look at it before you spend money on parts." };
  let rr: RepairDiagnosis["repairOrReplace"] = { verdict: "inspect", part: "Unknown", text: "Nothing in your description points to a specific part. A technician can scan and inspect the car to find the cause before anyone replaces anything." };
  let cost = { low: estimate.low, high: estimate.high, basis: "Typical shop range for this kind of job, adjusted for the car’s age." };

  switch (category) {
    case "brakes": {
      const grinding = has(text, "grind", "metal", "scrap", "scrape");
      title = grinding ? "Grinding brakes" : "Brake wear";
      parts = ["Brake pads", "Brake rotors (discs)", "Calipers (if sticking)"];
      urgency = grinding || severe
        ? { level: "now", label: "Safety-critical: get it checked within days", detail: "Grinding usually means the pads are worn down to metal. Limit driving, avoid highways and long downhills, and stop if the pedal feels soft." }
        : { level: "weeks", label: "Book soon", detail: "Squealing is often the wear indicator on the pads. Have the brakes inspected in the next few weeks, sooner if the sound gets worse." };
      rr = grinding
        ? { verdict: "replace", part: "Pads and rotors", text: "After grinding, the pads are usually down to metal and the rotors are scored. Replacing pads and rotors together is usually wiser than resurfacing the rotors, which may be too thin or too damaged to resurface." }
        : { verdict: "repair", part: "Brake pads", text: "Replace the pads first. The rotors can often be resurfaced, or reused, if they are still above their minimum thickness. The shop will measure them." };
      break;
    }
    case "battery": {
      title = hybridPart ? "Hybrid battery" : "Battery or starting";
      parts = hybridPart ? ["Hybrid (traction) battery", "Hybrid system control"] : vehicle.isHybrid ? ["12-volt auxiliary battery", "Charging system"] : ["12-volt battery", "Alternator", "Starter"];
      urgency = { level: "days", label: "Get it tested in the next few days", detail: hybridPart ? "A hybrid battery warning can end with the car not driving. Have a Toyota dealer test it." : "A weak battery can strand you without warning. Most shops test batteries and charging systems quickly." };
      rr = hybridPart
        ? { verdict: "inspect", part: "Hybrid battery", text: "Hybrid batteries are tested and replaced by module or pack at a dealer. Don’t replace the whole pack before a diagnosis; one weak module is sometimes the cause." }
        : { verdict: "replace", part: vehicle.isHybrid ? "12-volt battery" : "Battery", text: "Batteries can’t be repaired. Have it load-tested first: if it fails, replace it. If it passes, the alternator or starter is the next suspect." };
      if (hybridPart) cost = { low: 1500, high: 4500, basis: "Rough range for hybrid battery work; pack replacement at a dealer varies widely." };
      break;
    }
    case "tires": {
      const vib = has(text, "vibrat", "wobble", "shake", "pull");
      title = vib ? "Vibration or pulling" : "Tires";
      parts = vib ? ["Tire balance", "Alignment", "Tires (belts or bulges)"] : ["Tires"];
      urgency = { level: "days", label: "Check in the next few days", detail: "Vibration at speed can come from out-of-balance wheels or a damaged tire. A bulge or exposed cord means stop driving on it." };
      rr = vib
        ? { verdict: "repair", part: "Balance and alignment first", text: "Balancing or aligning is cheap and often fixes it. Replace tires only if they are worn below 2/32\" of tread, uneven, or damaged." }
        : { verdict: "replace", part: "Tires", text: "Tires are replaced when worn or damaged. A puncture in the tread can often be plugged and patched, but not one in the sidewall." };
      if (vib) cost = { low: 60, high: 250, basis: "Balance and alignment range; new tires would be more (see replace guidance)." };
      break;
    }
    case "ac":
      title = "A/C not cooling";
      parts = ["Refrigerant level / leak", "Compressor", "Condenser"];
      urgency = { level: "routine", label: "Comfort issue: book when convenient", detail: "Not a safety issue, but a leak or failing compressor tends to get more expensive the longer it waits." };
      rr = { verdict: "repair", part: "Leak check first", text: "Have a technician check for a leak and recharge. Replace the compressor only if it has failed, since that’s the expensive part." };
      break;
    case "engine": {
      title = checkEngine ? "Check-engine light" : "Engine concern";
      parts = checkEngine ? ["Cause unknown until the codes are read"] : ["Cause unknown until inspected"];
      urgency = severe
        ? { level: "now", label: "Stop driving and get it checked", detail: "Knocking, overheating, smoke or a flashing check-engine light can destroy an engine within minutes. Don’t keep driving it." }
        : { level: "weeks", label: "Get the codes read this week or two", detail: "A steady check-engine light is rarely an emergency, but it can hide a problem that’s getting worse. Many parts stores read codes for free." };
      rr = { verdict: "inspect", part: "Unknown until diagnosed", text: "A check-engine light or engine noise can be anything from a loose gas cap to a major failure, so repair-or-replace can’t be judged yet. Start with a diagnostic scan; replacing an engine is a last resort." };
      if (checkEngine && !severe) cost = { low: 100, high: 200, basis: "Diagnostic scan only. The repair that follows could cost a lot more or nothing." };
      break;
    }
    case "transmission":
      title = "Transmission";
      parts = ["Transmission fluid", "Solenoids or sensors", "Transmission internals"];
      urgency = { level: "days", label: "Get it checked within days", detail: "Slipping or harsh shifting can turn a small repair into a rebuild. Avoid towing or hard driving until it’s checked." };
      rr = { verdict: "inspect", part: "Fluid and sensors first", text: "Start with a fluid check and scan for codes. Rebuild or replacement is only worth considering if the internals have failed." };
      break;
    default:
      title = "Needs an inspection";
  }

  // Is it worth repairing? Uses the car's estimated value (a rough age and mileage curve) and the repair's high estimate.
  const carValue = decision.privateSaleValue;
  const ratio = estimate.high / Math.max(1, carValue);
  let worth: RepairDiagnosis["worth"];
  if (estimate.needsInspection) worth = { verdict: "unknown", text: "Can’t judge until the car is inspected.", carValue, ratio };
  else if (rr.verdict === "inspect" && category === "engine" && checkEngine && !severe) worth = { verdict: "unknown", text: "Too early to say. Get the codes read first; the cost depends entirely on the cause.", carValue, ratio };
  else if (contract.kind === "lease") worth = { verdict: "lease", text: "This car is leased, so the question isn’t resale value. You’re responsible for keeping it maintained and may be charged for excess wear at turn-in, so fixing it is usually right.", carValue, ratio };
  else if (ratio >= 0.5) worth = { verdict: "not-worth", text: `The repair could run up to ${usdRange(estimate.high)}, about ${Math.round(ratio * 100)}% of the car’s estimated value (${usdRange(carValue)}). Get a second quote, and consider whether replacing the car makes more sense than repairing it.`, carValue, ratio };
  else if (ratio >= 0.25) worth = { verdict: "borderline", text: `The repair could run up to ${usdRange(estimate.high)}, about ${Math.round(ratio * 100)}% of the car’s estimated value (${usdRange(carValue)}). Worth fixing if the rest of the car is in good shape.`, carValue, ratio };
  else worth = { verdict: "worth", text: `The repair is small next to the car’s estimated value (${usdRange(carValue)}), so it’s worth fixing.`, carValue, ratio };

  return {
    understood: !estimate.needsInspection,
    category, title, parts, urgency, repairOrReplace: rr, cost, worth,
    coverage: checkCoverage(persona, category, { hybridPart, asOf: opts.asOf ?? SNAPSHOT_DATE }),
    hybridSpecific: hybridPart,
    serviceKeys: SERVICE_KEYS[category],
    decision,
    disclaimer: DISCLAIMER,
  };
}
