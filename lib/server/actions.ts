import type { ActionRequest, ActionResponse, ConsentSource, HandoffPacket } from "../types";
import { getDashboard } from "./dashboard";
import { HttpError } from "./http";
import { learn, learnAccept, learnDismiss, setStyle } from "./learning";
import { getState, invalidatePanel } from "./store";

export function applyAction(action: ActionRequest): ActionResponse {
  const state = getState(action.personaId);
  const before = new Set(state.preferences.learned.map(item => item.id));
  let packet: HandoffPacket | undefined;
  if (action.kind === "accept" || action.kind === "dismiss") {
    const dashboard = getDashboard(action.personaId);
    const option = Object.values(dashboard.engines).flatMap(engine => engine.options).find(option => option.id === action.optionId);
    if (!option) throw new HttpError(404, "Option not found for this customer.");
    if (action.kind === "accept") {
      if (!option.eligible) throw new HttpError(400, option.ineligibleReason ?? "This option is not eligible.");
      if (/hardship/i.test(option.id) && action.mode !== "specialist-callback") throw new HttpError(400, "A TFS specialist must help review hardship options.");
      packet = state.packets.find(packet => packet.optionId === option.id && packet.mode === action.mode);
      if (!packet) {
        packet = {
          id: crypto.randomUUID(), personaId: action.personaId, optionId: option.id, moveType: option.moveType, mode: action.mode,
          customerSummary: `${dashboard.persona.name} is reviewing ${option.title} for their ${dashboard.persona.vehicle.year} Toyota ${dashboard.persona.vehicle.model}. ${option.summary} This is a simulated handoff; no transaction or callback has been scheduled.`,
          numbers: [...option.assumptions.map(item => ({ ...item })), ...option.math.map(item => ({ label: item.label, value: `${item.result} (${item.formula})` }))],
          consentedData: (Object.keys(state.consent) as ConsentSource[]).filter(source => state.consent[source]),
          statedPreferences: [`Explanation: ${state.preferences.detailLevel}; format: ${state.preferences.format}`, ...Object.entries(state.preferences.priorityWeights).map(([key, value]) => `${key}: ${value.toFixed(2)}`), ...state.preferences.learned.filter(item => item.source === "explicit").map(item => item.statement)],
          createdAt: new Date().toISOString(),
        };
        state.packets.push(packet);
        if (!state.acceptedOptionIds.has(option.id)) learnAccept(state, option);
      }
    } else {
      if (!state.preferences.dismissed.some(item => item.optionId === option.id && item.reason === action.reason)) learnDismiss(state, option, action.reason);
    }
    state.recommendations = state.recommendations.map(item => item.optionId === option.id ? { ...item, status: action.kind === "accept" ? "accepted" : "dismissed" } : item);
  } else if (action.kind === "set_style") {
    setStyle(state, action);
  } else if (action.kind === "delete_learned") {
    const item = state.preferences.learned.find(item => item.id === action.learnedId);
    if (!item) throw new HttpError(404, "Learned preference not found.");
    state.preferences.learned = state.preferences.learned.filter(item => item.id !== action.learnedId);
    // Do not immediately infer a deleted driving item again.
    if (item.source === "driving") state.preferences.lifestyleTags = state.preferences.lifestyleTags.filter(tag => !item.statement.includes(tag));
  } else if (action.kind === "set_consent") {
    state.consent[action.source] = action.value;
    if (!action.value) {
      if (action.source === "driving") {
        const inferred = state.preferences.learned.filter(item => item.source === "driving");
        state.preferences.lifestyleTags = state.preferences.lifestyleTags.filter(tag => !inferred.some(item => item.statement.includes(tag)));
        state.preferences.learned = state.preferences.learned.filter(item => item.source !== "driving");
        state.drivingSeeded = false;
      }
      if (action.source === "paymentHistory" || action.source === "banking") state.preferences.learned = state.preferences.learned.filter(item => item.source !== "payments");
      // Generated copy can contain revoked data; discard it instead of reusing stale text.
      state.drafts = [];
      state.recommendations = [];
      state.packets = state.packets.map(packet => packet.consentedData.includes(action.source) ? {
        ...packet,
        customerSummary: `A simulated ${packet.moveType} handoff was prepared. Supporting data was removed after ${action.source} consent was revoked; review fresh options with the customer.`,
        numbers: [],
        consentedData: packet.consentedData.filter(source => source !== action.source),
      } : packet);
    }
    learn(state, `You turned ${action.source} data ${action.value ? "on" : "off"}.`, "explicit");
  }
  invalidatePanel(state);
  return { ok: true, preferences: structuredClone(state.preferences), ...(packet ? { packet } : {}), learned: state.preferences.learned.filter(item => !before.has(item.id)) };
}
