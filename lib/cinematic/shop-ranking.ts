import type { RepairDiagnosis } from "./repair-diagnosis";
import type { Shop } from "./shops";

/** Beyond this, a Toyota dealer is "too far" when the repair may be under warranty. */
export const DEALER_RADIUS_KM = 40;

export interface RankedShop { shop: Shop; fit: number; reasons: string[] }
export interface Ranking {
  ranked: RankedShop[];
  /** The starred shop, or null when there is no good one (see `message`). */
  recommended: RankedShop | null;
  /** Why the star is there, or why there is none. Always set. */
  message: string;
  /** True when nothing can be recommended and the message explains why. */
  noGood: boolean;
}

export interface RankingInput {
  shops: Shop[];
  radiusKm: number;
  diagnosis: Pick<RepairDiagnosis, "serviceKeys" | "hybridSpecific" | "coverage" | "worth" | "category" | "understood">;
}

const km = (n: number) => `${n.toFixed(1)} km`;

/**
 * OpenStreetMap has no ratings, so this ranks by fit and distance only:
 * a Toyota dealer when coverage may apply or the job is hybrid-specific; shops tagged for the service next;
 * then closer; a website or phone is a small plus (you can reach them).
 */
export function rankShops({ shops, radiusKm, diagnosis }: RankingInput): Ranking {
  const covered = diagnosis.coverage.mayBeCovered;
  const dealerPreferred = covered || diagnosis.hybridSpecific;
  const scored: RankedShop[] = shops.map((shop) => {
    const reasons: string[] = [];
    let fit = -shop.distanceKm / 10;
    if (shop.isToyotaDealer) {
      reasons.push("Toyota dealer");
      if (dealerPreferred) { fit += 5; reasons.push(covered ? "can confirm warranty coverage" : "handles hybrid systems"); }
      else fit += 0.5;
    }
    const matched = diagnosis.serviceKeys.filter((key) => shop.services.includes(key));
    if (matched.length) { fit += 2; reasons.push("lists this service"); }
    if (shop.website || shop.phone) { fit += 0.5; reasons.push("easy to contact"); }
    reasons.push(`${km(shop.distanceKm)} away`);
    return { shop, fit, reasons };
  }).sort((a, b) => b.fit - a.fit || a.shop.distanceKm - b.shop.distanceKm);

  const none = (message: string): Ranking => ({ ranked: scored, recommended: null, message, noGood: true });
  if (!shops.length) return none(`No repair shops found within ${Math.round(radiusKm)} km in the map data. That can mean a gap in the data, not that there are none. Try “Use my location”, or search for shops directly.`);
  if (diagnosis.worth.verdict === "not-worth") return none("We aren’t starring a shop because this repair may cost more than the car is worth. Replacing the car may make more sense than repairing it. If you still want it repaired, get quotes from the shops below.");
  if (covered) {
    const dealers = scored.filter((r) => r.shop.isToyotaDealer && r.shop.distanceKm <= DEALER_RADIUS_KM);
    if (!dealers.length) return none(`This repair may be covered by Toyota’s warranty, which usually means using a Toyota dealer, but none turned up within ${DEALER_RADIUS_KM} km. Call Toyota Customer Experience to find an authorized dealer before paying a shop.`);
    return { ranked: scored, recommended: dealers[0], noGood: false, message: `A Toyota dealer is recommended because this may be covered by warranty and only a dealer can confirm it. ${dealers[0].shop.name} is the closest, ${km(dealers[0].shop.distanceKm)} away.` };
  }
  const best = scored[0];
  const why = best.reasons.filter((r) => !r.endsWith("away")).join(", ");
  return { ranked: scored, recommended: best, noGood: false, message: `${best.shop.name} is recommended on fit and distance: ${why ? `${why}, ` : ""}${km(best.shop.distanceKm)} away.` };
}

/** The map shows only the best few shops; the rest are noise for a single repair. */
export const MAP_TOP = 5;

/** The ranked shops the map shows: the top few, always including the recommended one. */
export function topShops(ranking: Ranking, count = MAP_TOP): RankedShop[] {
  const top = ranking.ranked.slice(0, count);
  const star = ranking.recommended;
  if (star && !top.some((r) => r.shop.id === star.shop.id)) top[top.length - 1] = star;
  return top;
}

export type VerdictTone = "go" | "ok" | "caution";
export interface ShopVerdict { tone: VerdictTone; headline: string; detail: string }

/** Should this driver take this repair to this shop? One short headline and why, from the same facts as the ranking. */
export function shopVerdict(entry: RankedShop, ranking: Ranking, diagnosis: RankingInput["diagnosis"]): ShopVerdict {
  const { shop, reasons } = entry;
  const away = `${km(shop.distanceKm)} away`;
  const covered = diagnosis.coverage.mayBeCovered;
  if (ranking.recommended?.shop.id === shop.id) {
    const why = reasons.filter((r) => !r.endsWith("away"));
    return { tone: "go", headline: "Best fit for you", detail: `${why.length ? `${why.join(", ")}, ` : ""}${away}.`.replace(/^./, (c) => c.toUpperCase()) };
  }
  if (diagnosis.worth.verdict === "not-worth") return { tone: "caution", headline: "Get a quote first", detail: "This repair may cost more than the car is worth, so compare quotes before committing." };
  if (covered && !shop.isToyotaDealer) return { tone: "caution", headline: "Not for this repair", detail: "It may be under warranty, and only a Toyota dealer can confirm coverage." };
  if (diagnosis.hybridSpecific && !shop.isToyotaDealer) return { tone: "caution", headline: "Call first", detail: "Hybrid-system work is best done by a Toyota dealer." };
  if (reasons.includes("lists this service")) return { tone: "ok", headline: "Good option", detail: `Lists this service, ${away}.` };
  if (shop.isToyotaDealer) return { tone: "ok", headline: "Good option", detail: `Toyota dealer that knows your car, usually at a higher price. ${away.replace(/^./, (c) => c.toUpperCase())}.` };
  if (!diagnosis.serviceKeys.length) return { tone: "ok", headline: "Worth a call", detail: `${away.replace(/^./, (c) => c.toUpperCase())}. Ask if they can inspect it.` };
  return { tone: "caution", headline: "Call first", detail: "It doesn’t list this service in the map data, so ask before you go." };
}
