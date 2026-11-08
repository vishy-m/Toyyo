import { getDashboard } from "./dashboard";
import { applyAction } from "./actions";
import { getState, invalidatePanel } from "./store";
import { HttpError } from "./http";
import { addMonths, dollars, rates, round } from "../engines/common";
import { sendPhotonText } from "./photon";
import type { HandoffPacket, LeaseContract, MoveOption, PersonaId } from "../types";

export type LeaseStage = "idle" | "warning" | "offer" | "dealer-review" | "approved" | "declined";
export interface LeaseMessage { direction: "out" | "in"; text: string; at: string; delivery: "simulated" | "accepted" | "received" }
export interface LeaseConversation {
  personaId: PersonaId;
  stage: LeaseStage;
  projectedExcessMiles: number;
  projectedOverageCharge: number;
  optionId?: string;
  packet?: HandoffPacket;
  messages: LeaseMessage[];
  nextPaymentDue?: string;
}
const root = globalThis as typeof globalThis & { __toyyoLeaseConversations?: Map<PersonaId, LeaseConversation> };
const conversations = root.__toyyoLeaseConversations ??= new Map<PersonaId, LeaseConversation>();
const inboundEvents = new Set<string>();
const now = () => new Date().toISOString();
const snapshot = (flow: LeaseConversation) => structuredClone(flow);
const message = (flow: LeaseConversation, direction: LeaseMessage["direction"], text: string, delivery: LeaseMessage["delivery"]) => flow.messages.push({ direction, text, delivery, at: now() });

export function getLeaseConversation(personaId: PersonaId): LeaseConversation {
  if (!getState(personaId).consent.driving) {
    conversations.delete(personaId);
    return { personaId, stage: "idle", projectedExcessMiles: 0, projectedOverageCharge: 0, messages: [] };
  }
  return snapshot(conversations.get(personaId) ?? { personaId, stage: "idle", projectedExcessMiles: 0, projectedOverageCharge: 0, messages: [] });
}

export function stopProactiveLease(personaId: PersonaId) {
  const flow = conversations.get(personaId) ?? { personaId, stage: "idle" as LeaseStage, projectedExcessMiles: 0, projectedOverageCharge: 0, messages: [] };
  flow.stage = "declined";
  conversations.set(personaId, flow);
  return snapshot(flow);
}

export function resumeProactiveLease(personaId: PersonaId) {
  if (conversations.get(personaId)?.stage === "declined") conversations.delete(personaId);
  return getLeaseConversation(personaId);
}

/** A resolved Spectrum send means the SDK accepted the message, not that the phone displayed it. */
async function sendText(flow: LeaseConversation, text: string, key: string) {
  message(flow, "out", text, await sendPhotonText(flow.personaId, text, key));
}

const miles = (n: number) => Math.round(n).toLocaleString("en-US");
const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** The lease's mileage position and the engine's priced options, for the texts. All figures come from the engines. */
function leasePlan(personaId: PersonaId) {
  const dashboard = getDashboard(personaId);
  const { persona, driving } = dashboard;
  if (persona.contract.kind !== "lease") throw new HttpError(400, "This customer does not have a lease.");
  const contract = persona.contract;
  const start = contract.startingOdometer ?? rates.leaseStartingOdometer[personaId as keyof typeof rates.leaseStartingOdometer] ?? 0;
  const limit = start + contract.annualMileageAllowance * contract.termMonths / 12;
  const projected = round(persona.vehicle.odometer + driving.avgMonthlyMiles * contract.monthsRemaining);
  const excess = Math.max(0, round(projected - limit));
  const months = Math.max(1, contract.monthsRemaining);
  const budget = Math.max(0, Math.floor((limit - persona.vehicle.odometer) / months)); // miles a month that stay under the limit
  const options = dashboard.engines["lease-end"].options;
  const pick = (id: string) => options.find(item => item.id === `lease-end:${id}`);
  return {
    persona, driving, contract, excess, budget, pace: Math.round(driving.avgMonthlyMiles),
    charge: round(excess * contract.overageRatePerMile), leaseEnd: shortDate(addMonths(contract.startDate, contract.termMonths)),
    returnOption: pick("return"), buyout: pick("buyout"), upgrade: pick("upgrade"),
  };
}

/** Numbered next steps the driver can pick by replying 1-4. */
function leaseMenu(plan: ReturnType<typeof leasePlan>) {
  const { budget, pace, contract, buyout, upgrade, returnOption, excess } = plan;
  return [
    "What you can do:",
    budget > 0
      ? `1. Drive less: about ${miles(budget)} mi a month (${miles(budget / 30)} a day) keeps you under the limit. You're averaging ${miles(pace)}.`
      : `1. Drive less: you're at the limit already, so every extra mile adds ${dollars(contract.overageRatePerMile)}.`,
    `2. Buy it out: about ${dollars(buyout?.totalCost ?? 0)}. Mileage charges only apply if you return the car.`,
    `3. Switch to a ${upgrade?.upgradeModel?.name ?? "new Toyota"} lease: about ${dollars(upgrade?.monthlyCost ?? 0)}/mo.`,
    `4. Return it as is: about ${dollars(returnOption?.totalCost ?? 0)} due, for ${miles(excess)} extra miles plus fees.`,
    "Reply 1, 2, 3 or 4 for the steps, or STOP to end.",
  ].join("\n");
}

/** Step-by-step texts for each numbered choice. Buyout and switch can then be confirmed into a simulated dealer packet. */
function leaseSteps(choice: 1 | 2 | 3 | 4, plan: ReturnType<typeof leasePlan>) {
  const { budget, pace, contract, buyout, upgrade, returnOption, excess, leaseEnd, charge } = plan;
  if (choice === 1) return [
    `Toyyo: Plan 1, drive less until ${leaseEnd}:`,
    budget > 0 ? `1. Aim for ${miles(budget)} mi a month, about ${miles(budget / 30)} a day. You're at ${miles(pace)} now.` : `1. Keep driving to a minimum; you're already at the limit.`,
    "2. Move long trips to another car, a carpool or transit where you can.",
    "3. Watch the mileage gauge in Toyyo; it updates with each trip.",
    `Every mile over the limit costs ${dollars(contract.overageRatePerMile)}. Reply 2, 3 or 4 to compare other options.`,
  ].join("\n");
  if (choice === 2) return [
    `Toyyo: Plan 2, buy it out (about ${dollars(buyout?.totalCost ?? 0)}):`,
    "1. Ask Toyota Financial Services for your exact payoff quote.",
    `2. Pay cash or finance it, about ${dollars(buyout?.monthlyCost ?? 0)}/mo over 60 months at your credit tier.`,
    `3. Finish the purchase at a Toyota dealer before ${leaseEnd}. Keeping the car means no mileage charge.`,
    "Reply CONFIRM BUYOUT to send a simulated packet to the demo dealer. Nothing is signed or sent to a real dealer.",
  ].join("\n");
  if (choice === 3) return [
    `Toyyo: Plan 3, switch to a ${upgrade?.upgradeModel?.name ?? "new Toyota"} (about ${dollars(upgrade?.monthlyCost ?? 0)}/mo for 36 months):`,
    "1. Pick a trim and test drive it at a Toyota dealer.",
    `2. Ask whether a loyalty offer can reduce the ${dollars(charge)} mileage charge on this lease. Not guaranteed.`,
    "3. Apply for the new lease. The dealer sets final pricing, taxes and fees.",
    "Reply CONFIRM SWITCH to send a simulated packet to the demo dealer. Nothing is signed or sent to a real dealer.",
  ].join("\n");
  return [
    `Toyyo: Plan 4, return it as is (about ${dollars(returnOption?.totalCost ?? 0)}):`,
    `1. Book the pre-return inspection by ${returnOption?.deadline ? shortDate(returnOption.deadline) : "30 days before the lease ends"}.`,
    "2. Fix small damage first if it costs less than the wear charge.",
    `3. Return it at any Toyota dealer by ${leaseEnd}. The bill covers ${miles(excess)} extra miles at ${dollars(contract.overageRatePerMile)} plus the ${dollars(contract.dispositionFee)} disposition fee.`,
    "Reply 1, 2 or 3 to compare other options.",
  ].join("\n");
}

/** Clears this customer's conversation so the proactive text can be sent again (demo resets). */
export function resetLease(personaId: PersonaId) {
  conversations.delete(personaId);
  return getLeaseConversation(personaId);
}

export async function evaluateLease(personaId: PersonaId) {
  const existing = conversations.get(personaId);
  if (existing && ["dealer-review", "approved", "declined"].includes(existing.stage)) return snapshot(existing);
  const plan = leasePlan(personaId);
  const { persona, driving, excess, charge } = plan;
  if (!persona.consent.driving || driving.totalMiles <= 0) throw new HttpError(400, "Driving history permission and recent trips are needed for a proactive mileage warning.");
  const flow: LeaseConversation = { personaId, stage: "idle", projectedExcessMiles: excess, projectedOverageCharge: charge, messages: [] };
  if (excess < 1000) {
    if (existing) { existing.projectedExcessMiles = excess; existing.projectedOverageCharge = charge; return snapshot(existing); }
    return flow;
  }
  if (existing && Math.abs(existing.projectedExcessMiles - excess) < 500) return snapshot(existing);
  const text = `Toyyo: Heads up, ${persona.name}. At your recent pace, your ${persona.vehicle.model} will finish about ${miles(excess)} miles over its lease limit by ${plan.leaseEnd}: an estimated ${dollars(charge)} mileage charge if you return it. Final charges may differ.\n\n${leaseMenu(plan)}`;
  const current = existing ?? flow;
  await sendText(current, text, `toyyo-${personaId}-mileage-warning-${Math.floor(excess / 500)}`);
  current.projectedExcessMiles = excess;
  current.projectedOverageCharge = charge;
  current.stage = "warning";
  current.optionId = undefined;
  conversations.set(personaId, current);
  return snapshot(current);
}

export async function updateLeaseMileage(personaId: PersonaId, odometer: number) {
  const dashboard = getDashboard(personaId);
  if (dashboard.persona.contract.kind !== "lease") throw new HttpError(400, "This customer does not have a lease.");
  if (odometer < dashboard.persona.vehicle.odometer) throw new HttpError(400, "The new odometer cannot be lower than the current reading.");
  const state = getState(personaId);
  state.currentVehicle = { ...dashboard.persona.vehicle, odometer };
  invalidatePanel(state);
  return evaluateLease(personaId);
}

function findOption(personaId: PersonaId, id: string): MoveOption {
  const option = getDashboard(personaId).engines["lease-end"].options.find(item => item.id === id);
  if (!option?.eligible) throw new HttpError(400, "That lease option is unavailable.");
  return option;
}

export async function replyToLease(personaId: PersonaId, text: string, eventId?: string) {
  if (!getState(personaId).consent.driving) {
    conversations.delete(personaId);
    throw new HttpError(409, "Driving permission was turned off; this conversation has ended.");
  }
  const flow = conversations.get(personaId);
  if (eventId && inboundEvents.has(eventId) && flow) return snapshot(flow);
  if (!flow || !["warning", "offer"].includes(flow.stage)) throw new HttpError(409, "There is no active lease conversation for this customer.");
  const value = text.trim().toUpperCase();
  let reply: string;
  let nextStage: LeaseStage = flow.stage;
  let optionId = flow.optionId;
  let createPacket = false;
  // 1-4 pick a numbered plan; the words still work: OPTIONS (the list), BUYOUT = 2, SWITCH = 3.
  const choice = /^[1-4]$/.test(value) ? Number(value) as 1 | 2 | 3 | 4 : value === "BUYOUT" ? 2 : value === "SWITCH" ? 3 : null;
  if (value === "STOP" || value === "NO") {
    reply = "Toyyo: Understood. No dealer packet or vehicle change will be made.";
    nextStage = "declined";
  } else if (value === "OPTIONS" || value === "MENU" || (flow.stage === "warning" && value === "YES")) {
    reply = `Toyyo: ${leaseMenu(leasePlan(personaId))}`;
    nextStage = "offer";
  } else if (choice) {
    if (choice === 2 || choice === 3) {
      optionId = choice === 2 ? "lease-end:buyout" : "lease-end:upgrade";
      findOption(personaId, optionId); // throws if the engine marks it unavailable
    }
    reply = leaseSteps(choice, leasePlan(personaId));
    nextStage = "offer";
  } else if (flow.stage === "offer" && /^CONFIRM (SWITCH|BUYOUT)$/.test(value)) {
    const requested = value.endsWith("SWITCH") ? "lease-end:upgrade" : "lease-end:buyout";
    if (flow.optionId !== requested) throw new HttpError(400, "Review the option before confirming it.");
    reply = "Toyyo: Your simulated packet is ready for dealer review. No application was sent to a real dealer. The demo dealer can now approve or decline it.";
    createPacket = true;
    nextStage = "dealer-review";
  } else {
    reply = "Toyyo: Reply 1, 2, 3 or 4 for the steps, OPTIONS for the list, or STOP to end.";
  }
  await sendText(flow, reply, `toyyo-${personaId}-${eventId ?? crypto.randomUUID()}`);
  message(flow, "in", text, "received");
  if (createPacket && optionId) {
    flow.packet = applyAction({ kind: "accept", personaId, optionId, mode: "specialist-callback" }).packet;
    if (flow.packet) {
      const dashboard = getDashboard(personaId);
      flow.packet.numbers.push(
        { label: "Current vehicle", value: `${dashboard.persona.vehicle.year} Toyota ${dashboard.persona.vehicle.model}` },
        { label: "Current VIN", value: dashboard.persona.vehicle.vin },
        { label: "Current odometer", value: `${dashboard.persona.vehicle.odometer} miles` },
        { label: "Credit tier", value: dashboard.persona.creditTier },
        { label: "Projected mileage charge", value: dollars(flow.projectedOverageCharge) },
      );
      if (dashboard.cashflow && dashboard.persona.consent.banking) flow.packet.numbers.push({ label: "Average account balance (synthetic)", value: dollars(dashboard.cashflow.avgBalance) });
    }
  }
  flow.optionId = optionId;
  flow.stage = nextStage;
  if (eventId) inboundEvents.add(eventId);
  return snapshot(flow);
}

export async function approveLease(personaId: PersonaId) {
  const flow = conversations.get(personaId);
  if (!flow || flow.stage !== "dealer-review" || !flow.packet || !flow.optionId) throw new HttpError(409, "A confirmed dealer packet is required first.");
  const option = findOption(personaId, flow.optionId);
  if (option.monthlyCost === undefined) throw new HttpError(400, "This option has no monthly payment estimate.");
  const state = getState(personaId);
  const previous = getDashboard(personaId).persona;
  if (previous.contract.kind !== "lease") throw new HttpError(409, "The original lease is no longer active.");
  const startDate = now().slice(0, 10);
  const contract: LeaseContract = { ...previous.contract, startDate, termMonths: 36, monthsRemaining: 36, monthlyPayment: option.monthlyCost, startingOdometer: 0 };
  const due = addMonths(startDate, 1);
  const text = option.upgradeModel
    ? `Toyyo demo: The dealer approved the simulated ${option.upgradeModel.name} lease. Estimated payment: ${dollars(contract.monthlyPayment)} monthly, with the first payment shown for ${due}. This lease retains the current mileage allowance; ask the dealer for a higher-mileage quote. Taxes, registration and fees are excluded.`
    : `Toyyo demo: The dealer approved a simulated buyout of your ${previous.vehicle.model}. Estimated financed payment: ${dollars(option.monthlyCost)} monthly, first shown for ${due}. Actual financing, taxes and fees need dealer confirmation.`;
  await sendText(flow, text, `toyyo-${personaId}-dealer-approved`);
  if (option.upgradeModel) {
    const isHybrid = /hybrid/i.test(option.upgradeModel.name);
    state.currentVehicle = { ...previous.vehicle, year: new Date().getUTCFullYear(), model: option.upgradeModel.name, bodyStyle: option.upgradeModel.bodyStyle, modelAsset: option.upgradeModel.modelAsset, odometer: 0, vin: `SYNTHETIC-NEW-${personaId.toUpperCase()}`, isHybrid, mpg: 0 };
    state.currentContract = contract;
  } else {
    state.currentContract = { kind: "loan", startDate, termMonths: 60, monthsRemaining: 60, monthlyPayment: option.monthlyCost, apr: rates.aprByCreditTier[previous.creditTier], principalRemaining: option.totalCost ?? 0, autopay: false };
  }
  state.currentPaymentDueDay = Number(due.slice(-2));
  invalidatePanel(state);
  flow.stage = "approved";
  flow.nextPaymentDue = due;
  return snapshot(flow);
}
