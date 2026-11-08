import { z } from "zod";
import { errorResponse, HttpError, json } from "@/lib/server/http";
import { bboxAround, normalizeMapboxShops, normalizeShops, overpassQuery, type ShopSearchResult } from "@/lib/cinematic/shops";

// Primary source: Mapbox Search Box (fast, ~0.2 s; the project's Mapbox token, read on the server). Fallback:
// OpenStreetMap via Overpass, whose public servers are often at capacity; community mirrors serve the same data.
const MAPBOX_TOKEN = process.env.MAPBOX || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const MAPBOX_URL = "https://api.mapbox.com/search/searchbox/v1";
const OVERPASS_URLS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const USER_AGENT = "Toyyo demo (repair-shop search)";
const REQUEST_MS = 15_000; // fallback only; the public Overpass server is sometimes slow under load
const TTL_MS = 10 * 60 * 1000; // short-lived: search results are for this visit, not stored
const NEAR_KM = 15, FAR_KM = 40, MIN_RESULTS = 3;
// On globalThis so dev hot reloads keep the cache.
const store = globalThis as unknown as { __repairShopCache?: Map<string, { at: number; value: ShopSearchResult }> };
const cache = (store.__repairShopCache ??= new Map());

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

async function searchMapbox(lat: number, lng: number, radiusKm: number) {
  const dealerKm = Math.max(radiusKm, FAR_KM); // a dealer is worth a longer drive for warranty or hybrid work
  const area = (km: number) => ({ proximity: `${lng},${lat}`, bbox: bboxAround(lat, lng, km).join(","), language: "en", access_token: MAPBOX_TOKEN });
  const get = async (path: string, params: Record<string, string>) => {
    const response = await fetch(`${MAPBOX_URL}/${path}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`Mapbox ${response.status}`);
    return ((await response.json()) as { features?: Parameters<typeof normalizeMapboxShops>[0] }).features ?? [];
  };
  // Nearby mechanics, plus Toyota dealerships (their service departments do warranty and hybrid work).
  const [repair, dealers] = await Promise.all([
    get("category/auto_repair", { ...area(radiusKm), limit: "25" }),
    get("forward", { ...area(dealerKm), q: "Toyota", poi_category: "car_dealership", types: "poi", limit: "10" }),
  ]);
  return normalizeMapboxShops([...repair, ...dealers], { lat, lng }).filter((shop) => shop.distanceKm <= (shop.isToyotaDealer ? dealerKm : radiusKm));
}

async function searchOverpass(lat: number, lng: number, radiusKm: number) {
  let failure: unknown;
  for (const url of OVERPASS_URLS) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: overpassQuery(lat, lng, radiusKm) }),
        signal: AbortSignal.timeout(REQUEST_MS),
      });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      const body = (await response.json()) as { elements?: Parameters<typeof normalizeShops>[0] };
      return normalizeShops(body.elements ?? [], { lat, lng });
    } catch (error) { failure = error; }
  }
  throw failure;
}

/** Nearest shops, but never let close-in mechanics crowd out the Toyota dealers (warranty and hybrid work). */
function keepDealers(shops: ShopSearchResult["shops"], limit: number) {
  const dealers = shops.filter((shop) => shop.isToyotaDealer).slice(0, 5);
  const others = shops.filter((shop) => !shop.isToyotaDealer).slice(0, limit - dealers.length);
  return [...others, ...dealers].sort((a, b) => a.distanceKm - b.distanceKm);
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const parsed = querySchema.parse({ lat: params.get("lat"), lng: params.get("lng") });
    // Round to ~1 km: better cache hits, and a coarser location leaves the server.
    const lat = Math.round(parsed.lat * 100) / 100, lng = Math.round(parsed.lng * 100) / 100;
    const key = `v4:${lat},${lng}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return json(hit.value);
    let value: ShopSearchResult;
    try {
      let source: ShopSearchResult["source"] = "mapbox";
      let search = searchMapbox;
      if (!MAPBOX_TOKEN) { source = "openstreetmap"; search = searchOverpass; }
      const run = async () => {
        let radiusKm = NEAR_KM;
        let shops = await search(lat, lng, radiusKm);
        if (shops.length < MIN_RESULTS) { radiusKm = FAR_KM; shops = await search(lat, lng, radiusKm); }
        return { shops: keepDealers(shops, 25), radiusKm };
      };
      let found: { shops: ShopSearchResult["shops"]; radiusKm: number };
      try { found = await run(); }
      catch (error) {
        if (search === searchOverpass) throw error;
        source = "openstreetmap"; search = searchOverpass; // Mapbox failed: try OpenStreetMap
        found = await run();
      }
      value = { ...found, source };
    } catch {
      throw new HttpError(502, "Shop search is unavailable right now.");
    }
    cache.set(key, { at: Date.now(), value });
    return json(value);
  } catch (error) { return errorResponse(error); }
}
