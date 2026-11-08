export type RepairSeverity = "low" | "medium" | "high";

export interface RepairResearchItem {
  title: string;
  url: string;
  source: string;
  kind: "trusted" | "community";
  snippet?: string;
}

export interface RepairGuidance {
  severity: RepairSeverity;
  verdict: string;
  simpleSolution: string;
  allowTutorials: boolean;
  searchTerms: string;
}

const rules: { words: string[]; guidance: Omit<RepairGuidance, "searchTerms"> }[] = [
  {
    words: ["wiper", "washer fluid", "wiper blade"],
    guidance: {
      severity: "low",
      verdict: "Likely a simple maintenance item",
      simpleSolution: "Check that the wiper arm moves normally, then inspect and replace the blade. If the arm does not move, the motor, fuse, or linkage needs diagnosis.",
      allowTutorials: true,
    },
  },
  {
    words: ["battery", "won't start", "wont start", "slow crank", "clicking"],
    guidance: {
      severity: "medium",
      verdict: "Test before replacing parts",
      simpleSolution: "Check for loose or corroded battery terminals and get the battery and charging system tested before buying a replacement.",
      allowTutorials: true,
    },
  },
  {
    words: ["brake", "grind", "steering", "overheat", "smoke", "fuel leak", "gas smell"],
    guidance: {
      severity: "high",
      verdict: "Professional inspection recommended",
      simpleSolution: "Avoid driving if braking, steering, overheating, smoke, or a fuel smell is involved. Arrange an inspection or tow and request a written estimate.",
      allowTutorials: false,
    },
  },
  {
    words: ["engine", "transmission", "oil pressure", "temperature light", "airbag"],
    guidance: {
      severity: "high",
      verdict: "Diagnosis should come before a cost decision",
      simpleSolution: "Limit driving and have the warning or symptom diagnosed. A fault-code scan can help, but it should not be treated as a final diagnosis.",
      allowTutorials: false,
    },
  },
  {
    words: ["tire", "flat", "tread", "bulge"],
    guidance: {
      severity: "high",
      verdict: "Inspect the tire before driving",
      simpleSolution: "Check tire pressure and look for a sidewall bulge, exposed cord, or rapid air loss. Use the spare or roadside help if any are present.",
      allowTutorials: false,
    },
  },
];

export function guideRepair(issue: string, vehicle: { year: number; model: string }): RepairGuidance {
  const normalized = issue.toLowerCase();
  const match = rules.find((rule) => rule.words.some((word) => normalized.includes(word)));
  const fallback: Omit<RepairGuidance, "searchTerms"> = {
    severity: "medium",
    verdict: "More information is needed",
    simpleSolution: "Check the owner's manual for warning-light guidance, note when the symptom occurs, and get an inspection before replacing parts.",
    allowTutorials: false,
  };
  return {
    ...(match?.guidance ?? fallback),
    searchTerms: `${vehicle.year} Toyota ${vehicle.model} ${issue}`.replace(/\s+/g, " ").trim(),
  };
}
