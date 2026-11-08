// Mock agent: initial panel state per persona + a scripted SSE-like stream.

import type {
  AgentChatRequest,
  AgentPanelState,
  AgentStreamEvent,
  DashboardData,
  Draft,
  LearnedItem,
  Recommendation,
} from "@/lib/types";
import { type LegacyPersonaId, legacyId } from "./personas";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const NOW = "2026-10-27T15:00:00.000Z";

function fmtDeadline(iso?: string) {
  if (!iso) return undefined;
  const d = new Date(iso + "T12:00:00Z");
  return `Decide by ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

const whyText: Record<string, string> = {
  "lease-end:buyout":
    "You're driving about 1,450 miles a month, so you'll finish the lease roughly 4,000 miles over. Buying out avoids that charge and the car is worth a bit more than the buyout price.",
  "insurance:ubi": "Your driving score is solid, so a usage-based policy would price you below your current premium.",
  "protection:extended": "ToyotaCare ends soon and you plan to keep this car, so post-warranty repairs would be on you.",
  "payment:refinance": "Your credit tier improved since you signed. The same loan at today's eligible rate lowers the payment, which matters with a new baby.",
  "insurance:ubi-coached":
    "Most of your score loss comes from late-night trips and hard braking. Usage-based pricing plus a few habit changes is the biggest monthly saving available to you.",
  "payment:due-date": "Your payment is due on the 3rd but you're paid biweekly on Fridays. Moving the date avoids the two late fees you paid this year.",
  "lease-end:upgrade":
    "You'll finish the lease about 26,000 miles under the allowance, so there's no overage to dodge. Your trail trips fit a 4Runner TRD better than another Tacoma.",
  "protection:tire-wheel": "About 18% of your miles are on unpaved or ranch roads, where tire and wheel damage is most common.",
};

const actionText: Record<string, string> = {
  "lease-end:buyout": "Request a payoff quote and buy out before the lease ends.",
  "insurance:ubi": "Get a usage-based quote using your driving score.",
  "protection:extended": "Add an extended service contract before ToyotaCare ends.",
  "payment:refinance": "Apply to refinance at your new credit tier's rate.",
  "insurance:ubi-coached": "Switch to usage-based insurance and follow two coaching tips.",
  "payment:due-date": "Move your due date to the day after payday.",
  "lease-end:upgrade": "Return the Tacoma and lease a 4Runner TRD Off-Road.",
  "protection:tire-wheel": "Add tire & wheel protection for trail miles.",
};

export function mockRecommendations(data: DashboardData): Recommendation[] {
  const all = Object.values(data.engines).flatMap((e) => e.options);
  return data.ranked.slice(0, 3).map((r) => {
    const o = all.find((x) => x.id === r.optionId)!;
    const s = o.savingsVsBaseline ?? 0;
    const impact =
      o.moveType === "lease-end" && o.upgradeModel
        ? `${usd(o.monthlyCost ?? 0)}/mo · no overage`
        : o.moveType === "insurance"
          ? `Saves ~${usd(s)}/yr`
          : s > 0
            ? `Saves ~${usd(s)}${o.moveType === "lease-end" ? " vs returning" : ""}`
            : o.monthlyCost
              ? `${usd(o.monthlyCost)}/mo`
              : "Protects your budget";
    const accepted = data.preferences.accepted.some((a) => a.optionId === o.id);
    return {
      id: `rec-${o.id}`,
      optionId: o.id,
      moveType: o.moveType,
      title: o.title,
      action: actionText[o.id] ?? o.summary,
      why: whyText[o.id] ?? o.summary,
      impactLabel: impact,
      urgencyLabel: fmtDeadline(o.deadline),
      status: accepted ? "accepted" : "proposed",
      grounded: true,
    };
  });
}

const draftsByPersona: Record<LegacyPersonaId, Draft[]> = {
  maya: [
    {
      id: "draft-maya-compare",
      type: "comparison",
      title: "Lease-end options, side by side",
      body: "| Option | Cost now | Net |\n|---|---|---|\n| Return | $1,350 | −$1,350 |\n| Buy out | $20,913 | +$470 equity |\n| Re-lease | $429/mo | Disposition waived |",
      relatedOptionId: "lease-end:buyout",
      createdAt: NOW,
    },
    {
      id: "draft-maya-msg",
      type: "message",
      title: "Note to a TFS specialist",
      body: "Hi, I'd like a payoff quote for my 2025 Camry Hybrid SE lease (4 months left). I'm planning to buy it out and would like financing options.",
      relatedOptionId: "lease-end:buyout",
      createdAt: NOW,
    },
  ],
  garcia: [
    {
      id: "draft-garcia-plan",
      type: "plan",
      title: "Refinance plan",
      body: "1. Soft-check your rate (no score impact)\n2. Compare 4.9% vs current 6.9%\n3. Keep the same 31-month payoff date",
      relatedOptionId: "payment:refinance",
      createdAt: NOW,
    },
  ],
  jordan: [
    {
      id: "draft-jordan-coach",
      type: "plan",
      title: "Two habits worth $47/mo",
      body: "- **Leave 2 car lengths** on Westheimer at night: fewer hard brakes\n- **Head home before 11 pm** on weeknights when you can",
      relatedOptionId: "insurance:ubi-coached",
      createdAt: NOW,
    },
  ],
  raj: [
    {
      id: "draft-raj-compare",
      type: "comparison",
      title: "Tacoma vs 4Runner",
      body: "| | Re-lease Tacoma | 4Runner TRD |\n|---|---|---|\n| Monthly | $519 | $559 |\n| Trail fit | Good | Great |\n| Cargo | Bed | Enclosed |",
      relatedOptionId: "lease-end:upgrade",
      createdAt: NOW,
    },
  ],
};

const learnedByPersona: Record<LegacyPersonaId, LearnedItem[]> = {
  maya: [
    { id: "l-maya-1", statement: "Drives to Dallas most months", source: "driving", confidence: 0.86, createdAt: NOW },
    { id: "l-maya-2", statement: "Values flexibility over the lowest payment", source: "explicit", confidence: 0.7, createdAt: NOW },
  ],
  garcia: [
    { id: "l-garcia-1", statement: "Family trips: daycare and pediatrician runs", source: "driving", confidence: 0.92, createdAt: NOW },
    { id: "l-garcia-2", statement: "Prefers a lower monthly payment", source: "explicit", confidence: 0.8, createdAt: NOW },
  ],
  jordan: [
    { id: "l-jordan-1", statement: "Drives late at night often", source: "driving", confidence: 0.9, createdAt: NOW },
    { id: "l-jordan-2", statement: "Cash gets tight before payday", source: "payments", confidence: 0.74, createdAt: NOW },
  ],
  raj: [
    { id: "l-raj-1", statement: "Road-tripper: long drives most weekends", source: "driving", confidence: 0.9, createdAt: NOW },
    { id: "l-raj-2", statement: "Goes off-road to trailheads", source: "driving", confidence: 0.84, createdAt: NOW },
  ],
};

export function mockAgentInitial(data: DashboardData, deletedLearned: Set<string> = new Set()): AgentPanelState {
  const id = data.persona.id;
  return {
    personaId: id,
    recommendations: mockRecommendations(data),
    drafts: draftsByPersona[legacyId(id)],
    learned: [...learnedByPersona[legacyId(id)], ...data.preferences.learned].filter((l) => !deletedLearned.has(l.id)),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function* chunk(text: string) {
  const words = text.split(/(\s+)/);
  for (let i = 0; i < words.length; i += 4) yield words.slice(i, i + 4).join("");
}

/** Scripted stream: text deltas, tool activity, ui_actions, drafts. Keyword-driven. */
export async function* mockStreamAgent(req: AgentChatRequest, data: DashboardData): AsyncGenerator<AgentStreamEvent> {
  const m = req.message.toLowerCase();
  const p = data.persona;
  const events: (AgentStreamEvent | { type: "pause"; ms: number } | { type: "say"; text: string })[] = [];

  if (/drive less|fewer miles|less next|what if/.test(m) && p.contract.kind === "lease") {
    const lease = data.engines["lease-end"];
    const buy = lease.options.find((o) => o.id === "lease-end:buyout");
    events.push(
      { type: "tool", name: "compute_lease_end_options", status: "start" },
      { type: "pause", ms: 500 },
      { type: "ui_action", action: { kind: "open_move", moveType: "lease-end" } },
      { type: "pause", ms: 350 },
      { type: "ui_action", action: { kind: "set_whatif", control: "monthlyMiles", value: 900 } },
      { type: "tool", name: "compute_lease_end_options", status: "done" },
      {
        type: "say",
        text: `I set your monthly miles to **900** on the lease slider. At that pace the Excess Mileage charge shrinks a lot, so returning gets cheaper. Buying out still comes out ahead${buy ? ", but by less than today's figure" : ""}. You can drag the slider to try other paces.`,
      },
    );
  } else if (/score|hurt|worst|replay|trip/.test(m)) {
    const worst = [...data.trips].sort((a, b) => a.score - b.score)[0];
    const showcase = data.trips.find((t) => t.showcase) ?? worst;
    events.push(
      { type: "tool", name: "get_driving_summary", status: "start" },
      { type: "pause", ms: 450 },
      { type: "tool", name: "get_driving_summary", status: "done" },
      {
        type: "say",
        text: `Your trip to **${showcase.destinationLabel}** scored ${showcase.score}. I'm opening the replay at the first hard brake so you can see it.`,
      },
      { type: "ui_action", action: { kind: "open_trip_replay", tripId: showcase.id, focusEventT: 600 } },
    );
  } else if (/compare|option|lease-end|lease end/.test(m)) {
    events.push(
      { type: "tool", name: "compute_lease_end_options", status: "start" },
      { type: "pause", ms: 500 },
      { type: "tool", name: "compute_lease_end_options", status: "done" },
      { type: "ui_action", action: { kind: "open_move", moveType: "lease-end" } },
      { type: "say", text: "Here's the side-by-side. I opened the lease-end detail so you can see every option with its trade-offs." },
      {
        type: "draft",
        draft: {
          id: `draft-${Date.now()}`,
          type: "comparison",
          title: "Lease-end comparison (updated)",
          body: data.engines["lease-end"].options
            .map((o) => `- **${o.title}**: ${o.summary}`)
            .join("\n"),
          relatedOptionId: data.ranked[0]?.optionId,
          createdAt: new Date().toISOString(),
        },
      },
    );
  } else if (/short|brief|less detail/.test(m)) {
    events.push(
      { type: "say", text: "Got it. I'll keep explanations short from now on." },
      {
        type: "learned",
        item: { id: `l-${Date.now()}`, statement: "Wants short explanations", source: "explicit", confidence: 0.9, createdAt: new Date().toISOString() },
      },
    );
  } else {
    const top = data.ranked[0];
    const opt = top ? Object.values(data.engines).flatMap((e) => e.options).find((o) => o.id === top.optionId) : undefined;
    events.push(
      { type: "tool", name: "rank_moves", status: "start" },
      { type: "pause", ms: 400 },
      { type: "tool", name: "rank_moves", status: "done" },
      {
        type: "say",
        text: opt
          ? `Your strongest move right now: **${opt.title}**. ${opt.summary}\n\nAsk me "what if" to try a different scenario, or tap **Why?** on the card to see the math.`
          : "I looked at your lease, insurance, payments and protection. Nothing urgent stands out right now.",
      },
    );
  }

  for (const e of events) {
    if (e.type === "pause") {
      await sleep(e.ms);
    } else if (e.type === "say") {
      for (const c of chunk(e.text)) {
        yield { type: "text", delta: c };
        await sleep(28);
      }
    } else {
      yield e;
      await sleep(120);
    }
  }
  yield { type: "done" };
}
