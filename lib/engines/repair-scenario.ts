import type { DecisionOption, RepairAdvisorInput } from "./repair-advisor";

const creditOrder: RepairAdvisorInput["credit"][] = ["building", "fair", "good", "excellent"];
const dollars = (value: number) => `$${Math.round(value).toLocaleString()}`;
const amount = (value: string, suffix?: string) => {
  const parsed = Number(value.replace(/,/g, "")) * (suffix?.toLowerCase() === "k" ? 1000 : 1);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100_000_000, parsed)) : 0;
};
export type ParsedScenario = { input?: RepairAdvisorInput; summary?: string; error?: string };

export function projectFlexibleCash(options: DecisionOption[], input: RepairAdvisorInput) {
  const months = Math.max(24, input.keepYears * 12);
  return Array.from({ length: Math.floor(months / 6) + 1 }, (_, index) => {
    const month = index * 6;
    return Object.fromEntries([["month", month], ...options.map((option) => {
      const addedMonthlyCost = Math.max(0, option.monthly - input.currentPayment);
      return [option.path, input.savings - option.upfront + (input.monthlySurplus - addedMonthlyCost) * month];
    })]);
  });
}

export function parseLifeScenario(text: string, base: RepairAdvisorInput, baselineQuote: number): ParsedScenario {
  const source = text.trim().toLowerCase();
  if (!source) return { error: "Describe what changed and include the relevant amount." };
  const input: RepairAdvisorInput = { ...base, vehicle: { ...base.vehicle } };
  const changes: string[] = [];
  const money = "\\$?([\\d,.]+)\\s*(k)?";
  const salaryMatch = source.match(new RegExp(`(?:make|earn|salary(?: is)?|income(?: is)?)\\s*(?:about\\s*)?${money}(?:\\s*(?:a year|per year|yearly|annual(?:ly)?))?`));
  const annualIncome = salaryMatch ? amount(salaryMatch[1], salaryMatch[2]) : undefined;
  const percentBefore = source.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(raise|increase|pay bump|pay cut|income cut|decrease|reduction)/);
  const percentAfter = source.match(/(raise|increase|pay bump|pay cut|income cut|decrease|reduction)(?:\s+(?:of|by|was))?\s*(\d+(?:\.\d+)?)\s*(?:%|percent)/);
  const percentValue = percentBefore?.[1] ?? percentAfter?.[2];
  const percentKind = percentBefore?.[2] ?? percentAfter?.[1];
  const dollarBefore = source.match(new RegExp(`${money}\\s*(?:(monthly|annual|yearly)\\s*)?(raise|increase|pay bump|pay cut|income cut|decrease|reduction)`));
  const dollarAfter = source.match(new RegExp(`(raise|increase|pay bump|pay cut|income cut|decrease|reduction)(?:\\s+(?:of|by|was))?\\s*${money}\\s*(monthly|annual|yearly)?`));
  if (percentValue && percentKind) {
    if (!annualIncome) return { error: "For a percentage raise or pay cut, include your current annual income—for example: “I make $60k and got a 10% raise.”" };
    const percent = Number(percentValue);
    const decrease = /cut|decrease|reduction/.test(percentKind);
    const annualChange = annualIncome * percent / 100 * (decrease ? -1 : 1);
    const monthlyChange = annualChange / 12;
    input.monthlySurplus = Math.max(0, Math.round(input.monthlySurplus + monthlyChange));
    changes.push(`${decrease ? "Pay cut" : "Raise"}: ${dollars(Math.abs(annualChange))}/year = ${dollars(Math.abs(monthlyChange))}/month ${decrease ? "less" : "more"} available`);
  } else if (dollarBefore || dollarAfter) {
    const change = dollarBefore ? amount(dollarBefore[1], dollarBefore[2]) : amount(dollarAfter![2], dollarAfter![3]);
    const cadence = dollarBefore?.[3] ?? dollarAfter?.[4];
    const kind = dollarBefore?.[4] ?? dollarAfter![1];
    const monthly = cadence === "monthly";
    const decrease = /cut|decrease|reduction/.test(kind);
    const monthlyChange = (monthly ? change : change / 12) * (decrease ? -1 : 1);
    input.monthlySurplus = Math.max(0, Math.round(input.monthlySurplus + monthlyChange));
    changes.push(`${decrease ? "Pay cut" : "Raise"}: ${monthly ? `${dollars(change)}/month` : `${dollars(change)}/year ÷ 12 = ${dollars(change / 12)}/month`} ${decrease ? "less" : "more"} available`);
  }
  const rent = source.match(new RegExp(`(?:rent|mortgage)(?:\\s+(?:went|goes|is|rose|increased|rises|up))?\\s*(?:up|by|another)?\\s*${money}`));
  if (rent) { const value = amount(rent[1], rent[2]); input.monthlySurplus = Math.max(0, Math.round(input.monthlySurplus - value)); changes.push(`Housing: ${dollars(value)}/month less available`); }
  const bonus = source.match(new RegExp(`${money}\\s*(?:one[- ]time\\s*)?bonus`)) ?? source.match(new RegExp(`bonus(?:\\s+(?:of|was))?\\s*${money}`));
  if (bonus) { const value = amount(bonus[1], bonus[2]); input.savings += value; changes.push(`Bonus: ${dollars(value)} added to savings`); }
  const emergency = source.match(new RegExp(`${money}\\s*(?:emergency|medical bill|unexpected (?:bill|expense)|home repair)`)) ?? source.match(new RegExp(`(?:emergency|medical bill|unexpected (?:bill|expense)|home repair)(?:\\s+(?:of|was|cost))?\\s*${money}`));
  if (emergency) { const value = amount(emergency[1], emergency[2]); input.savings = Math.max(0, input.savings - value); changes.push(`Unexpected expense: ${dollars(value)} removed from savings`); }
  const quote = source.match(new RegExp(`${money}\\s*(?:repair|shop)?\\s*quote`)) ?? source.match(new RegExp(`(?:repair|shop)\\s*quote(?: is| of| came to)?\\s*${money}`));
  if (quote) { const value = amount(quote[1], quote[2]); input.manualQuote = value; changes.push(`Repair quote set to ${dollars(value)}`); }
  else {
    const quotePercent = source.match(/repair (?:quote|cost).{0,12}(\d+(?:\.\d+)?)\s*%\s*(higher|more|lower|less)/);
    if (quotePercent) { const multiplier = 1 + Number(quotePercent[1]) / 100 * (/lower|less/.test(quotePercent[2]) ? -1 : 1); input.manualQuote = Math.max(0, Math.round(baselineQuote * multiplier)); changes.push(`Repair quote changed from ${dollars(baselineQuote)} to ${dollars(input.manualQuote)}`); }
  }
  const down = source.match(new RegExp(`${money}\\s*(?:more|extra)?\\s*(?:for a |toward a )?down payment`)) ?? source.match(new RegExp(`down payment(?:\\s+(?:by|of|was))?\\s*${money}`));
  if (down) { const value = amount(down[1], down[2]); input.downPayment += value; changes.push(`Down payment increased by ${dollars(value)}`); }
  const miles = source.match(/(?:drive|drove|mileage|odometer).{0,18}([\d,.]+)\s*(k)?\s*(?:more |extra )?miles/);
  if (miles) { const value = amount(miles[1], miles[2]); input.vehicle.mileage += value; changes.push(`Vehicle mileage increased by ${Math.round(value).toLocaleString()} miles`); }
  const keep = source.match(/keep (?:the car|it)(?: for)?\s*(\d+)\s*(?:more|extra)?\s*years?/);
  if (keep) { const years = Number(keep[1]); input.keepYears = /more|extra/.test(keep[0]) ? Math.min(10, input.keepYears + years) : Math.min(10, years); changes.push(`Ownership horizon set to ${input.keepYears} years`); }
  if (/credit.{0,12}(?:improve|better|up)/.test(source)) { input.credit = creditOrder[Math.min(creditOrder.length - 1, creditOrder.indexOf(input.credit) + 1)]; changes.push(`Credit moved up to ${input.credit}`); }
  else if (/credit.{0,12}(?:decline|worse|down|drop)/.test(source)) { input.credit = creditOrder[Math.max(0, creditOrder.indexOf(input.credit) - 1)]; changes.push(`Credit moved down to ${input.credit}`); }
  if (!changes.length) return { error: "I couldn’t identify a financial change. Include an amount and what changed, such as a raise, rent, bonus, emergency expense, repair quote, down payment, or mileage." };
  return { input, summary: changes.join(" • ") };
}
