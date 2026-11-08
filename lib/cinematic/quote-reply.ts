export interface QuoteSummary { total: number | null; items: { label: string; amount: number }[]; appointments: string[]; summary: string }
export function summarizeQuote(body: string): QuoteSummary {
  const money = (text: string) => Number(text.replace(/,/g, ""));
  const totalMatch = body.match(/\bTotal:\s*\$([\d,]+(?:\.\d{2})?)/i);
  const items = [...body.matchAll(/^([^\n:]+):\s*\$([\d,]+(?:\.\d{2})?)/gm)]
    .filter((match) => !/^total$/i.test(match[1].trim()))
    .map((match) => ({ label: match[1].trim(), amount: money(match[2]) }));
  const appointments = [...body.matchAll(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) at \d{1,2}:\d{2} [AP]M\b/gi)].map((m) => m[0]);
  const total = totalMatch ? money(totalMatch[1]) : null;
  const diagnostic = body.match(/diagnostic fee \$([\d,]+)/i);
  return { total, items, appointments, summary: total !== null ? `Preliminary quote: $${total.toFixed(2)} plus tax.` : diagnostic ? `Inspection needed. Diagnostic fee $${diagnostic[1]}, applied to the repair.` : "The shop replied with details; read the full email below." };
}
