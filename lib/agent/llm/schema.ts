import { Type, type Schema } from "@google/genai";

// Gemini's OpenAPI subset differs from JSON Schema. Zod remains authoritative
// for constraints omitted here (e.g. additionalProperties and exclusiveMinimum).
export function geminiSchema(input: unknown): Schema {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected a JSON schema object");
  const source = input as Record<string, unknown>;
  if (source.$ref || source.allOf || source.oneOf) throw new Error("Unsupported schema composition");
  const schema: Schema = {};
  if (Array.isArray(source.type)) {
    const nonNull = source.type.filter(type => type !== "null");
    if (nonNull.length === 1) Object.assign(schema, geminiSchema({ ...source, type: nonNull[0] }), { nullable: source.type.includes("null") });
    else schema.anyOf = source.type.map(type => geminiSchema({ ...source, type }));
  }
  if (typeof source.type === "string") {
    const type = source.type.toUpperCase();
    if (!Object.values(Type).includes(type as Type)) throw new Error("Unsupported schema type");
    schema.type = type as Type;
  }
  if (Array.isArray(source.anyOf)) {
    const choices = source.anyOf as Record<string, unknown>[];
    const nonNull = choices.filter(choice => choice.type !== "null");
    if (nonNull.length !== choices.length && nonNull.length === 1) Object.assign(schema, geminiSchema(nonNull[0]), { nullable: true });
    else schema.anyOf = choices.map(geminiSchema);
  }
  if (source.properties && typeof source.properties === "object") schema.properties = Object.fromEntries(Object.entries(source.properties).map(([key, value]) => [key, geminiSchema(value)]));
  if (source.items) schema.items = geminiSchema(source.items);
  if (Array.isArray(source.required)) schema.required = source.required as string[];
  const values = source.const !== undefined ? [source.const] : source.enum;
  if (Array.isArray(values)) schema.enum = values.map(String);
  for (const key of ["description", "title", "format", "pattern"] as const) if (typeof source[key] === "string") schema[key] = source[key];
  for (const key of ["minimum", "maximum"] as const) if (typeof source[key] === "number") schema[key] = source[key];
  for (const key of ["minItems", "maxItems", "minLength", "maxLength"] as const) if (typeof source[key] === "number") schema[key] = String(source[key]);
  return schema;
}
