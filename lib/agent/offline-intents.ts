import type { DashboardData, MoveType, WhatIfOverrides } from "../types";

/** Route demo requests to the same validated tools used by the live agent. */
export function offlineIntent(message: string, dashboard: DashboardData) {
  const text = message.toLowerCase();
  const overrides: WhatIfOverrides = {};
  const miles = text.match(/(-?[\d,]+(?:\.\d+)?)\s*(?:miles?|mi)\s*(?:a|per|\/|each)?\s*(?:month|mo)\b/);
  const lessDriving = /\b(?:drive\s+less|fewer\s+miles|less\s+driving)\b/.test(text);
  const extra = text.match(/(?:extra|additional)\s*\$?(-?[\d,]+(?:\.\d+)?)/);
  if (miles || lessDriving) overrides.monthlyMiles = miles ? Number(miles[1].replaceAll(",", "")) : 900;
  if (extra) overrides.extraPrincipal = Number(extra[1].replaceAll(",", ""));
  let moveType: MoveType = /lease[ -]?end|buy\s?out|re-?lease/.test(text) ? "lease-end"
    : /insur|score|brak/.test(text) ? "insurance"
    : /protect|tire|care/.test(text) ? "protection"
    : /payment|refinanc|payoff|principal/.test(text) ? "payment"
    : dashboard.ranked[0]?.moveType ?? "lease-end";
  if (overrides.monthlyMiles !== undefined) moveType = "lease-end";
  else if (overrides.extraPrincipal !== undefined) moveType = "payment";
  const repair = /\b(?:brakes?|braking|grinding|squeal\w*|won'?t start|wont start|dead battery|check[- ]engine|engine light|a\/c|air conditioning|vibrat\w*|overheat\w*|knocking|stalling|broke\w*|noise)\b/.test(text);
  const askOpen = /\b(?:show|open|see|view|go to|take me to|look at|check)\b/.test(text);
  const page = repair ? "repairs" as const
    : askOpen && /\b(?:dashboard|overview|home)\b/.test(text) ? "overview" as const
    : askOpen && /\b(?:driving|drives?|trips?|mileage|score|replay)\b/.test(text) ? "driving" as const
    : askOpen && /\b(?:finances?|loan|lease|payments?|refinanc\w*)\b/.test(text) ? "finances" as const
    : undefined;
  const bestMove = /\b(?:what should i do|best (?:next )?move|smartest|what are my options|my options|next move|what now|what do i do)\b/.test(text);
  return { moveType, overrides, bestMove, page, issue: repair ? message.trim().slice(0, 240) : undefined, replay: /replay|worst trip|trip.*hurt/.test(text) };
}
