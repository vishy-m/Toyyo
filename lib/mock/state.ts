// In-browser mock runtime: mirrors what lib/server/store (task 02) keeps server-side,
// so accept/dismiss/consent/learned flows work end to end on mocks.

import type {
  ActionRequest,
  ActionResponse,
  HandoffPacket,
  Persona,
  PersonaId,
  Preferences,
  TfsData,
  TfsMetrics,
} from "@/lib/types";
import { mockAgentInitial } from "./agent";
import { mockDashboard } from "./dashboard";
import { type LegacyPersonaId, legacyId, mockPersonas } from "./personas";

interface Runtime {
  preferences: Preferences;
  consent: Persona["consent"];
  deletedLearned: Set<string>;
}

const runtime = new Map<PersonaId, Runtime>();
const packets: HandoffPacket[] = [];

function rt(id: PersonaId): Runtime {
  let r = runtime.get(id);
  if (!r) {
    const p = mockPersonas[id];
    r = { preferences: structuredClone(p.preferences), consent: { ...p.consent }, deletedLearned: new Set() };
    runtime.set(id, r);
  }
  return r;
}

export function mockRuntimeDashboard(id: PersonaId) {
  const r = rt(id);
  return mockDashboard(id, { preferences: r.preferences, consent: r.consent });
}

export function mockRuntimeAgentInitial(id: PersonaId) {
  return mockAgentInitial(mockRuntimeDashboard(id), rt(id).deletedLearned);
}

let seq = 0;
export function mockAction(req: ActionRequest): ActionResponse {
  const r = rt(req.personaId);
  const now = new Date().toISOString();
  switch (req.kind) {
    case "accept": {
      r.preferences.accepted.push({ optionId: req.optionId, at: now });
      const data = mockRuntimeDashboard(req.personaId);
      const opt = Object.values(data.engines)
        .flatMap((e) => e.options)
        .find((o) => o.id === req.optionId);
      const packet: HandoffPacket = {
        id: `pkt-${req.personaId}-${++seq}`,
        personaId: req.personaId,
        optionId: req.optionId,
        moveType: opt?.moveType ?? "lease-end",
        mode: req.mode,
        customerSummary: `${data.persona.name} chose “${opt?.title ?? req.optionId}”. ${opt?.summary ?? ""}`.trim(),
        numbers: opt?.assumptions.slice(0, 5) ?? [],
        consentedData: (Object.keys(r.consent) as (keyof Persona["consent"])[]).filter((k) => r.consent[k]),
        statedPreferences: [
          ...rt(req.personaId).preferences.learned.map((l) => l.statement),
          ...mockRuntimeAgentInitial(req.personaId).learned.map((l) => l.statement),
        ].slice(0, 4),
        createdAt: now,
      };
      packets.unshift(packet);
      return { ok: true, preferences: r.preferences, packet };
    }
    case "dismiss": {
      r.preferences.dismissed.push({ optionId: req.optionId, reason: req.reason, at: now });
      const learned = [];
      if (req.reason === "too-expensive") {
        r.preferences.priorityWeights.monthlyPayment = Math.min(1, r.preferences.priorityWeights.monthlyPayment + 0.1);
        learned.push({ id: `l-${now}`, statement: "Prefers a lower monthly payment", source: "behavior" as const, confidence: 0.7, createdAt: now });
      } else if (req.reason === "not-relevant") {
        r.preferences.suppressedMoveTypes.push(req.optionId.split(":")[0] as Preferences["suppressedMoveTypes"][number]);
        learned.push({ id: `l-${now}`, statement: `Not interested in ${req.optionId.split(":")[0]} moves`, source: "behavior" as const, confidence: 0.8, createdAt: now });
      }
      r.preferences.learned.push(...learned);
      return { ok: true, preferences: r.preferences, learned };
    }
    case "delete_learned":
      r.deletedLearned.add(req.learnedId);
      r.preferences.learned = r.preferences.learned.filter((l) => l.id !== req.learnedId);
      return { ok: true, preferences: r.preferences };
    case "set_consent":
      r.consent[req.source] = req.value;
      return { ok: true, preferences: r.preferences };
    case "set_style":
      if (req.detailLevel) r.preferences.detailLevel = req.detailLevel;
      if (req.format) r.preferences.format = req.format;
      return { ok: true, preferences: r.preferences };
  }
}

const tfsBase: Record<LegacyPersonaId, Omit<TfsMetrics, "accepted" | "openPackets" | "personaId">> = {
  maya: {
    recommendedMove: "Lease buyout",
    retentionLikelihood: 0.78,
    projectedValue: 4200,
    callsAvoided: 2,
    assumptions: [{ label: "Buyout retains customer", value: "avg 4.2 more years" }],
  },
  garcia: {
    recommendedMove: "Refinance + extended protection",
    retentionLikelihood: 0.84,
    projectedValue: 3100,
    callsAvoided: 3,
    assumptions: [{ label: "Refi in-house vs lost to credit union", value: "62% retention lift" }],
  },
  jordan: {
    recommendedMove: "Usage-based insurance + due-date shift",
    retentionLikelihood: 0.66,
    projectedValue: 1900,
    callsAvoided: 4,
    assumptions: [{ label: "Late-payment calls avoided", value: "2 per year" }],
  },
  raj: {
    recommendedMove: "Upgrade to 4Runner TRD",
    retentionLikelihood: 0.81,
    projectedValue: 6800,
    callsAvoided: 2,
    assumptions: [{ label: "Lease-to-lease conquest value", value: "$6,800 avg gross" }],
  },
};

export function mockTfs(): TfsData {
  const ids: PersonaId[] = ["maya", "garcia", "jordan", "raj"];
  const metrics = ids.map((id) => {
    const open = packets.filter((p) => p.personaId === id).length;
    const accepted = rt(id).preferences.accepted.length > 0;
    const b = tfsBase[legacyId(id)];
    return {
      personaId: id,
      ...b,
      accepted,
      retentionLikelihood: accepted ? Math.min(0.97, b.retentionLikelihood + 0.12) : b.retentionLikelihood,
      openPackets: open,
    };
  });
  return { metrics, packets: [...packets] };
}
