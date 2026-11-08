import { z } from "zod";

export const personaIdSchema = z.enum(["maya", "garcia", "jordan", "raj", "nora", "eli", "ava", "theo", "ryan", "devon", "priya"]);
export const moveTypeSchema = z.enum(["lease-end", "insurance", "payment", "protection"]);
export const prioritySchema = z.enum(["monthlyPayment", "totalCost", "flexibility", "lifestyleFit"]);
export const detailSchema = z.enum(["brief", "standard", "show-math"]);
export const formatSchema = z.enum(["bullets", "table", "story"]);
export const consentSchema = z.enum(["driving", "banking", "paymentHistory", "shareWithInsurers"]);
export const overridesSchema = z.strictObject({
  monthlyMiles: z.number().min(0).max(20000).optional(),
  monthsAhead: z.number().int().min(0).max(120).optional(),
  extraPrincipal: z.number().min(0).max(100000).optional(),
  paymentDueDay: z.number().int().min(1).max(28).optional(),
  scoreImprovement: z.number().min(0).max(100).optional(),
});
const id = z.string().trim().min(1).max(200);
export const chatSchema = z.strictObject({
  personaId: personaIdSchema,
  message: z.string().trim().min(1).max(12000),
  context: z.strictObject({ widget: id.optional(), optionId: id.optional(), tripId: id.optional() }).optional(),
});
export const whatIfSchema = z.strictObject({ personaId: personaIdSchema, moveType: moveTypeSchema, overrides: overridesSchema });
export const actionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("accept"), personaId: personaIdSchema, optionId: id, mode: z.enum(["self-service", "specialist-callback"]) }),
  z.strictObject({ kind: z.literal("dismiss"), personaId: personaIdSchema, optionId: id, reason: z.enum(["too-expensive", "not-now", "not-relevant", "already-done"]) }),
  z.strictObject({ kind: z.literal("delete_learned"), personaId: personaIdSchema, learnedId: id }),
  z.strictObject({ kind: z.literal("set_consent"), personaId: personaIdSchema, source: consentSchema, value: z.boolean() }),
  z.strictObject({ kind: z.literal("set_style"), personaId: personaIdSchema, detailLevel: detailSchema.optional(), format: formatSchema.optional() }).refine(v => v.detailLevel !== undefined || v.format !== undefined, "Choose a style setting"),
]);
