import type { CaseFile, CaseOption, DashboardData, NextStepType } from "../types";

/** Pure view rules for a case: who gets a specialist, who may see offers. Testable without React. */
export interface CaseView {
  specialist: boolean;
  specialistReason: string | null;
  marketingOk: boolean;
  nextStep: NextStepType;
  stepLabel: string;
  options: CaseOption[];
  /** Offers that were left out because the driver hasn't agreed to marketing. */
  hiddenOffers: number;
}

const NEW_VEHICLE_OPTIONS = new Set(["RENEW"]);

export function caseView(data: DashboardData, kase: CaseFile): CaseView {
  const profile = data.persona.profile;
  const missed = data.persona.consent.paymentHistory ? data.cashflow?.latePaymentsLast12 ?? 0 : 0;
  const marketingOk = profile?.marketingConsent !== false;
  const specialistReason = kase.bestMove.nextStepType === "Follow-up" ? "This one needs a person to confirm the details."
    : profile?.vulnerable ? "A specialist can talk it through with you."
    : missed >= 2 ? "With a couple of late payments, a specialist can help you find the easiest path."
    : null;
  const all = kase.options ?? [];
  const options = marketingOk ? all : all.filter((o) => !NEW_VEHICLE_OPTIONS.has(o.optionId));
  const wantsOffer = kase.bestMove.nextStepType === "Offer";
  const nextStep: NextStepType = specialistReason ? "Follow-up" : wantsOffer && !marketingOk ? "Self-service" : kase.bestMove.nextStepType;
  return {
    specialist: Boolean(specialistReason), specialistReason, marketingOk, nextStep,
    stepLabel: nextStep === "Offer" ? "Eligible offer" : nextStep,
    options, hiddenOffers: all.length - options.length,
  };
}
