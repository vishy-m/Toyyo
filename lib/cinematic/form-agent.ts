import type { RepairCategory } from "@/lib/engines/repair-advisor";

export interface FormField { name: string; id: string; type: string; label: string; placeholder: string; required: boolean; options: { value: string; label: string }[] }
export interface ParsedForm { action: string; method: string; fields: FormField[]; text: string }
export interface FormProfile { name: string; email: string; phone: string; vehicleYear: number; vehicleMake: string; vehicleModel: string; mileage: number; zip?: string; category: RepairCategory; issue: string; preferredDate?: string }
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity: string) => {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return entity[0] === "#" ? String.fromCodePoint(entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)) : named[entity.toLowerCase()] ?? `&${entity};`;
});
const plain = (s: string) => decode(s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
const attrs = (s: string) => {
  const out: Record<string, string> = {};
  for (const match of s.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) out[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? "");
  return out;
};
export function extractForms(html: string): ParsedForm[] {
  const forms: ParsedForm[] = [];
  for (const form of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi)) {
    const a = attrs(form[1]), content = form[2];
    const labels = new Map<string, string>();
    for (const label of content.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label\s*>/gi)) {
      const la = attrs(label[1]); if (la.for) labels.set(la.for, plain(label[2]));
    }
    const fields: FormField[] = [];
    for (const tag of content.matchAll(/<(input|textarea|select)\b([^>]*)(?:>([\s\S]*?)<\/\1\s*>|\s*\/?>)/gi)) {
      const tagName = tag[1].toLowerCase(), fa = attrs(tag[2]);
      if (!fa.name || ["submit", "button", "hidden", "reset"].includes(fa.type)) continue;
      const options = tagName === "select" ? [...(tag[3] ?? "").matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option\s*>/gi)].map((o) => ({ value: attrs(o[1]).value ?? plain(o[2]), label: plain(o[2]) })) : [];
      fields.push({ name: fa.name, id: fa.id ?? "", type: fa.type ?? tagName, label: labels.get(fa.id ?? "") ?? "", placeholder: fa.placeholder ?? "", required: "required" in fa, options });
    }
    forms.push({ action: a.action ?? "", method: (a.method ?? "get").toLowerCase(), fields, text: plain(content) });
  }
  return forms;
}
export function pickQuoteForm(forms: ParsedForm[]) {
  return forms.filter((form) => form.fields.length && form.method === "post").sort((a, b) => score(b) - score(a))[0] ?? null;
}
function score(form: ParsedForm) { return (/(quote|estimate|service)/i.test(`${form.action} ${form.text}`) ? 100 : 0) + form.fields.length; }
export const hasCaptcha = (html: string) => /recaptcha|hcaptcha|cf-turnstile|g-recaptcha|captcha/i.test(html);
export function findMailto(html: string) { const match = html.match(/href\s*=\s*["']mailto:([^"'?#]+)(?:\?[^"']*)?["']/i); return match ? decode(match[1]) : null; }
const nextWeekday = () => { const d = new Date(); d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
export function fillForm(form: ParsedForm, profile: FormProfile) {
  const values: Record<string, string> = {}, filled: { label: string; value: string }[] = [], unmapped: string[] = [];
  const parts = profile.name.trim().split(/\s+/);
  for (const field of form.fields) {
    const key = `${field.name} ${field.id} ${field.label} ${field.placeholder}`.toLowerCase().replace(/[_-]/g, " ");
    let value: string | undefined;
    if (/first.?name|given.?name/.test(key)) value = parts[0];
    else if (/last.?name|surname|family.?name/.test(key)) value = parts.slice(1).join(" ") || parts[0];
    else if (/name/.test(key) && !/vehicle|model|make/.test(key)) value = profile.name;
    else if (/e.?mail|relay/.test(key)) value = profile.email;
    else if (/phone|mobile|tel/.test(key)) value = profile.phone;
    else if (/mileage|odometer|miles/.test(key)) value = String(profile.mileage);
    else if (/zip|postal/.test(key)) value = profile.zip;
    else if (/year/.test(key)) value = String(profile.vehicleYear);
    else if (/make/.test(key)) value = profile.vehicleMake;
    else if (/model/.test(key)) value = profile.vehicleModel;
    else if (/vehicle|car/.test(key)) value = `${profile.vehicleYear} ${profile.vehicleMake} ${profile.vehicleModel}`;
    else if (/date|appointment|when/.test(key)) value = profile.preferredDate ?? nextWeekday();
    else if (field.type === "select" || /service|repair.?type|category/.test(key)) {
      const category = profile.category === "battery" ? /batter|electrical/i : profile.category === "ac" ? /a\/c|air conditioning|ac/i : new RegExp(profile.category.slice(0, -1), "i");
      value = field.options.find((o) => category.test(`${o.label} ${o.value}`))?.value ?? field.options.find((o) => o.value)?.value;
    }
    else if (/issue|problem|message|description|details|symptom/.test(key) || field.type === "textarea") value = profile.issue;
    if (value !== undefined && value !== "") { values[field.name] = value; filled.push({ label: field.label || field.name, value }); }
    else if (field.required) unmapped.push(field.label || field.name);
  }
  return { values, filled, unmapped };
}
