"use client";

// App data (server-derived) for the dashboard + agent panel. UI-only bridge state lives in ui-store.ts.

import { create } from "zustand";
import type {
  AgentPanelState,
  AgentStreamEvent,
  ConsentSource,
  DashboardData,
  DismissReason,
  Draft,
  HandoffPacket,
  LearnedItem,
  MoveOption,
  PersonaId,
  Preferences,
  UiAction,
} from "@/lib/types";
import { getAgentInitial, getDashboard, postAction, streamAgent } from "./api";
import { useUiStore } from "./ui-store";

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  tools: { name: string; status: "start" | "done" }[];
  drafts: Draft[];
  learned: LearnedItem[];
  actions: UiAction[];
  error?: string;
  streaming?: boolean;
  context?: string;
}

export interface NextStep {
  id: string;
  personaId: PersonaId;
  label: string;
  mode: HandoffPacket["mode"];
  packetId?: string;
}

interface DataState {
  dashboards: Partial<Record<PersonaId, DashboardData>>;
  /** Most recently loaded dashboard: shown while the next persona loads, so HeroCar stays mounted. */
  lastDashboard?: DashboardData;
  agent: Partial<Record<PersonaId, AgentPanelState>>;
  dashboardError: string | null;
  chat: Partial<Record<PersonaId, ChatMessage[]>>;
  streaming: boolean;
  nextSteps: NextStep[];
  /** Agent chat input prefill (e.g. from "Edit" on a card). */
  draftInput: string;

  loadDashboard: (id: PersonaId, force?: boolean) => Promise<void>;
  loadAgent: (id: PersonaId, force?: boolean) => Promise<void>;
  accept: (id: PersonaId, option: MoveOption, mode: HandoffPacket["mode"]) => Promise<HandoffPacket | undefined>;
  dismiss: (id: PersonaId, optionId: string, reason: DismissReason) => Promise<void>;
  deleteLearned: (id: PersonaId, learnedId: string) => Promise<void>;
  setConsent: (id: PersonaId, source: ConsentSource, value: boolean) => Promise<void>;
  setStyle: (id: PersonaId, patch: { detailLevel?: Preferences["detailLevel"]; format?: Preferences["format"] }) => Promise<void>;
  setDraftInput: (s: string) => void;
  send: (id: PersonaId, message: string, context?: { widget?: string; optionId?: string; tripId?: string } | null) => Promise<void>;
  stop: () => void;
}

let abort: AbortController | null = null;
const uid = () => Math.random().toString(36).slice(2, 10);

export const useDataStore = create<DataState>((set, get) => ({
  dashboards: {},
  agent: {},
  dashboardError: null,
  chat: {},
  streaming: false,
  nextSteps: [],
  draftInput: "",

  loadDashboard: async (id, force) => {
    if (!force && get().dashboards[id]) return;
    try {
      const d = await getDashboard(id);
      set((s) => ({ dashboards: { ...s.dashboards, [id]: d }, lastDashboard: d, dashboardError: null }));
    } catch (e) {
      set({ dashboardError: e instanceof Error ? e.message : "Could not load your dashboard" });
    }
  },

  loadAgent: async (id, force) => {
    if (!force && get().agent[id]) return;
    try {
      const a = await getAgentInitial(id);
      set((s) => ({ agent: { ...s.agent, [id]: a } }));
    } catch {
      /* panel shows its own empty state */
    }
  },

  accept: async (id, option, mode) => {
    const res = await postAction({ kind: "accept", personaId: id, optionId: option.id, mode });
    set((s) => {
      const a = s.agent[id];
      return {
        nextSteps: [
          ...s.nextSteps,
          { id: uid(), personaId: id, label: option.title, mode, packetId: res.packet?.id },
        ],
        agent: a
          ? {
              ...s.agent,
              [id]: {
                ...a,
                recommendations: a.recommendations.map((r) => (r.optionId === option.id ? { ...r, status: "accepted" } : r)),
              },
            }
          : s.agent,
      };
    });
    void get().loadDashboard(id, true);
    return res.packet;
  },

  dismiss: async (id, optionId, reason) => {
    // optimistic: mark dismissed right away
    set((s) => {
      const a = s.agent[id];
      if (!a) return {};
      return {
        agent: {
          ...s.agent,
          [id]: { ...a, recommendations: a.recommendations.map((r) => (r.optionId === optionId ? { ...r, status: "dismissed" } : r)) },
        },
      };
    });
    const res = await postAction({ kind: "dismiss", personaId: id, optionId, reason });
    if (res.learned?.length) {
      set((s) => {
        const a = s.agent[id];
        if (!a) return {};
        const have = new Set(a.learned.map((l) => l.id));
        return { agent: { ...s.agent, [id]: { ...a, learned: [...a.learned, ...res.learned!.filter((l) => !have.has(l.id))] } } };
      });
    }
    // re-rank with the new preferences, then let the agent redraft
    await get().loadDashboard(id, true);
    setTimeout(() => void get().loadAgent(id, true), 900);
  },

  deleteLearned: async (id, learnedId) => {
    set((s) => {
      const a = s.agent[id];
      if (!a) return {};
      return { agent: { ...s.agent, [id]: { ...a, learned: a.learned.filter((l) => l.id !== learnedId) } } };
    });
    await postAction({ kind: "delete_learned", personaId: id, learnedId });
  },

  setConsent: async (id, source, value) => {
    set((s) => {
      const d = s.dashboards[id];
      if (!d) return {};
      return { dashboards: { ...s.dashboards, [id]: { ...d, persona: { ...d.persona, consent: { ...d.persona.consent, [source]: value } } } } };
    });
    await postAction({ kind: "set_consent", personaId: id, source, value });
    await Promise.all([get().loadDashboard(id, true), get().loadAgent(id, true)]);
  },

  setStyle: async (id, patch) => {
    set((s) => {
      const d = s.dashboards[id];
      if (!d) return {};
      return { dashboards: { ...s.dashboards, [id]: { ...d, preferences: { ...d.preferences, ...patch } } } };
    });
    await postAction({ kind: "set_style", personaId: id, ...patch });
  },

  setDraftInput: (draftInput) => set({ draftInput }),

  send: async (id, message, context) => {
    if (!message.trim() || get().streaming) return;
    abort?.abort();
    abort = new AbortController();
    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      text: message,
      tools: [],
      drafts: [],
      learned: [],
      actions: [],
      context: context?.widget,
    };
    const agentId = uid();
    const agentMsg: ChatMessage = { id: agentId, role: "agent", text: "", tools: [], drafts: [], learned: [], actions: [], streaming: true };
    set((s) => ({ streaming: true, chat: { ...s.chat, [id]: [...(s.chat[id] ?? []), userMsg, agentMsg] } }));

    const patch = (fn: (m: ChatMessage) => ChatMessage) =>
      set((s) => ({ chat: { ...s.chat, [id]: (s.chat[id] ?? []).map((m) => (m.id === agentId ? fn(m) : m)) } }));

    const handle = (e: AgentStreamEvent) => {
      switch (e.type) {
        case "text":
          patch((m) => ({ ...m, text: m.text + e.delta }));
          break;
        case "tool":
          patch((m) => {
            const others = m.tools.filter((t) => !(t.name === e.name && t.status === "start"));
            return { ...m, tools: [...others, { name: e.name, status: e.status }] };
          });
          break;
        case "draft":
          patch((m) => ({ ...m, drafts: [...m.drafts, e.draft] }));
          set((s) => {
            const a = s.agent[id];
            return a ? { agent: { ...s.agent, [id]: { ...a, drafts: [e.draft, ...a.drafts.filter((d) => d.id !== e.draft.id)] } } } : {};
          });
          break;
        case "learned":
          patch((m) => ({ ...m, learned: [...m.learned, e.item] }));
          set((s) => {
            const a = s.agent[id];
            return a ? { agent: { ...s.agent, [id]: { ...a, learned: [...a.learned.filter((l) => l.id !== e.item.id), e.item] } } } : {};
          });
          break;
        case "recommendations":
          set((s) => {
            const a = s.agent[id];
            if (!a) return {};
            // Redraft in place: upsert by id (new/updated first), keep the rest.
            const incoming = new Set(e.recommendations.map((r) => r.id));
            const merged = [...e.recommendations, ...a.recommendations.filter((r) => !incoming.has(r.id))];
            return { agent: { ...s.agent, [id]: { ...a, recommendations: merged } } };
          });
          break;
        case "ui_action":
          patch((m) => ({ ...m, actions: [...m.actions, e.action] }));
          useUiStore.getState().dispatchUiAction(e.action);
          break;
        case "error":
          patch((m) => ({ ...m, error: e.message }));
          break;
        case "done":
          break;
      }
    };

    try {
      for await (const e of streamAgent({ personaId: id, message, context: context ?? undefined }, abort.signal)) {
        handle(e);
        if (e.type === "done") break;
      }
    } catch (err) {
      if (!abort.signal.aborted) patch((m) => ({ ...m, error: err instanceof Error ? err.message : "The copilot stopped responding." }));
    } finally {
      patch((m) => ({ ...m, streaming: false }));
      set({ streaming: false });
      useUiStore.setState({ agentContext: null });
    }
  },

  stop: () => {
    abort?.abort();
    set({ streaming: false });
  },
}));

/** All options across engines for quick lookup. */
export function findOption(d: DashboardData | undefined, optionId: string): MoveOption | undefined {
  if (!d) return undefined;
  for (const e of Object.values(d.engines)) {
    const o = e.options.find((x) => x.id === optionId);
    if (o) return o;
  }
  return undefined;
}
