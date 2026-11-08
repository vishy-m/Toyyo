import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { getClient } from "./client";
import { analyzeRepairDecision, type DecisionOption, type DecisionPath, type RepairAdvisorInput, type RepairDecision } from "../engines/repair-advisor";

const pathSchema = z.enum(["keep", "trade", "refinance"]);
const judgmentSchema = z.strictObject({
  selectedPath: pathSchema,
  rationale: z.string().min(1).max(600),
  downside: z.string().min(1).max(300),
  confidence: z.number().min(0).max(1),
});
const critiqueSchema = z.strictObject({
  supported: z.boolean(),
  concerns: z.array(z.string().max(240)).max(4),
  preferredPath: pathSchema.optional(),
});

export type PlanningCandidate = DecisionOption & { score: number; scoreReasons: string[] };
export type PlanningResult = {
  decision: RepairDecision;
  recommendation: DecisionPath;
  rationale: string;
  downside: string;
  confidence: number;
  concerns: string[];
  candidates: PlanningCandidate[];
  provider: "claude-haiku-5-5" | "local-fallback";
};

const PlanningState = Annotation.Root({
  input: Annotation<RepairAdvisorInput>(),
  decision: Annotation<RepairDecision>(),
  candidates: Annotation<PlanningCandidate[]>(),
  judgment: Annotation<z.infer<typeof judgmentSchema>>(),
  critique: Annotation<z.infer<typeof critiqueSchema>>(),
  usedClaude: Annotation<boolean>(),
  result: Annotation<PlanningResult>(),
});

function scoreCandidate(option: DecisionOption, decision: RepairDecision, input: RepairAdvisorInput): PlanningCandidate {
  if (!option.eligible) return { ...option, score: 0, scoreReasons: ["This path does not meet the current eligibility constraints."] };
  const paymentRoom = Math.max(1, input.monthlySurplus + input.currentPayment);
  const affordability = Math.max(0, 100 - (option.monthly / paymentRoom) * 100);
  const cashBase = Math.max(1, input.savings);
  const cashPreservation = Math.max(0, 100 - (option.upfront / cashBase) * 100);
  const riskFit = option.path === "trade" ? decision.score : option.path === "keep" ? 100 - decision.score : 90 - decision.score * 0.65;
  const engineBonus = option.path === decision.recommendation ? 12 : 0;
  const score = Math.max(0, Math.min(100, Math.round(affordability * 0.4 + cashPreservation * 0.25 + riskFit * 0.35 + engineBonus)));
  return {
    ...option,
    score,
    scoreReasons: [
      `Estimated monthly cost is $${option.monthly.toLocaleString()}.`,
      `Estimated upfront cost is $${option.upfront.toLocaleString()}.`,
      `The repair-to-trade signal is ${decision.score}/100.`,
    ],
  };
}

async function askClaude<T>(prompt: string, schema: z.ZodType<T>): Promise<T | null> {
  const client = getClient();
  if (!client) return null;
  const response = await client.beta.messages.create({
    model: process.env.PLANNING_MODEL ?? "claude-haiku-5-5",
    max_tokens: 700,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    system: "Return only valid compact JSON. Use only the supplied calculations. Never invent prices, rates, eligibility, diagnoses, or facts. Select only an eligible path.",
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content.filter(block => block.type === "text").map(block => block.text).join("");
  try { return schema.parse(JSON.parse(text)); } catch { return null; }
}

const workflow = new StateGraph(PlanningState)
  .addNode("validate", state => ({ input: { ...state.input, issue: state.input.issue.trim() } }))
  .addNode("calculate", state => ({ decision: analyzeRepairDecision(state.input) }))
  .addNode("constrain_and_score", state => ({ candidates: state.decision.options.map(option => scoreCandidate(option, state.decision, state.input)) }))
  .addNode("judge", async state => {
    const eligible = state.candidates.filter(candidate => candidate.eligible);
    const fallback = state.decision.recommendation;
    const judgment = await askClaude(
      `Choose the best plan for this driver. The deterministic engine recommends ${fallback}. Candidate data: ${JSON.stringify(eligible)}. Supporting facts: ${JSON.stringify(state.decision.reasons)}. Return {"selectedPath":"keep|trade|refinance","rationale":"...","downside":"...","confidence":0..1}.`,
      judgmentSchema,
    );
    return { usedClaude: Boolean(judgment), judgment: judgment && eligible.some(candidate => candidate.path === judgment.selectedPath) ? judgment : { selectedPath: fallback, rationale: state.decision.reasons.at(-1) ?? "This path best fits the calculated constraints.", downside: "Estimates and eligibility should be confirmed with qualified providers.", confidence: 0.72 } };
  })
  .addNode("critique_plan", async state => {
    const critique = await askClaude(
      `Audit this plan selection against the calculations. Selection: ${JSON.stringify(state.judgment)}. Candidates: ${JSON.stringify(state.candidates)}. Return {"supported":boolean,"concerns":["..."],"preferredPath":"keep|trade|refinance" optional}. A preferred path must be eligible.`,
      critiqueSchema,
    );
    return { critique: critique ?? { supported: true, concerns: [] } };
  })
  .addNode("finalize", state => {
    const eligiblePaths = new Set(state.candidates.filter(candidate => candidate.eligible).map(candidate => candidate.path));
    const critiquedPath = state.critique.supported ? state.judgment.selectedPath : state.critique.preferredPath;
    const recommendation = critiquedPath && eligiblePaths.has(critiquedPath) ? critiquedPath : state.decision.recommendation;
    return { result: { decision: state.decision, recommendation, rationale: state.judgment.rationale, downside: state.judgment.downside, confidence: state.critique.supported ? state.judgment.confidence : Math.min(state.judgment.confidence, 0.6), concerns: state.critique.concerns, candidates: state.candidates, provider: state.usedClaude ? "claude-haiku-5-5" : "local-fallback" } satisfies PlanningResult };
  })
  .addEdge(START, "validate")
  .addEdge("validate", "calculate")
  .addEdge("calculate", "constrain_and_score")
  .addEdge("constrain_and_score", "judge")
  .addEdge("judge", "critique_plan")
  .addEdge("critique_plan", "finalize")
  .addEdge("finalize", END)
  .compile();

export async function runPlanningWorkflow(input: RepairAdvisorInput) {
  const state = await workflow.invoke({ input });
  return state.result;
}
