export type GroundedNumber = { raw: string; value: number; unit: "dollars" | "percent" | "miles" };
const numeric = String.raw`[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
const amount = (raw: string, multiplier?: string) => Number(raw.replaceAll(",", "")) * (multiplier?.toLowerCase() === "k" ? 1000 : multiplier?.toLowerCase() === "m" ? 1000000 : 1);

export function extractNumbers(text: string): GroundedNumber[] {
  const found: GroundedNumber[] = [];
  const ranges: { start: number; end: number }[] = [];
  // Handle both endpoints before single values, including a currency symbol only on the left.
  const rangePattern = new RegExp(String.raw`(\$)?\s*(${numeric})\s*([kKmM]\b)?\s*(?:–|—|\bto\b|-)\s*(\$)?\s*(${numeric})\s*([kKmM]\b)?\s*(%|percent\b|miles?\b|mi\b)?`, "gi");
  for (const match of text.matchAll(rangePattern)) {
    const unit = match[1] || match[4] ? "dollars" : match[7]?.match(/%|percent/i) ? "percent" : match[7] ? "miles" : null;
    if (!unit) continue;
    found.push({ raw: match[0], value: amount(match[2], match[3] ?? match[6]), unit });
    found.push({ raw: match[0], value: amount(match[5], match[6]), unit });
    ranges.push({ start: match.index!, end: match.index! + match[0].length });
  }
  const patterns: [RegExp, GroundedNumber["unit"]][] = [
    [new RegExp(String.raw`\$\s*(${numeric})\s*([kKmM])?\b`, "g"), "dollars"],
    [new RegExp(String.raw`(${numeric})\s*(?:%|percent\b)`, "gi"), "percent"],
    [new RegExp(String.raw`(${numeric})\s*([kK])?\s*(?:miles?\b|mi\b)`, "gi"), "miles"],
  ];
  for (const [pattern, unit] of patterns) for (const match of text.matchAll(pattern)) {
    if (ranges.some(range => match.index! >= range.start && match.index! < range.end)) continue;
    found.push({ raw: match[0], value: amount(match[1], match[2]), unit });
  }
  return found;
}
function evidenceNumbers(data: unknown, values: number[] = [], key = ""): number[] {
  if (/^(id|optionId|personaId|vin|createdAt|start|end|deadline|startDate)$/.test(key)) return values;
  if (typeof data === "number" && Number.isFinite(data)) {
    values.push(data);
    if (/pct|ratio|likelihood/i.test(key)) values.push(data * 100);
  } else if (typeof data === "string") {
    for (const item of extractNumbers(data)) values.push(item.value);
    // Engine math/assumption results may omit a currency or mileage unit.
    if (/^[\s~≈+-]*[\d,$.]+(?:\s*(?:\/mo|months?|years?))?$/.test(data)) {
      const match = data.match(new RegExp(numeric));
      if (match) values.push(amount(match[0]));
    }
  } else if (Array.isArray(data)) data.forEach(value => evidenceNumbers(value, values, key));
  else if (data && typeof data === "object") Object.entries(data).forEach(([name, value]) => evidenceNumbers(value, values, name));
  return values;
}
export function checkGrounding(text: string, evidence: unknown): { grounded: boolean; violations: GroundedNumber[] } {
  const values = evidenceNumbers(evidence);
  const violations = extractNumbers(text).filter(number => {
    const scale = number.unit === "dollars" ? 1 : 10;
    return !values.some(value => Math.round(value * scale) === Math.round(number.value * scale));
  });
  if (violations.length) console.warn("[grounding] Unsupported numbers:", violations.map(value => value.raw).join(", "));
  return { grounded: violations.length === 0, violations };
}
