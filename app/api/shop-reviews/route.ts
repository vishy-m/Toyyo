import { z } from "zod";
import { errorResponse, json, readBody } from "@/lib/server/http";
import { haversineKm } from "@/lib/cinematic/shops";
import { ISSUE_TERMS, normalizePlaceReviews, type PlacesPlace, type ReviewsResult, type ShopReviews } from "@/lib/cinematic/shop-reviews";

// Reviews for the few shops on the repair map, from Google Places (New) Text Search. Off unless GOOGLE_PLACES_API_KEY
// is set: then each shop is looked up by name and address near its coordinates, and only reviews that mention the
// driver's kind of problem are returned. Short in-memory cache; nothing is stored.
const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELDS = "places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.reviews";
const MATCH_KM = 0.4; // a result farther than this from the shop's pin is a different business
const TTL_MS = 10 * 60 * 1000;
const store = globalThis as unknown as { __shopReviewCache?: Map<string, { at: number; value: ShopReviews | null }> };
const cache = (store.__shopReviewCache ??= new Map());

const bodySchema = z.object({
  category: z.enum(["brakes", "battery", "tires", "ac", "engine", "transmission", "unknown"]),
  shops: z.array(z.object({
    id: z.string().min(1).max(200),
    name: z.string().min(1).max(200),
    address: z.string().max(300).nullable().optional(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })).max(5),
});
type ShopQuery = z.infer<typeof bodySchema>["shops"][number];

async function reviewsFor(key: string, shop: ShopQuery, terms: string[], cacheKey: string): Promise<ShopReviews | null> {
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let value: ShopReviews | null = null;
  try {
    const response = await fetch(PLACES_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
      body: JSON.stringify({
        textQuery: [shop.name, shop.address].filter(Boolean).join(" "),
        locationBias: { circle: { center: { latitude: shop.lat, longitude: shop.lng }, radius: 500 } },
        pageSize: 1,
      }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) throw new Error(`Places ${response.status}`);
    const place = ((await response.json()) as { places?: PlacesPlace[] }).places?.[0];
    const near = place?.location && haversineKm({ lat: shop.lat, lng: shop.lng }, { lat: place.location.latitude, lng: place.location.longitude }) <= MATCH_KM;
    value = place && near ? normalizePlaceReviews(place, terms) : null;
  } catch (error) {
    console.warn("[shop-reviews] lookup failed:", error instanceof Error ? error.message : error);
    return null; // not cached: a later request may succeed
  }
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}

export async function POST(request: Request) {
  try {
    const { category, shops } = await readBody(request, bodySchema);
    const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
    if (!key) return json({ source: "none", byId: {} } satisfies ReviewsResult);
    const terms = ISSUE_TERMS[category];
    const found = await Promise.all(shops.map(async (shop) => [shop.id, await reviewsFor(key, shop, terms, `${shop.id}:${category}`)] as const));
    const byId = Object.fromEntries(found.filter((entry): entry is readonly [string, ShopReviews] => entry[1] !== null));
    return json({ source: "google", byId } satisfies ReviewsResult);
  } catch (error) { return errorResponse(error); }
}
