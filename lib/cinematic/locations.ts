/** Home-area coordinates for the cities the demo cars live in (city centres, not addresses). */
export const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Austin: { lat: 30.2672, lng: -97.7431 },
  "San Antonio": { lat: 29.4241, lng: -98.4936 },
  Houston: { lat: 29.7604, lng: -95.3698 },
  Dallas: { lat: 32.7767, lng: -96.797 },
  "San Juan": { lat: 18.4655, lng: -66.1057 }, // San Juan, Puerto Rico (the Hilux case is set there; Hilux is sold in PR)
  "Fort Worth": { lat: 32.7555, lng: -97.3308 },
  Boerne: { lat: 29.7947, lng: -98.732 },
};

export function cityCoords(city: string) {
  return CITY_COORDS[city] ?? CITY_COORDS.Austin;
}

/** Rounded to 2 decimals (~1 km): all that the shop search needs and all that leaves the browser. */
export const roundCoord = (n: number) => Math.round(n * 100) / 100;
