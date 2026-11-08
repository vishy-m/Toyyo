import type { RepairCategory } from "../engines/repair-advisor";

/**
 * Real reviews of nearby shops from Google Places (only when GOOGLE_PLACES_API_KEY is set). We never invent reviews:
 * the shops are real businesses, so without a review source the card says so and links out instead.
 */
export interface ReviewMention { text: string; rating: number | null; author: string | null; authorUrl: string | null; when: string | null }
export interface ShopReviews { rating: number | null; count: number | null; mapsUrl: string | null; mentions: ReviewMention[] }
export interface ReviewsResult { source: "google" | "none"; byId: Record<string, ShopReviews> }

/** Words that mark a review as being about the same kind of problem. Lowercase; matched as substrings. */
export const ISSUE_TERMS: Record<RepairCategory, string[]> = {
  brakes: ["brake", "pads", "rotor", "grind", "squeal"],
  battery: ["battery", "won't start", "wont start", "jump start", "alternator", "starter"],
  tires: ["tire", "tyre", "alignment", "balanc", "vibrat", "rotation"],
  wipers: ["wiper", "washer"],
  ac: ["a/c", "air condition", "freon", "refrigerant", "ac system", "ac repair", "ac recharge"],
  engine: ["check engine", "engine light", "diagnos", "engine"],
  transmission: ["transmission", "shifting", "gearbox"],
  unknown: [],
};

/** How the card names the problem: "None of its recent reviews mention brakes." */
export const ISSUE_NOUN: Record<RepairCategory, string> = {
  brakes: "brakes", battery: "batteries or starting", tires: "tires", wipers: "wipers", ac: "A/C", engine: "engine trouble",
  transmission: "transmissions", unknown: "this problem",
};

export function mentionsIssue(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

/** Up to `max` characters around the first matching term, cut on word boundaries, with ellipses where trimmed. */
export function excerpt(text: string, terms: string[], max = 170) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const lower = clean.toLowerCase();
  const hit = Math.max(0, Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0), clean.length));
  let start = Math.max(0, Math.min(hit - Math.floor(max / 3), clean.length - max));
  if (start > 0) start = clean.indexOf(" ", start) + 1 || start;
  let end = Math.min(clean.length, start + max);
  if (end < clean.length) end = clean.lastIndexOf(" ", end) > start ? clean.lastIndexOf(" ", end) : end;
  return `${start > 0 ? "…" : ""}${clean.slice(start, end).trim()}${end < clean.length ? "…" : ""}`;
}

/** Google Places API (New) place, with the fields our field mask asks for. */
export interface PlacesPlace {
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  location?: { latitude: number; longitude: number };
  reviews?: {
    rating?: number;
    text?: { text?: string };
    originalText?: { text?: string };
    authorAttribution?: { displayName?: string; uri?: string };
    relativePublishTimeDescription?: string;
  }[];
}

/** The rating and up to two reviews that talk about this kind of problem, quoted around the matching words. */
export function normalizePlaceReviews(place: PlacesPlace, terms: string[]): ShopReviews {
  const mentions = (place.reviews ?? [])
    .map((r) => ({ text: r.text?.text ?? r.originalText?.text ?? "", rating: r.rating ?? null, author: r.authorAttribution?.displayName ?? null, authorUrl: r.authorAttribution?.uri ?? null, when: r.relativePublishTimeDescription ?? null }))
    .filter((r) => r.text && terms.length > 0 && mentionsIssue(r.text, terms))
    .slice(0, 2)
    .map((r) => ({ ...r, text: excerpt(r.text, terms) }));
  return { rating: place.rating ?? null, count: place.userRatingCount ?? null, mapsUrl: place.googleMapsUri ?? null, mentions };
}
