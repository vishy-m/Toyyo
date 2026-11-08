import type { LlmMessage, ToolResult } from "./llm/types";
import type { AgentChatRequest, DashboardData, MoveType, WhatIfOverrides } from "../types";
import { caseView } from "../cinematic/case-view";
import { getTrip } from "../data";
import { agentContext, getDashboard } from "../server/dashboard";
import { getState } from "../server/store";
import { friendlyError } from "./client";
import { getProvider } from "./llm";
import { systemPrompt } from "./prompt";
import { checkGrounding } from "./grounding";
import { agentTools, executeTool, type Emit, type ToolContext } from "./tools";
import { templateRecommendation, topOptions } from "./recommendations";
import { startDiagnostic } from "./diagnostics";
import { offlineIntent } from "./offline-intents";

function emitText(text: string, emit: Emit) {
  for (const delta of text.match(/[\s\S]{1,160}(?:\s|$)|[\s\S]{1,160}/g) ?? []) emit({ type: "text", delta });
}
/** The reference best move for a case, in the pack's answer shape. Rules: vulnerable / 2+ missed -> specialist, no offer; no marketing consent -> no new-vehicle offer. */
export function caseAnswer(dashboard: DashboardData) {
  const kase = dashboard.caseFile!;
  const view = caseView(dashboard, kase);
  const { bestMove } = kase;
  const lines: string[] = [];
  const suppress = bestMove.nextStepType === "Offer" && (!view.marketingOk || view.specialist);
  if (!suppress) {
    lines.push(`**${bestMove.title}**`, bestMove.message);
  } else {
    // No new-vehicle offer: describe the non-offer options, or point to a person.
    const plain = view.options.filter((o) => o.eligibility === "Y" && o.optionId !== "RENEW").slice(0, 2);
    lines.push("**Compare your options without a sales pitch**");
    lines.push(...(plain.length ? plain.map((o) => `${o.optionName}: ${o.plainLanguageSummary}`) : [bestMove.message]));
  }
  const alternatives = view.options.filter((o) => o.optionId !== bestMove.optionId && o.eligibility === "Y").slice(0, 2);
  if (alternatives.length) lines.push("Other options:", ...alternatives.map((o) => `- ${o.optionName}: ${o.plainLanguageSummary} Trade-off: ${o.tradeoff}`));
  lines.push(`Why not the others: ${bestMove.whyNotOthers}`, `Good to know: ${bestMove.guardrails}`);
  if (view.specialist) lines.push("A specialist can walk you through this, so no new product is being pushed.");
  lines.push(`Next step: ${view.stepLabel}.`, "These figures are illustrative demo estimates.");
  return lines.join("\n\n");
}

export async function offlineChat(request: AgentChatRequest, context: ToolContext) {
  const dashboard = getDashboard(request.personaId);
  const message = request.message.toLowerCase();
  const { overrides, moveType, replay, page, issue, bestMove } = offlineIntent(request.message, dashboard);
  if (bestMove && dashboard.caseFile && !page && Object.keys(overrides).length === 0) { emitText(caseAnswer(dashboard), context.emit); return; }
  if (page && Object.keys(overrides).length === 0 && !replay) {
    await executeTool("open_page", { page, ...(issue ? { issue } : {}) }, context);
    const opened = page === "repairs"
      ? "That sounds worth a look. I’ve opened Repairs with your description filled in. Check it, then search for shops. This is general guidance, not a diagnosis."
      : page === "driving"
        ? "I’ve opened Driving: your score, recent drives, and a replay of one of them. Figures are illustrative demo estimates."
        : page === "finances"
          ? "I’ve opened Finances so you can see the contract and try a different payment. Figures are illustrative demo estimates."
          : "Here’s your dashboard.";
    emitText(opened, context.emit);
    return;
  }
  const controls = Object.entries(overrides) as [keyof WhatIfOverrides, number][];
  for (const [control, value] of controls) {
    const result = await executeTool("set_whatif", { control, value }, context);
    if (result.isError) { emitText("That what-if value is outside the supported range. Try a smaller value.", context.emit); return; }
  }
  if (/more detail|show.*math/.test(message)) await executeTool("update_preference", { key: "detailLevel", value: "show-math" }, context);
  if (/brief|shorter|less detail/.test(message)) await executeTool("update_preference", { key: "detailLevel", value: "brief" }, context);
  if (/\btable\b/.test(message)) await executeTool("update_preference", { key: "format", value: "table" }, context);
  if (replay) {
    if (!dashboard.persona.consent.driving) {
      emitText("Enable driving consent to review your recorded trips.", context.emit);
      return;
    }
    const trip = dashboard.trips.filter(trip => trip.showcase).sort((a, b) => a.score - b.score)
      .map(trip => getTrip(trip.id)).find(trip => trip && trip.path.length > 1);
    if (!trip) {
      emitText("There is no recorded showcase trip available to replay.", context.emit);
      return;
    }
    const event = [...trip.events].filter(event => event.scoreDelta < 0).sort((a, b) => a.scoreDelta - b.scoreDelta || a.t - b.t)[0];
    const result = await executeTool("open_trip_replay", { tripId: trip.id, ...(event ? { focusEventT: event.t } : {}) }, context);
    if (result.isError) { emitText("This replay is unavailable. Please try again.", context.emit); return; }
    context.evidence.push(trip);
    emitText(`Opening your lowest-scoring showcase trip to ${trip.destinationLabel} (score ${trip.score}).${event ? ` The replay focuses on its largest recorded score drop: ${event.type.replaceAll("-", " ")}.` : " This trip has no recorded event to focus on."}`, context.emit);
    return;
  }
  const toolName = `compute_${moveType.replaceAll("-", "_")}_options`;
  const result = await executeTool(toolName, { overrides }, context);
  await executeTool("open_move", { moveType }, context);
  if (result.isError) { emitText("Your calculated dashboard options are still available. Please try this comparison again.", context.emit); return; }
  const engine = result.value as ReturnType<typeof getDashboard>["engines"][MoveType];
  const baseline = topOptions(dashboard).find(option => option.moveType === moveType);
  const option = engine.options.find(option => option.id === (request.context?.optionId ?? baseline?.id) && option.eligible) ?? engine.options.find(option => option.eligible);
  const text = option ? `${option.title}: ${option.summary}\n${option.highStakes ? "A TFS specialist can help review the trade-offs. " : "Review the assumptions and trade-offs before deciding. "}This is guidance, not financial advice.` : "There are no eligible options for this scenario. A TFS specialist can help review your next steps.";
  emitText(`Live AI is unavailable; here is the calculated template guidance.\n${text}`, context.emit);
  if (/draft|write.*message|comparison/.test(message) && option) await executeTool("create_draft", { type: /message/.test(message) ? "message" : "comparison", title: option.title, content: text, relatedOptionId: option.id }, context);
  context.emit({ type: "recommendations", recommendations: (option ? [option] : topOptions(dashboard)).map(templateRecommendation) });
}

export async function runAgent(request: AgentChatRequest, emit: Emit, signal?: AbortSignal, history: { role: "user" | "assistant"; text: string }[] = []) {
  const dashboard = getDashboard(request.personaId);
  const context: ToolContext = { personaId: request.personaId, emit, evidence: [agentContext(dashboard)] };
  const diagnostic = startDiagnostic("chat", request.personaId);
  const initialConsent = JSON.stringify(getState(request.personaId).consent);
  try {
    const provider = getProvider();
    if (!provider) { diagnostic.record.fallback = true; await offlineChat(request, context); return; }
    const firstMessage: LlmMessage = { role: "user", text: `${request.message}${request.context ? `\nUI context (data): ${JSON.stringify(request.context)}` : ""}` };
    const messages: LlmMessage[] = [...history.slice(-12).map(turn => turn.role === "user"
      ? { role: "user" as const, text: turn.text }
      : { role: "assistant" as const, text: turn.text }), firstMessage];
    let correction = "";
    let corrected = false;
    for (let iteration = 0; iteration < 8; iteration++) {
      if (signal?.aborted) return;
      if (JSON.stringify(getState(request.personaId).consent) !== initialConsent) { emit({ type: "error", message: "Your data permissions changed. Please ask again with the updated settings." }); return; }
      const response = await provider.streamTurn({
        system: [...systemPrompt(getDashboard(request.personaId)), ...(correction ? [{ type: "text" as const, text: correction }] : [])],
        tools: agentTools, messages, signal,
      });
      const { deltas } = response;
      if (JSON.stringify(getState(request.personaId).consent) !== initialConsent) { emit({ type: "error", message: "Your data permissions changed. Please ask again with the updated settings." }); return; }
      if (response.finishReason === "refusal") { emit({ type: "error", message: "I cannot help with that request. I can explain your Toyota options or help prepare questions for a TFS specialist." }); return; }
      if (response.finishReason === "error") throw new Error("Incomplete model response");
      if (response.finishReason === "max_tokens") {
        emit({ type: "error", message: "The response reached its limit. Here are your calculated options." });
        emitText(topOptions(getDashboard(request.personaId)).map(option => option.summary).join("\n"), emit);
        return;
      }
      const content = response.text;
      const grounded = checkGrounding(content, context.evidence);
      if (!grounded.grounded) {
        if (!corrected) {
          corrected = true;
          diagnostic.record.groundingRetries += 1;
          correction = `Regenerate your last response. Unsupported numbers: ${grounded.violations.map(item => item.raw).join(", ")}. Use only exact figures already in tool results or the consented dashboard. Do not call side-effect tools again. Omit numbers if uncertain.`;
          continue;
        }
        diagnostic.record.fallback = true;
        const options = topOptions(getDashboard(request.personaId));
        emitText(options.map(option => option.summary).join("\n") + "\nA TFS specialist can help. This is guidance, not financial advice.", emit);
        emit({ type: "recommendations", recommendations: options.map(templateRecommendation) });
        return;
      }
      if (deltas.length) deltas.forEach(delta => emit({ type: "text", delta }));
      else if (content) emitText(content, emit);
      if (response.finishReason === "end_turn") return;
      if (response.finishReason === "tool_use") {
        messages.push(response.message);
        const toolResults: ToolResult[] = [];
        for (const tool of response.calls) {
          const result = await executeTool(tool.name, tool.input, context);
          toolResults.push({ id: tool.id, name: tool.name, ...result });
        }
        if (!toolResults.length) throw new Error("Missing tool calls");
        messages.push({ role: "tool", results: toolResults });
      } else if (response.finishReason === "pause_turn") {
        messages.push(response.message);
      } else {
        emit({ type: "error", message: "The assistant paused unexpectedly. Please try a shorter question." }); return;
      }
    }
    emit({ type: "error", message: "I reached the tool-step limit. Your calculated options are available; try a more specific question." });
  } catch (error) {
    if (signal?.aborted) return;
    console.warn("[agent] Live response failed:", error instanceof Error ? error.name : "Unknown error");
    emit({ type: "error", message: friendlyError(error) });
    diagnostic.record.fallback = true;
    await offlineChat(request, context);
  } finally { diagnostic.finish(); emit({ type: "done" }); }
}
