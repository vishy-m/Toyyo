import type { NextStepType, PersonaId } from "@/lib/types";
import jordan from "../../data/cases/jordan.json";
import nora from "../../data/cases/nora.json";
import eli from "../../data/cases/eli.json";
import theo from "../../data/cases/theo.json";
import ryan from "../../data/cases/ryan.json";
import devon from "../../data/cases/devon.json";
import priya from "../../data/cases/priya.json";

/** Client-safe card summary of a carousel case (the full CaseFile is on GET /api/persona/[id]). */
export interface CaseSummary {
  personaId: PersonaId;
  source: "pack" | "toyyo";
  firstName: string;
  age: number;
  city: string;
  /** The situation in the driver's own words. */
  quote: string;
  /** One-line situation summary. */
  context: string;
  bestMoveTitle: string;
  nextStepType: NextStepType;
}

type CaseJson = { personaId: string; source: string; driver: { firstName: string; age: number; city: string }; quote: string; context: string; bestMove: { title: string; nextStepType: string } };

const summarize = (c: CaseJson): CaseSummary => ({
  personaId: c.personaId as PersonaId,
  source: c.source as CaseSummary["source"],
  firstName: c.driver.firstName,
  age: c.driver.age,
  city: c.driver.city,
  quote: c.quote,
  context: c.context,
  bestMoveTitle: c.bestMove.title,
  nextStepType: c.bestMove.nextStepType as NextStepType,
});

export const CASE_SUMMARIES: Partial<Record<PersonaId, CaseSummary>> = Object.fromEntries(
  [jordan, nora, eli, theo, ryan, devon, priya].map((c) => [c.personaId, summarize(c)]),
);

export function getCaseSummary(personaId: PersonaId): CaseSummary | undefined {
  return CASE_SUMMARIES[personaId];
}
