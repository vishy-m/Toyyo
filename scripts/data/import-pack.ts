/** Imports three customers from the UTD "Smartest Next Move" synthetic data pack (data/pack, supplied as-is).
 * Run: npx tsx scripts/data/import-pack.ts
 * Writes data/personas/<id>.json, data/cashflow/<id>.json, data/cases/<id>.json and merges the reference rows
 * (insurance base premium, market value) the engines need. Everything pack-derived is read from the CSVs; the few
 * fields the pack lacks are listed as assumptions in each case file's `notes`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CaseFile, CaseOption, NextStepType, Persona } from '../../lib/types';

const root = resolve(import.meta.dirname, '../..');
const csvDir = resolve(root, 'data/pack/data');

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
const table = (name: string) => parseCsv(readFileSync(resolve(csvDir, `${name}.csv`), 'utf8'));
const customers = table('customers'), vehicles = table('vehicles'), accounts = table('accounts'), situations = table('situations'), golden = table('golden_answers'), optionRows = table('option_scenarios');
const one = (rows: Record<string, string>[], id: string) => { const r = rows.filter(x => x.customer_id === id); if (r.length !== 1) throw new Error(`${id}: expected one row, got ${r.length}`); return r[0]; };
const num = (s: string) => (s === '' ? null : Number(s));

const MAP = [
  { pack: 'C010', id: 'ryan', asset: '/models/camry.glb', body: 'sedan', hybrid: true, mpg: 44, paint: '#B3122C', model: 'Camry XSE', emoji: '🌄', career: 'Richardson software engineer', tag: 'moving to Denver', intended: 'lease-end', premium: 172, base: 190, lifeEvents: ['relocating to Denver in 2 months'] },
  { pack: 'C006', id: 'devon', asset: '/models/cinematic/optimized/toyota-rav4.glb', body: 'suv', hybrid: true, mpg: 40, paint: '#3F6FB0', model: 'RAV4 Hybrid XSE', emoji: '🎨', career: 'Dallas UX designer', tag: 'lease ending', intended: 'lease-end', premium: 148, base: 165, lifeEvents: ['open to a newer hybrid'] },
  { pack: 'C003', id: 'priya', asset: '/models/cinematic/optimized/toyota-corolla-cross.glb', body: 'suv', hybrid: false, mpg: 32, paint: '#2F9AA0', model: 'Corolla Cross LE', emoji: '📈', career: 'Plano marketing manager', tag: 'over the mileage limit', intended: 'lease-end', premium: 178, base: 200, lifeEvents: ['driving more than planned'] },
] as const;
const TIER = { A: 'excellent', B: 'good', C: 'fair', D: 'building' } as const;
const addMonths = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return d.toISOString().slice(0, 10); };
type MarketRow = { model: string; year: number; bands: { maxMiles: number; value: number }[] };
const write = (rel: string, data: unknown) => writeFileSync(resolve(root, rel), JSON.stringify(data, null, 2) + '\n');
const merge = <T,>(rel: string, f: (data: T) => void) => { const p = resolve(root, rel); const data = JSON.parse(readFileSync(p, 'utf8')) as T; f(data); writeFileSync(p, JSON.stringify(data, null, 2) + '\n'); };

for (const m of MAP) {
  const c = one(customers, m.pack), v = one(vehicles, m.pack), a = one(accounts, m.pack), s = one(situations, m.pack), g = one(golden, m.pack);
  if (a.contract_type !== 'lease') throw new Error(`${m.pack} is not a lease`);
  const term = Number(a.term_months);
  const income = Number(c.annual_income), payday = Number(c.payday_day);
  const persona: Persona = {
    id: m.id, name: c.first_name, displayName: `${c.first_name}, ${c.age} · ${m.career}`, age: Number(c.age), city: c.city, avatarEmoji: m.emoji,
    vehicle: { year: Number(v.model_year), make: 'Toyota', model: m.model, bodyStyle: m.body, modelAsset: m.asset, paintHex: m.paint, odometer: Number(v.odometer_now), vin: `SYNTHETIC-${m.id.toUpperCase()}-001`, isHybrid: m.hybrid, mpg: m.mpg },
    contract: { kind: 'lease', startDate: a.contract_start, termMonths: term, monthsRemaining: Number(a.months_remaining), monthlyPayment: Number(a.monthly_payment), annualMileageAllowance: Number(a.mileage_allowance_total) / (term / 12), overageRatePerMile: 0.25, residualValue: Number(a.residual_value), purchaseOptionFee: 350, dispositionFee: 395 },
    insurance: { carrier: 'Lone Star Mutual (simulated)', monthlyPremium: m.premium, usageBased: false },
    toyotaCare: { startDate: addMonths(v.toyota_care_ends, -24), expiresMonths: 24, expiresMiles: 25000 },
    creditTier: TIER[c.credit_tier_now as keyof typeof TIER],
    consent: { driving: true, banking: true, paymentHistory: true, shareWithInsurers: false },
    preferences: { priorityWeights: { monthlyPayment: 0.25, totalCost: 0.4, flexibility: 0.25, lifestyleFit: 0.1 }, detailLevel: 'standard', format: 'bullets', lifestyleTags: [], suppressedMoveTypes: [], dismissed: [], accepted: [], learned: [] },
    lifeEvents: [...m.lifeEvents], intendedBestMove: m.intended,
    profile: { packCustomerId: m.pack, occupation: c.occupation, annualIncome: income, preferredChannel: c.preferred_channel, marketingConsent: c.marketing_consent === 'Y', vulnerable: c.vulnerable_flag === 'Y', financialStressScore: Number(c.financial_stress_score), digitalEngagement: c.digital_engagement },
  };
  write(`data/personas/${m.id}.json`, persona);
  write(`data/cashflow/${m.id}.json`, {
    payday: payday === 15 ? 'semimonthly-1-15' : 'monthly-1', avgBalance: Math.round(income / 12 * 0.4 / 100) * 100,
    paymentDueDay: Number(a.payment_due_day), latePaymentsLast12: Number(a.missed_payments_12m), recurringShortfall: Number(c.financial_stress_score) >= 50,
  });
  const options: CaseOption[] = optionRows.filter(o => o.customer_id === m.pack).map(o => ({
    optionId: o.option_id, optionName: o.option_name, newMonthlyPayment: num(o.new_monthly_payment), monthlyPaymentChange: num(o.monthly_payment_change), upfrontCost: num(o.upfront_cost),
    totalCostVsKeepAsIs: num(o.total_cost_vs_keep_as_is), eligibility: o.eligibility, plainLanguageSummary: o.plain_language_summary, keyAssumption: o.key_assumption, tradeoff: o.tradeoff,
  }));
  const dateNote = `The pack's clock is 2026-11-07 and Toyyo's is 2026-10-27; the pack's ${a.months_remaining} months remaining are kept as supplied.`;
  const caseFile: CaseFile = {
    personaId: m.id, source: 'pack', packCustomerId: m.pack,
    driver: { firstName: c.first_name, age: Number(c.age), city: c.city, state: c.state, occupation: c.occupation },
    quote: s.customer_says, context: s.context_summary,
    bestMove: { title: g.best_next_move, nextStepType: g.next_step_type as NextStepType, message: g.plain_language_message, whyNotOthers: g.why_not_the_others, guardrails: g.guardrail_notes, optionId: g.offer_id },
    options,
    notes: [
      dateNote,
      `Vehicle, lease terms, credit tier, cash-flow dates and profile come from the pack (${m.pack}). Annual allowance is mileage_allowance_total divided by the term in years; overage $0.25/mile, disposition fee $395 and purchase option fee $350 are the pack's stated assumptions.`,
      `Insurance is not in the pack: $${m.premium}/month with "Lone Star Mutual (simulated)" is a simulated placeholder, and the insurer-sharing consent is off by default.`,
      `MPG is not in the pack: ${m.mpg} is an approximate EPA combined figure for the model.`,
      'Toyota Care start is the pack end date minus 24 months. Average balance is a simulated 40% of monthly income. Drive history (90 days, real OSRM routes) is synthetic, calibrated to the pack annual_miles_est.',
      'The pack ignores sales tax in its buyout figures; the Toyyo lease-end engine adds 6.25% Texas tax, so its buyout totals are slightly higher than the pack option rows.',
    ],
  };
  write(`data/cases/${m.id}.json`, caseFile);
  merge<{ basePremium: Record<string, number> }>('data/reference/insurance-tiers.json', d => { d.basePremium[m.id] = m.base; });
  merge<MarketRow[]>('data/reference/market-values.json', d => {
    const row = { model: m.model, year: Number(v.model_year), bands: [{ maxMiles: 999999, value: Number(v.est_market_value_now) }] };
    const i = d.findIndex(r => r.model === row.model && r.year === row.year);
    if (i >= 0) d[i] = row; else d.push(row);
  });
  console.log(`${m.pack} -> ${m.id}: ${m.model}, golden ${g.best_next_move} [${g.next_step_type}], ${options.length} options`);
}
