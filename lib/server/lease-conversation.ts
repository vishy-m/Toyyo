import { getDashboard } from "./dashboard";
import { applyAction } from "./actions";
import { getState, invalidatePanel } from "./store";
import { HttpError } from "./http";
import { addMonths, dollars, rates, round } from "../engines/common";
import { getInitialPanel } from "../agent/recommendations";
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

export async function evaluateLease(personaId: PersonaId) {
  const existing = conversations.get(personaId);
  if (existing && ["dealer-review", "approved", "declined"].includes(existing.stage)) return snapshot(existing);
  const dashboard = getDashboard(personaId);
  const { persona, driving } = dashboard;
  if (persona.contract.kind !== "lease") throw new HttpError(400, "This customer does not have a lease.");
  if (!persona.consent.driving || driving.totalMiles <= 0) throw new HttpError(400, "Driving history permission and recent trips are needed for a proactive mileage warning.");
  const contract = persona.contract;
  const start = contract.startingOdometer ?? rates.leaseStartingOdometer[personaId as keyof typeof rates.leaseStartingOdometer] ?? 0;
  const limit = start + contract.annualMileageAllowance * contract.termMonths / 12;
  const projected = round(persona.vehicle.odometer + driving.avgMonthlyMiles * contract.monthsRemaining);
  const excess = Math.max(0, round(projected - limit));
  const charge = round(excess * contract.overageRatePerMile);
  const flow: LeaseConversation = { personaId, stage: "idle", projectedExcessMiles: excess, projectedOverageCharge: charge, messages: [] };
  if (excess < 1000) {
    if (existing) { existing.projectedExcessMiles = excess; existing.projectedOverageCharge = charge; return snapshot(existing); }
    return flow;
  }
  if (existing && Math.abs(existing.projectedExcessMiles - excess) < 500) return snapshot(existing);
  const recommendation = (await getInitialPanel(personaId)).recommendations.find(item => item.moveType === "lease-end" && item.status === "proposed");
  const nextStep = recommendation ? ` Suggested next step: ${recommendation.action}` : "";
  const text = `Toyyo: Your ${persona.vehicle.model} is projected to finish ${Math.round(excess).toLocaleString()} miles over its lease limit, an estimated ${dollars(charge)} mileage charge if returned at that mileage. This uses your recent driving pace; final charges may differ.${nextStep} Reply OPTIONS to compare keeping, returning or switching cars. Reply STOP to end this demo conversation.`;
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
  if (value === "STOP" || value === "NO") {
    reply = "Toyyo: Understood. No dealer packet or vehicle change will be made.";
    nextStage = "declined";
  } else if (flow.stage === "warning" && ["OPTIONS", "YES"].includes(value)) {
    const dashboard = getDashboard(personaId);
    const options = dashboard.engines["lease-end"].options;
    const buyout = options.find(item => item.id === "lease-end:buyout")!;
    const switchTo = options.find(item => item.id === "lease-end:upgrade")!;
    reply = `Toyyo: Your choices include buying out your current car for an estimated ${dollars(buyout.totalCost ?? 0)} or exploring ${switchTo.upgradeModel?.name ?? "another Toyota"} at an estimated ${dollars(switchTo.monthlyCost ?? 0)}/month for 36 months. Returning still has an estimated ${dollars(flow.projectedOverageCharge)} mileage charge, plus any disposition fee. New lease pricing excludes taxes, registration and dealer fees and needs dealer approval. Reply SWITCH or BUYOUT for details; no application is sent yet.`;
    nextStage = "offer";
  } else if (flow.stage === "offer" && ["SWITCH", "BUYOUT"].includes(value)) {
    optionId = value === "SWITCH" ? "lease-end:upgrade" : "lease-end:buyout";
    const option = findOption(personaId, optionId);
    reply = `Toyyo: ${option.title}. ${option.summary} ${option.tradeoffs.join(" ")} Reply CONFIRM ${value} to create a simulated dealer review packet. This does not sign a contract or change your car.`;
  } else if (flow.stage === "offer" && /^CONFIRM (SWITCH|BUYOUT)$/.test(value)) {
    const requested = value.endsWith("SWITCH") ? "lease-end:upgrade" : "lease-end:buyout";
    if (flow.optionId !== requested) throw new HttpError(400, "Review the option before confirming it.");
    reply = "Toyyo: Your simulated packet is ready for dealer review. No application was sent to a real dealer. The demo dealer can now approve or decline it.";
    createPacket = true;
    nextStage = "dealer-review";
  } else {
    reply = flow.stage === "warning" ? "Toyyo: Reply OPTIONS to compare choices, or STOP to end." : "Toyyo: Reply SWITCH or BUYOUT, then confirm the choice shown. Reply STOP to end.";
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
