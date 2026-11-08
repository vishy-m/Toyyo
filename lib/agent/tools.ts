import type { ToolDefinition } from "./llm/types";
import { z } from "zod";
import { getTrip } from "../data";
import { runWhatIf } from "../engines";
import type { AgentStreamEvent, Draft, MoveType, PersonaId, UiAction, WhatIfOverrides } from "../types";
import { agentContext, getDashboard } from "../server/dashboard";
import { getState, invalidatePanel } from "../server/store";
import { boostPriority, learn, setStyle } from "../server/learning";
import { detailSchema, formatSchema, moveTypeSchema, overridesSchema, personaIdSchema, prioritySchema } from "../server/schemas";
import { checkGrounding } from "./grounding";

export type Emit = (event: AgentStreamEvent) => void;
export interface ToolContext { personaId: PersonaId; emit: Emit; evidence: unknown[] }
interface Definition { tool: ToolDefinition; execute(input: unknown, context: ToolContext): unknown }
const definitions = new Map<string, Definition>();
function define<T extends z.ZodType>(name: string, description: string, schema: T, execute: (input: z.infer<T>, context: ToolContext) => unknown) {
  const jsonSchema = z.toJSONSchema(schema);
  definitions.set(name, { tool: { name, description, strict: true, input_schema: { ...jsonSchema, type: "object", additionalProperties: false } }, execute: (input, context) => {
    const parsed = schema.parse(input);
    if (parsed && typeof parsed === "object" && "personaId" in parsed && parsed.personaId && parsed.personaId !== context.personaId) throw new Error("Tools may only access the current customer.");
    return execute(parsed, context);
  } });
}
const scoped = { personaId: personaIdSchema.optional() };
const empty = z.strictObject(scoped);
define("get_customer_snapshot", "Get the current customer's profile, vehicle, contract and current consent/preferences.", empty, (_, context) => getDashboard(context.personaId).persona);
define("get_driving_summary", "Get consented recent driving trends, score and factors; unavailable if driving consent is off. Only the dashboard's recorded window is supported.", z.strictObject({ ...scoped, window: z.number().int().positive().optional() }), (input, context) => {
  const dashboard = getDashboard(context.personaId);
  if (!dashboard.persona.consent.driving) throw new Error("Driving consent is off.");
  if (input.window && input.window !== dashboard.driving.windowDays) throw new Error(`Only the recorded ${dashboard.driving.windowDays}-day window is available.`);
  return dashboard.driving;
});
define("get_cashflow_summary", "Get cash-flow only with banking consent. Payment history requires separate consent.", empty, (_, context) => {
  const dashboard = getDashboard(context.personaId);
  if (!dashboard.persona.consent.banking) throw new Error("Banking consent is off.");
  return agentContext(dashboard).cashflow;
});
const computeTypes: Record<string, MoveType> = { compute_lease_end_options: "lease-end", compute_insurance_options: "insurance", compute_payment_options: "payment", compute_protection_options: "protection" };
for (const [name, moveType] of Object.entries(computeTypes)) define(name, `Run the deterministic ${moveType} engine, using current consent and optional what-if overrides. All figures are simulated.`, z.strictObject({ ...scoped, overrides: overridesSchema.optional() }), (input, context) => runWhatIf(context.personaId, moveType, input.overrides ?? {}, getState(context.personaId)));
define("get_trip_insights", "Get consented trip insights and trip summaries, including real trip IDs and scores for replay selection.", empty, (_, context) => {
  const dashboard = getDashboard(context.personaId);
  if (!dashboard.persona.consent.driving) throw new Error("Driving consent is off.");
  return { insights: dashboard.tripInsights, trips: dashboard.trips };
});
define("rank_moves", "Get the deterministic ranked moves and their engine options. Never invent a ranking.", empty, (_, context) => {
  const dashboard = getDashboard(context.personaId);
  return { ranked: dashboard.ranked, engines: dashboard.engines };
});
define("create_draft", "Save a comparison, specialist message, reminder or plan. Financial numbers must come from tools; this does not send or execute anything.", z.strictObject({ type: z.enum(["comparison", "message", "reminder", "plan"]), title: z.string().min(1).max(200), content: z.string().min(1).max(12000), relatedOptionId: z.string().optional() }), (input, context) => {
  if (!checkGrounding(`${input.title}\n${input.content}`, context.evidence).grounded) throw new Error("Draft contains unsupported numbers. Retry using exact engine values or omit numbers.");
  const state = getState(context.personaId);
  if (input.relatedOptionId && !Object.values(getDashboard(context.personaId).engines).some(engine => engine.options.some(option => option.id === input.relatedOptionId))) throw new Error("Unknown related option.");
  const draft: Draft = { id: crypto.randomUUID(), type: input.type, title: input.title, body: input.content, relatedOptionId: input.relatedOptionId, createdAt: new Date().toISOString() };
  state.drafts.push(draft);
  invalidatePanel(state);
  context.emit({ type: "draft", draft });
  return draft;
});
define("update_preference", "Record an explicit style, priority, or lifestyle preference requested by the customer. Priority increases by a fixed amount and is normalized.", z.strictObject({ key: z.enum(["detailLevel", "format", "priority", "lifestyleTag"]), value: z.string().min(1).max(100), source: z.literal("explicit").optional() }), (input, context) => {
  const state = getState(context.personaId);
  let item;
  switch (input.key) {
    case "detailLevel": item = setStyle(state, { detailLevel: detailSchema.parse(input.value) }); break;
    case "format": item = setStyle(state, { format: formatSchema.parse(input.value) }); break;
    case "priority": {
      const priority = prioritySchema.parse(input.value);
      boostPriority(state.preferences, priority);
      item = learn(state, `You asked to prioritize ${priority}.`, "explicit"); break;
    }
    case "lifestyleTag":
      if (!state.preferences.lifestyleTags.includes(input.value)) state.preferences.lifestyleTags.push(input.value);
      item = learn(state, `You described your lifestyle as ${input.value}.`, "explicit"); break;
  }
  context.emit({ type: "learned", item });
  return { preferences: state.preferences, item };
});
function ui(context: ToolContext, action: UiAction) { context.emit({ type: "ui_action", action }); return "ok"; }
define("open_trip_replay", "Open a consented trip belonging to the current customer. Optional focusEventT is seconds from trip start.", z.strictObject({ tripId: z.string().min(1), focusEventT: z.number().nonnegative().optional() }), (input, context) => {
  if (!getState(context.personaId).consent.driving) throw new Error("Driving consent is off.");
  const trip = getTrip(input.tripId);
  if (!trip || trip.personaId !== context.personaId) throw new Error("Trip not found for this customer.");
  if (input.focusEventT !== undefined && !trip.events.some(event => event.t === input.focusEventT)) throw new Error("Focus time must match a recorded trip event.");
  return ui(context, { kind: "open_trip_replay", ...input });
});
define("focus_vehicle_hotspot", "Focus the vehicle camera on the selected financial insight hotspot.", z.strictObject({ hotspot: z.enum(["odometer", "tires", "engine", "driver-seat"]) }), (input, context) => ui(context, { kind: "focus_vehicle_hotspot", ...input }));
define("set_whatif", "Move a dashboard what-if control. Also call the matching compute tool with the same overrides to calculate the result.", z.strictObject({ control: z.enum(["monthlyMiles", "monthsAhead", "extraPrincipal", "paymentDueDay", "scoreImprovement"]), value: z.number() }), (input, context) => {
  overridesSchema.parse({ [input.control]: input.value });
  return ui(context, { kind: "set_whatif", ...input });
});
define("open_move", "Open the requested move detail tile.", z.strictObject({ moveType: moveTypeSchema }), (input, context) => ui(context, { kind: "open_move", ...input }));
define("open_page", "Take the user to a page of their car dashboard: \"repairs\" (describe a problem, get repair guidance and nearby shops), \"driving\" (score, recent drives and a replay), \"finances\" (the contract and payment scenarios) or \"overview\" (alerts and monthly costs). For a car problem, pass the user's own words as issue.", z.strictObject({ page: z.enum(["overview", "repairs", "driving", "finances"]), issue: z.string().trim().min(1).max(240).optional() }), (input, context) => ui(context, { kind: "open_page", ...input }));
export const agentTools = [...definitions.values()].map(definition => definition.tool);
export async function executeTool(name: string, input: unknown, context: ToolContext): Promise<{ value: unknown; isError: boolean }> {
  context.emit({ type: "tool", name, status: "start" });
  try {
    const definition = definitions.get(name);
    if (!definition) throw new Error("Unknown tool.");
    const value = await definition.execute(input, context);
    // Generated drafts, user preferences, and UI changes are not numerical evidence.
    if (name.startsWith("get_") || name.startsWith("compute_") || name === "rank_moves") context.evidence.push(value);
    return { value, isError: false };
  } catch (error) {
    return { value: { error: error instanceof z.ZodError ? "Invalid tool input. Check the schema and retry." : error instanceof Error ? error.message : "Tool failed." }, isError: true };
  } finally { context.emit({ type: "tool", name, status: "done" }); }
}
export function overrideMove(control: keyof WhatIfOverrides, lease: boolean): MoveType {
  return control === "monthlyMiles" || control === "monthsAhead" ? lease ? "lease-end" : "protection" : control === "scoreImprovement" ? "insurance" : "payment";
}
