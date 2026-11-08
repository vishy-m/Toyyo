/** Repair shops from Mapbox Search (primary) or OpenStreetMap/Overpass (fallback). Pure helpers, testable offline. */
export interface Shop {
  sandbox?: boolean;
  id: string;
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
  brand: string | null;
  isToyotaDealer: boolean;
  /** service:vehicle:<key>=yes tags, keys only (e.g. "brakes"). */
  services: string[];
  openingHours: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
}

export interface ShopSearchResult { shops: Shop[]; radiusKm: number; source: "mapbox" | "openstreetmap" }

interface OverpassElement { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function overpassQuery(lat: number, lng: number, radiusKm: number) {
  const around = `(around:${Math.round(radiusKm * 1000)},${lat},${lng})`;
  return `[out:json][timeout:35];(nwr["shop"="car_repair"]${around};nwr["shop"="car"]["brand"~"Toyota",i]${around};nwr["shop"="car"]["name"~"Toyota",i]${around};nwr["shop"="car_repair"]["name"~"Toyota",i]${around};);out center tags 300;`;
}

const addressOf = (t: Record<string, string>) => {
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  const parts = [street, t["addr:city"], t["addr:state"]].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
};

export function normalizeShops(elements: OverpassElement[], origin: { lat: number; lng: number }): Shop[] {
  const seen = new Set<string>();
  const shops: Shop[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number" || !tags.name) continue;
    const key = `${tags.name.toLowerCase()}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const brand = tags.brand ?? null;
    const website = tags.website ?? tags["contact:website"] ?? null;
    shops.push({
      id: `${el.type}/${el.id}`,
      name: tags.name,
      lat, lng,
      distanceKm: Math.round(haversineKm(origin, { lat, lng }) * 10) / 10,
      brand,
      isToyotaDealer: /toyota/i.test(brand ?? "") || (tags.shop === "car" && /toyota/i.test(tags.name)),
      services: Object.entries(tags).filter(([k, v]) => k.startsWith("service:vehicle:") && v === "yes").map(([k]) => k.slice("service:vehicle:".length)),
      openingHours: tags.opening_hours ?? null,
      website: website && /^https?:\/\//i.test(website) ? website : website ? `https://${website}` : null,
      phone: tags.phone ?? tags["contact:phone"] ?? null,
      address: addressOf(tags),
    });
  }
  return shops.sort((a, b) => a.distanceKm - b.distanceKm);
}

/** [minLng, minLat, maxLng, maxLat] around a point: Mapbox's proximity is only a bias, so results are boxed in. */
export function bboxAround(lat: number, lng: number, km: number): [number, number, number, number] {
  const dLat = km / 111.32, dLng = km / (111.32 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((v) => Math.round(v * 1e4) / 1e4) as [number, number, number, number];
}

interface MapboxFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: { mapbox_id?: string; name?: string; full_address?: string; address?: string; brand?: string[]; poi_category?: string[]; metadata?: { phone?: string; website?: string; open_hours?: unknown } };
}

/**
 * Mapbox's "auto_repair" category has no per-service tags and is noisy (glass, collision, detailing, even
 * non-automotive businesses), so services are inferred from the shop's name, using the same keys as
 * OpenStreetMap's service:vehicle:* tags. A name that says nothing gets no services (no bonus, no penalty).
 */
const NOT_MECHANICAL = /pipeline|oil (and|&) gas|detail|car ?wash|upholster|interior|tint|audio|stereo|locksmith|\btow(ing)?\b|hvac|heating|plumb|scooter|windshield|glass|collision|body ?shop|paint|\bdent\b|wrap/i;
const SERVICE_RULES: [RegExp, string[]][] = [
  [/auto(motive)?\s*(repair|service|care|center|centre|clinic|works|tech|doctor|shop|pros?)|automotive|auto ?ha[ui]s|mechanic|garage|car (care|repair)|service cent(er|re)|tune|lube|valvoline|christian brothers|precision tune/i,
    ["car_repair", "brakes", "diagnostics", "batteries", "battery_charging", "electrical", "engine_tuning"]],
  [/brake|midas|meineke|monro|pep boys|firestone|goodyear|ntb|mr\.? ?tire|big o/i, ["brakes"]],
  [/tire|tyre|wheel|alignment|ntb|goodyear|firestone|discount tire|big o/i, ["tyres", "wheel_alignment", "wheels"]],
  [/transmission|aamco|cottman/i, ["transmission"]],
  [/batter(y|ies)|auto electric|alternator|starter/i, ["batteries", "battery_charging", "electrical"]],
  [/(auto|car)\b.*\b(a\/?c|air)|\b(a\/?c|air)\b.*\b(auto|car)/i, ["air_conditioning"]],
  [/engine|diesel|performance/i, ["engine_tuning", "diagnostics", "car_repair"]],
];
export function isNonMechanical(name: string) { return NOT_MECHANICAL.test(name); }
export function inferServices(name: string): string[] {
  const out = new Set<string>();
  for (const [rule, keys] of SERVICE_RULES) if (rule.test(name)) keys.forEach((k) => out.add(k));
  return [...out];
}

/** Mapbox Search Box features (auto_repair category + Toyota dealership search) -> shops within reach. */
export function normalizeMapboxShops(features: MapboxFeature[], origin: { lat: number; lng: number }): Shop[] {
  const seen = new Set<string>();
  const shops: Shop[] = [];
  for (const f of features) {
    const p = f.properties ?? {}, c = f.geometry?.coordinates;
    if (!p.name || !c) continue;
    const [lng, lat] = c;
    const dealershipCat = (p.poi_category ?? []).some((cat) => /dealer/i.test(cat));
    if (!dealershipCat && isNonMechanical(p.name)) continue; // not a mechanical repair shop
    const key = p.mapbox_id ?? `${p.name.toLowerCase()}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const brand = p.brand?.[0] ?? null;
    const dealership = (p.poi_category ?? []).some((cat) => /dealer/i.test(cat));
    const toyota = /toyota/i.test(brand ?? "") || /toyota/i.test(p.name);
    const website = p.metadata?.website ?? null;
    shops.push({
      id: `mapbox/${key}`,
      name: p.name,
      lat, lng,
      distanceKm: Math.round(haversineKm(origin, { lat, lng }) * 10) / 10,
      brand,
      // A Toyota dealership's service department; pre-owned sales lots don't do warranty work.
      isToyotaDealer: toyota && dealership && !/pre-?owned|used/i.test(p.name),
      services: inferServices(p.name), // Mapbox has no per-service tags; inferred from the name
      openingHours: null,
      website: website && /^https?:\/\//i.test(website) ? website : website ? `https://${website}` : null,
      phone: p.metadata?.phone ?? null,
      address: p.full_address ?? p.address ?? null,
    });
  }
  return shops.sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Google Maps search for the shop's name and address, to read reviews there. */
export function reviewsUrl(shop: Pick<Shop, "name" | "address" | "lat" | "lng">) {
  const q = [shop.name, shop.address ?? `${shop.lat.toFixed(5)},${shop.lng.toFixed(5)}`].join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
