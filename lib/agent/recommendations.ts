import { z } from "zod";
import type { AgentPanelState, DashboardData, MoveOption, PersonaId, Recommendation } from "../types";
import { getDashboard } from "../server/dashboard";
import { getState, invalidatePanel, panelFromState, runtimeStore } from "../server/store";
import { getProvider, providerConfig } from "./llm";
import { systemPrompt } from "./prompt";
import { startDiagnostic } from "./diagnostics";
import { checkGrounding } from "./grounding";

export function topOptions(dashboard: DashboardData): MoveOption[] {
  return dashboard.ranked.slice(0, 3).flatMap(ranked => {
    const option = dashboard.engines[ranked.moveType].options.find(item => item.id === ranked.optionId && item.eligible);
    return option ? [option] : [];
  });
}
export function templateRecommendation(option: MoveOption): Recommendation {
  const deadline = option.deadline ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${option.deadline}T00:00:00Z`)) : undefined;
  const actionTitle = option.id.startsWith("insurance:ubi-") ? `Compare ${option.title}` : option.title;
  const action = option.id === "lease-end:buyout"
    ? `Start a buyout quote with a TFS specialist${deadline ? ` before ${deadline}` : ""}.`
    : option.id === "protection:service"
      ? "Ask a TFS specialist about extended service coverage."
      : `${actionTitle.replace(/[.!?]+$/, "")}${option.highStakes ? " with a TFS specialist" : ""}.`;
  return {
    id: `recommendation:${option.id}`, optionId: option.id, moveType: option.moveType,
    title: option.title, action,
    why: option.summary, impactLabel: optionImpactLabel(option),
    urgencyLabel: deadline ? `Decide by ${deadline}` : undefined,
    status: "proposed", grounded: false,
  };
}
// The model may explain an option, but the impact chip always uses that option's fields.
export function optionImpactLabel(option: MoveOption): string {
  const dollars = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;
  if (option.savingsVsBaseline !== undefined && option.savingsVsBaseline > 0) {
    if (option.id === "insurance:coaching" || option.id === "insurance:ubi-improved") return `Potential savings after coaching ${dollars(option.savingsVsBaseline)}/year`;
    return option.id === "lease-end:buyout"
      ? `${dollars(option.savingsVsBaseline)} net advantage vs return`
      : `Estimated savings ${dollars(option.savingsVsBaseline)}${option.moveType === "insurance" ? "/year" : ""}`;
  }
  if (option.monthlyCost !== undefined) return `Estimated ${dollars(option.monthlyCost)}/month`;
  if (option.totalCost !== undefined) return `Estimated cost ${dollars(option.totalCost)}`;
  return "Compare costs and trade-offs";
}
const copySchema = z.strictObject({ recommendations: z.array(z.strictObject({
  optionId: z.string(), title: z.string(), action: z.string(), why: z.string(), impactLabel: z.string(), urgencyLabel: z.string().nullable(),
})) });

async function draftRecommendations(dashboard: DashboardData): Promise<Recommendation[]> {
  const options = topOptions(dashboard);
  const templates = options.map(templateRecommendation);
  const diagnostic = startDiagnostic("initial", dashboard.persona.id);
  let correction = "";
  let best = templates;
  try {
    const provider = getProvider();
    if (!provider || !options.length) { diagnostic.record.fallback = true; return templates; }
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await provider.generateJson(z.toJSONSchema(copySchema), {
        system: [...systemPrompt(dashboard), ...(correction ? [{ type: "text" as const, text: correction }] : [])],
        prompt: `Draft recommendation copy for exactly these options in this order. Keep why to two sentences and every number verbatim from each option. Include specialist assistance for highStakes options. ${JSON.stringify(options)}`,
      });
      const parsed = copySchema.parse(JSON.parse(text));
      if (parsed.recommendations.length !== options.length || parsed.recommendations.some((copy, index) => copy.optionId !== options[index].id)) throw new Error("Unexpected recommendation options");
      let failed = false;
      best = options.map((option, index) => {
        const copy = parsed.recommendations[index];
        const impactLabel = optionImpactLabel(option);
        const checked = checkGrounding([copy.title, copy.action, copy.why, impactLabel, copy.urgencyLabel].filter(Boolean).join(" "), option);
        if (!checked.grounded) { failed = true; return templates[index]; }
        return { ...templates[index], ...copy, impactLabel, urgencyLabel: copy.urgencyLabel ?? undefined, action: option.highStakes && !/specialist/i.test(copy.action) ? `${/[.!?]$/.test(copy.action) ? copy.action : `${copy.action}.`} A TFS specialist can help.` : copy.action, grounded: true };
      });
      if (!failed) return best;
      if (attempt === 0) diagnostic.record.groundingRetries += 1;
      else diagnostic.record.fallback = true;
      correction = "Your previous draft contained ungrounded numbers. Regenerate using only exact numeric values in each option. Do not calculate or invent any other amount, percentage, or mileage. If unsure, omit numbers.";
    }
  } catch (error) {
    diagnostic.record.fallback = true;
    console.warn("[agent/initial] Using engine templates:", error instanceof Error ? error.name : "Unknown error");
  } finally { diagnostic.finish(); }
  return best;
}
export async function getInitialPanel(id: PersonaId): Promise<AgentPanelState> {
  const state = getState(id);
  const dashboard = getDashboard(id);
  const options = topOptions(dashboard);
  const source = JSON.stringify({ llm: providerConfig(), options, templates: options.map(templateRecommendation) });
  // The runtime store survives HMR, so engine/data changes must invalidate its copy.
  if (state.panelSource !== source) {
    invalidatePanel(state);
    state.panelSource = source;
  }
  if (state.panel) return panelFromState(id);
  if (state.initialPromise) return state.initialPromise;
  const revision = state.revision;
  const pending = (async () => {
    const recommendations = await draftRecommendations(dashboard);
    // A consent/action change during generation must not resurrect stale copy.
    if (state.revision !== revision || getState(id) !== state) return getInitialPanel(id);
    state.recommendations = recommendations;
    state.panel = panelFromState(id);
    return state.panel;
  })();
  state.initialPromise = pending;
  try { return await pending; } finally { if (state.initialPromise === pending) state.initialPromise = undefined; }
}
export async function warmInitialPanels() {
  const source = JSON.stringify(providerConfig());
  if (runtimeStore.warmingSource === source) return;
  runtimeStore.warmingSource = source;
  await Promise.allSettled((["maya", "garcia", "jordan", "raj"] as const).map(getInitialPanel));
}
