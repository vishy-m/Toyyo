import { describe, expect, it } from "vitest";
import { getPersona } from "../../data";
import { diagnoseRepair } from "../repair-diagnosis";
import { rankShops, DEALER_RADIUS_KM } from "../shop-ranking";
import { normalizeShops, reviewsUrl, type Shop } from "../shops";
import { checkCoverage } from "../warranty";
import type { PersonaId } from "../../types";

const dx = (id: PersonaId, issue: string) => diagnoseRepair(issue, getPersona(id));

const shop = (over: Partial<Shop>): Shop => ({ id: "n/1", name: "Shop", lat: 0, lng: 0, distanceKm: 3, brand: null, isToyotaDealer: false, services: [], openingHours: null, website: null, phone: null, address: null, ...over });

describe("repair diagnosis", () => {
  it("grinding brakes: replace pads and rotors, safety urgency, wear item not covered", () => {
    const d = dx("jordan", "my brake disk are grinding");
    expect(d.category).toBe("brakes");
    expect(d.urgency.level).toBe("now");
    expect(d.repairOrReplace.verdict).toBe("replace");
    expect(d.repairOrReplace.part).toMatch(/pads and rotors/i);
    expect(d.coverage.mayBeCovered).toBe(false);
    expect(d.serviceKeys).toContain("brakes");
    expect(d.cost.low).toBeGreaterThan(0);
  });
  it("hybrid battery on the 2021 RAV4 Hybrid may be covered", () => {
    const d = dx("garcia", "hybrid battery warning");
    expect(d.hybridSpecific).toBe(true);
    expect(d.coverage.mayBeCovered).toBe(true);
    expect(d.coverage.lines[0].label).toBe("Hybrid battery warranty");
  });
  it("engine knocking on the 2007 Hilux may not be worth repairing", () => {
    const d = dx("eli", "engine knocking and losing power");
    expect(d.category).toBe("engine");
    expect(d.urgency.level).toBe("now");
    expect(d.worth.verdict).toBe("not-worth");
    expect(d.coverage.mayBeCovered).toBe(false);
  });
  it("unknown descriptions need an inspection, no invented diagnosis", () => {
    const d = dx("maya", "it feels weird sometimes");
    expect(d.understood).toBe(false);
    expect(d.repairOrReplace.verdict).toBe("inspect");
    expect(d.worth.verdict).toBe("unknown");
    expect(d.parts).toEqual([]);
  });
  it("covers the quick-chip phrases", () => {
    for (const [text, category] of [["Brakes grinding", "brakes"], ["Won't start / battery", "battery"], ["Check-engine light", "engine"], ["A/C blowing warm", "ac"], ["Vibration or tire wear", "tires"]] as const) {
      expect(dx("garcia", text).category, text).toBe(category);
    }
  });
  it("never produces NaN text", () => {
    for (const id of ["maya", "garcia", "jordan", "nora", "eli", "ava", "theo"] as PersonaId[]) expect(JSON.stringify(dx(id, "transmission slipping"))).not.toMatch(/NaN|undefined/);
  });
  it("a leased car is judged on upkeep, not resale", () => {
    expect(dx("maya", "check engine light").worth.verdict).not.toBe("not-worth");
  });
  it("brand-new warranty: Corolla Cross (2025) basic coverage applies to non-wear repairs only", () => {
    const p = getPersona("ava");
    expect(checkCoverage(p, "ac", { hybridPart: false, asOf: "2026-10-27" }).mayBeCovered).toBe(true);
    expect(checkCoverage(p, "brakes", { hybridPart: false, asOf: "2026-10-27" }).mayBeCovered).toBe(false);
  });
});

describe("shop ranking", () => {
  const brakes = dx("jordan", "brakes grinding");
  const covered = dx("garcia", "hybrid battery warning");
  it("brakes-tagged shop beats an untagged one at a similar distance", () => {
    const r = rankShops({ shops: [shop({ id: "a", name: "A", distanceKm: 3 }), shop({ id: "b", name: "B", distanceKm: 3.5, services: ["brakes"] })], radiusKm: 15, diagnosis: brakes });
    expect(r.recommended?.shop.id).toBe("b");
    expect(r.noGood).toBe(false);
  });
  it("prefers a Toyota dealer when coverage may apply, even if farther", () => {
    const r = rankShops({ shops: [shop({ id: "a", distanceKm: 2, services: ["battery_charging"] }), shop({ id: "d", name: "Toyota of X", isToyotaDealer: true, distanceKm: 20 })], radiusKm: 40, diagnosis: covered });
    expect(r.recommended?.shop.id).toBe("d");
    expect(r.message).toMatch(/warranty/i);
  });
  it("covered but no dealer within range: explains and stars nothing", () => {
    const r = rankShops({ shops: [shop({ id: "a", distanceKm: 2 })], radiusKm: 40, diagnosis: covered });
    expect(r.recommended).toBeNull();
    expect(r.message).toContain(`${DEALER_RADIUS_KM} km`);
  });
  it("nothing in the radius: explains", () => {
    const r = rankShops({ shops: [], radiusKm: 40, diagnosis: brakes });
    expect(r.recommended).toBeNull();
    expect(r.noGood).toBe(true);
    expect(r.message).toMatch(/No repair shops found within 40 km/);
  });
  it("repair costing more than the car: no star, says replacing may make more sense", () => {
    const r = rankShops({ shops: [shop({ id: "a" })], radiusKm: 15, diagnosis: dx("eli", "engine knocking") });
    expect(r.recommended).toBeNull();
    expect(r.message).toMatch(/replacing the car/i);
  });
});

describe("shop normalization", () => {
  it("normalizes Overpass elements and builds a reviews link", () => {
    const shops = normalizeShops([
      { type: "node", id: 1, lat: 29.77, lon: -95.37, tags: { name: "Toyota of Houston", shop: "car", brand: "Toyota", "service:vehicle:brakes": "yes", website: "example.com", "addr:street": "Main St", "addr:housenumber": "1" } },
      { type: "way", id: 2, center: { lat: 29.8, lon: -95.4 }, tags: { name: "Bob's Auto", shop: "car_repair" } },
      { type: "node", id: 3, lat: 29.8, lon: -95.4, tags: { shop: "car_repair" } },
    ], { lat: 29.76, lng: -95.37 });
    expect(shops).toHaveLength(2);
    expect(shops[0].isToyotaDealer).toBe(true);
    expect(shops[0].services).toEqual(["brakes"]);
    expect(shops[0].website).toBe("https://example.com");
    expect(shops[1].isToyotaDealer).toBe(false);
    expect(reviewsUrl(shops[0])).toContain("google.com/maps/search");
  });
});

describe("shop names (Mapbox has no service tags)", () => {
  it("infers services from a shop's name", async () => {
    const { inferServices, isNonMechanical } = await import("../shops");
    expect(inferServices("Ryle's Complete Auto Care")).toContain("brakes");
    expect(inferServices("Texan Automotive")).toContain("car_repair");
    expect(inferServices("Discount Tire")).toContain("tyres");
    expect(inferServices("AAMCO Transmissions")).toContain("transmission");
    expect(inferServices("Alina LLC")).toEqual([]);
    expect(isNonMechanical("WindshieldHUB")).toBe(true);
    expect(isNonMechanical("Upper class collision")).toBe(true);
    expect(isNonMechanical("Cameron Highway Oil Pipeline")).toBe(true);
    expect(isNonMechanical("Einar's Garage")).toBe(false);
  });
  it("keeps a Toyota dealership's service department but not a pre-owned lot", async () => {
    const { normalizeMapboxShops } = await import("../shops");
    const feature = (name: string, lng: number, lat: number) => ({ geometry: { coordinates: [lng, lat] as [number, number] }, properties: { name, brand: ["Toyota"], poi_category: ["car dealership"] } });
    const shops = normalizeMapboxShops([feature("Joe Myers Toyota", -95.5, 29.9), feature("Joe Myers Toyota PreOwned", -95.5, 29.91)], { lat: 29.76, lng: -95.37 });
    expect(shops.find((s) => s.name === "Joe Myers Toyota")?.isToyotaDealer).toBe(true);
    expect(shops.find((s) => s.name === "Joe Myers Toyota PreOwned")?.isToyotaDealer).toBe(false);
  });
});
