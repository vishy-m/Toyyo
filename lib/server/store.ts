import { getPersona } from "../data";
import type { AgentPanelState, Contract, Draft, HandoffPacket, Persona, PersonaId, Preferences, Recommendation, Vehicle } from "../types";

export interface PersonaState {
  currentVehicle?: Vehicle;
  currentContract?: Contract;
  currentPaymentDueDay?: number;
  preferences: Preferences;
  consent: Persona["consent"];
  drafts: Draft[];
  recommendations: Recommendation[];
  packets: HandoffPacket[];
  acceptedOptionIds: Set<string>;
  suppressedOptionIds: Set<string>;
  panel?: AgentPanelState;
  panelSource?: string;
  initialPromise?: Promise<AgentPanelState>;
  revision: number;
  drivingSeeded: boolean;
}
interface RuntimeStore { personas: Map<PersonaId, PersonaState>; warming: boolean; warmingSource?: string }
const root = globalThis as typeof globalThis & { __nextMoveRuntime?: RuntimeStore };
export const runtimeStore: RuntimeStore = root.__nextMoveRuntime ??= { personas: new Map(), warming: false };

export function getState(id: PersonaId): PersonaState {
  let state = runtimeStore.personas.get(id);
  if (!state) {
    const persona = getPersona(id);
    state = {
      preferences: structuredClone(persona.preferences), consent: { ...persona.consent },
      drafts: [], recommendations: [], packets: [], acceptedOptionIds: new Set(),
      suppressedOptionIds: new Set(), revision: 0, drivingSeeded: false,
    };
    runtimeStore.personas.set(id, state);
  }
  return state;
}
export function invalidatePanel(state: PersonaState) {
  state.revision += 1;
  state.panel = undefined;
  state.initialPromise = undefined;
}
export function resetPersona(id: PersonaId) {
  const previous = runtimeStore.personas.get(id);
  if (previous) invalidatePanel(previous);
  runtimeStore.personas.delete(id);
  return getState(id);
}
export function panelFromState(id: PersonaId): AgentPanelState {
  const state = getState(id);
  return { personaId: id, recommendations: state.recommendations, drafts: state.drafts, learned: state.preferences.learned };
}
