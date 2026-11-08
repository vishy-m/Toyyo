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
  return { moveType, overrides, replay: /replay|worst trip|trip.*hurt/.test(text) };
}
