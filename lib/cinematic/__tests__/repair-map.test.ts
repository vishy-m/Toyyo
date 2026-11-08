import { describe, expect, it } from "vitest";
import { getPersona } from "../../data";
import { diagnoseRepair } from "../repair-diagnosis";
import { rankShops, shopVerdict, topShops } from "../shop-ranking";
import { excerpt, ISSUE_TERMS, normalizePlaceReviews } from "../shop-reviews";
import type { Shop } from "../shops";

const shop = (over: Partial<Shop>): Shop => ({ id: "n/1", name: "Shop", lat: 0, lng: 0, distanceKm: 3, brand: null, isToyotaDealer: false, services: [], openingHours: null, website: null, phone: null, address: null, ...over });
const brakes = diagnoseRepair("my brakes are grinding", getPersona("jordan"));
const hybrid = diagnoseRepair("hybrid battery warning", getPersona("garcia"));

describe("repair map: top shops and verdict per shop", () => {
  it("shows the top five and always keeps the starred shop", () => {
    const shops = Array.from({ length: 8 }, (_, i) => shop({ id: `s${i}`, distanceKm: i + 1 }));
    const ranking = rankShops({ shops, radiusKm: 15, diagnosis: brakes });
    expect(topShops(ranking)).toHaveLength(5);
    const forced = { ...ranking, recommended: ranking.ranked[7] };
    expect(topShops(forced).map((r) => r.shop.id)).toContain("s7");
  });

  it("says go for the starred shop, a good option for one that lists the service, call first otherwise", () => {
    const shops = [shop({ id: "near", distanceKm: 1 }), shop({ id: "lists", distanceKm: 2, services: ["brakes"], phone: "555" })];
    const ranking = rankShops({ shops, radiusKm: 15, diagnosis: brakes });
    const by = (id: string) => shopVerdict(ranking.ranked.find((r) => r.shop.id === id)!, ranking, brakes);
    expect(ranking.recommended?.shop.id).toBe("lists");
    expect(by("lists")).toMatchObject({ tone: "go", headline: "Best fit for you" });
    expect(by("lists").detail).toMatch(/Lists this service.*2\.0 km away\.$/);
    expect(by("near")).toMatchObject({ tone: "caution", headline: "Call first" });
  });

  it("steers a possible warranty repair away from independent shops", () => {
    const shops = [shop({ id: "indie", distanceKm: 1, services: ["batteries"] }), shop({ id: "dealer", name: "Toyota of X", isToyotaDealer: true, distanceKm: 12 })];
    const ranking = rankShops({ shops, radiusKm: 40, diagnosis: hybrid });
    const indie = shopVerdict(ranking.ranked.find((r) => r.shop.id === "indie")!, ranking, hybrid);
    expect(ranking.recommended?.shop.id).toBe("dealer");
    expect(indie).toMatchObject({ tone: "caution", headline: "Not for this repair" });
  });
});

describe("repair map: reviews (real ones only)", () => {
  const place = {
    rating: 4.6, userRatingCount: 1203, googleMapsUri: "https://maps.google.com/?cid=1",
    reviews: [
      { rating: 5, text: { text: "Great oil change, quick and friendly." }, authorAttribution: { displayName: "A" }, relativePublishTimeDescription: "a month ago" },
      { rating: 4, text: { text: "Brought my Corolla in because the brakes were grinding. They replaced pads and rotors the same day." }, authorAttribution: { displayName: "B", uri: "https://example.com/b" }, relativePublishTimeDescription: "2 months ago" },
    ],
  };

  it("keeps only reviews about the same kind of problem, with rating and author", () => {
    const r = normalizePlaceReviews(place, ISSUE_TERMS.brakes);
    expect(r).toMatchObject({ rating: 4.6, count: 1203, mapsUrl: "https://maps.google.com/?cid=1" });
    expect(r.mentions).toHaveLength(1);
    expect(r.mentions[0]).toMatchObject({ rating: 4, author: "B", authorUrl: "https://example.com/b", when: "2 months ago" });
    expect(normalizePlaceReviews(place, ISSUE_TERMS.ac).mentions).toEqual([]);
    expect(normalizePlaceReviews(place, ISSUE_TERMS.unknown).mentions).toEqual([]);
  });

  it("quotes around the matching words, trimmed on word boundaries", () => {
    const long = `${"Lots of unrelated words about parking and coffee. ".repeat(6)}The brakes were grinding badly and they fixed it fast. ${"More unrelated words. ".repeat(6)}`;
    const quote = excerpt(long, ISSUE_TERMS.brakes, 120);
    expect(quote).toContain("brakes were grinding");
    expect(quote.startsWith("…")).toBe(true);
    expect(quote.endsWith("…")).toBe(true);
    expect(quote.length).toBeLessThanOrEqual(122);
    expect(excerpt("Short brake note.", ISSUE_TERMS.brakes)).toBe("Short brake note.");
  });
});
