import type { DismissReason, DrivingSummary, LearnedItem, MoveOption, Preferences, Priority } from "../types";
import { invalidatePanel, type PersonaState } from "./store";

export function learn(state: PersonaState, statement: string, source: LearnedItem["source"] = "behavior", confidence = 1): LearnedItem {
  const item: LearnedItem = { id: crypto.randomUUID(), statement, source, confidence, createdAt: new Date().toISOString() };
  state.preferences.learned.push(item);
  invalidatePanel(state);
  return item;
}
export function boostPriority(preferences: Preferences, priority: Priority) {
  preferences.priorityWeights[priority] += 0.1;
  const total = Object.values(preferences.priorityWeights).reduce((sum, value) => sum + value, 0);
  for (const key of Object.keys(preferences.priorityWeights) as Priority[]) preferences.priorityWeights[key] /= total;
}
// Preference fit only; financial figures always come from the engines.
export function dominantPriority(option: MoveOption): Priority {
  if (/extra|payoff|buyout/.test(option.id)) return "totalCost";
  if (/upgrade|tire|wheel|protection/.test(option.id)) return "lifestyleFit";
  if (/return|date|defer|hardship/.test(option.id)) return "flexibility";
  return "monthlyPayment";
}
const priorityLabels: Record<Priority, string> = {
  monthlyPayment: "lower monthly payments", totalCost: "lower total cost", flexibility: "flexibility", lifestyleFit: "a fit for your lifestyle",
};
export function learnAccept(state: PersonaState, option: MoveOption) {
  const priority = dominantPriority(option);
  boostPriority(state.preferences, priority);
  state.preferences.accepted.push({ optionId: option.id, at: new Date().toISOString() });
  state.acceptedOptionIds.add(option.id);
  return learn(state, `You prefer ${priorityLabels[priority]}, from accepting ${option.title}.`);
}
export function learnDismiss(state: PersonaState, option: MoveOption, reason: DismissReason) {
  state.preferences.dismissed.push({ optionId: option.id, reason, at: new Date().toISOString() });
  state.suppressedOptionIds.add(option.id);
  if (reason === "too-expensive") {
    boostPriority(state.preferences, "monthlyPayment");
    return learn(state, `You prefer lower monthly payments, from dismissing ${option.title} as too expensive.`);
  }
  if (reason === "not-relevant" && !state.preferences.suppressedMoveTypes.includes(option.moveType)) state.preferences.suppressedMoveTypes.push(option.moveType);
  return learn(state, reason === "not-now" ? `You want to revisit ${option.title} later; hidden for this session.` : reason === "not-relevant" ? `You do not want ${option.moveType} recommendations.` : `You already completed ${option.title}.`);
}
export function setStyle(state: PersonaState, style: { detailLevel?: Preferences["detailLevel"]; format?: Preferences["format"] }) {
  if (style.detailLevel) state.preferences.detailLevel = style.detailLevel;
  if (style.format) state.preferences.format = style.format;
  return learn(state, `You prefer ${state.preferences.detailLevel} explanations in ${state.preferences.format} format.`, "explicit");
}
export function seedDrivingLearning(state: PersonaState, driving: DrivingSummary) {
  if (state.drivingSeeded || !state.consent.driving) return;
  state.drivingSeeded = true;
  for (const tag of driving.lifestyleTags) {
    if (!state.preferences.lifestyleTags.includes(tag)) state.preferences.lifestyleTags.push(tag);
    if (!state.preferences.learned.some(item => item.source === "driving" && item.statement.includes(tag))) learn(state, `Your driving suggests ${tag}, based on your recent trip patterns.`, "driving", 0.8);
  }
}
