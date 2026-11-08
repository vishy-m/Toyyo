import { describe, expect, it } from "vitest";
import { getPersona } from "../../data";
import { buildDashboard } from "../../engines";
import { rates } from "../../engines/common";
import { deriveSummary, fuelPerMonth, TYPICAL_ANNUAL_MILES } from "../alerts";
import { getDashboard as getServerDashboard } from "../../server/dashboard";
import { VEHICLES } from "../vehicles";
import type { PersonaId } from "../../types";

const dashboard = (id: PersonaId) => { const p = getPersona(id); return buildDashboard(id, { preferences: p.preferences, consent: p.consent }); };
const summary = (id: PersonaId) => deriveSummary(dashboard(id), rates.gasPricePerGallon);
const ids = (id: PersonaId) => summary(id).alerts.map((alert) => alert.id);
const num = (s: string) => Number(s.replace(/[^\d.-]/g, ""));

describe("dashboard alerts", () => {
  it("Camry (maya, lease) gets the mileage alert with the engine's excess miles and charge", () => {
    const data = dashboard("maya");
    const option = data.engines["lease-end"].options.find((o) => o.id === "lease-end:return")!;
    const miles = num(option.math.find((m) => m.label === "Excess miles")!.result);
    const charge = num(option.math.find((m) => m.label === "Excess mileage charge")!.result);
    const alert = summary("maya").alerts.find((a) => a.id === "mileage")!;
    expect(alert).toBeDefined();
    expect(alert.detail).toContain(Math.round(miles).toLocaleString("en-US"));
    expect(alert.detail).toContain(`$${Math.round(charge)}`);
    expect(alert.detail).toContain("Jan 28, 2027");
    expect(ids("maya")[0]).toBe("mileage");
  });
  it("RAV4 (garcia) gets the loan-rate alert", () => {
    expect(ids("garcia")).toContain("rate");
    expect(ids("garcia")).not.toContain("mileage");
  });
  it("fuel alert states its basis and is skipped when it is below 10% over typical", () => {
    const maya = summary("maya").alerts.find((a) => a.id === "fuel")!;
    expect(maya.detail).toContain("13,500 mi/yr");
    expect(maya.detail).toContain("48 mpg");
    const data = dashboard("maya");
    const typical = fuelPerMonth(TYPICAL_ANNUAL_MILES / 12, 48, rates.gasPricePerGallon);
    expect(fuelPerMonth(data.driving.avgMonthlyMiles, 48, rates.gasPricePerGallon)).toBeGreaterThan(typical * 1.1);
    expect(ids("garcia")).not.toContain("fuel");
  });
  it("is skipped for fuel when driving data is off", () => {
    const data = dashboard("maya");
    const off = { ...data, persona: { ...data.persona, consent: { ...data.persona.consent, driving: false } }, driving: { ...data.driving, avgMonthlyMiles: 0 } };
    const result = deriveSummary(off, rates.gasPricePerGallon);
    expect(result.alerts.some((a) => a.id === "fuel")).toBe(false);
    expect(result.costs.some((c) => c.id === "fuel")).toBe(false);
  });
  it("Supra (jordan) gets driving and payment-timing alerts", () => {
    expect(ids("jordan")).toEqual(expect.arrayContaining(["driving", "timing"]));
  });
  it("every car has at least one alert, capped, ordered, with no NaN or undefined text", () => {
    for (const vehicle of VEHICLES) {
      const result = summary(vehicle.personaId);
      expect(result.alerts.length, vehicle.id).toBeGreaterThanOrEqual(1);
      expect(result.alerts.length).toBeLessThanOrEqual(4);
      const text = JSON.stringify(result);
      if (process.env.DUMP) console.log(vehicle.id, result.alerts.map((a) => `${a.severity} ${a.title}: ${a.detail}`), result.costs, result.total);
      expect(text, vehicle.id).not.toMatch(/NaN|undefined|Infinity/);
      expect(result.total).toBeGreaterThan(0);
    }
  });
  it("costs sum to the total; maintenance has no invented number", () => {
    const ava = summary("ava");
    expect(ava.costs.find((c) => c.id === "maintenance")?.amount).toBeNull();
    expect(ava.total).toBeCloseTo(ava.costs.reduce((s, c) => s + (c.amount ?? 0), 0), 2);
    // Maya is past ToyotaCare's 25,000 mi: no maintenance line, and a coverage alert instead.
    expect(summary("maya").costs.some((c) => c.id === "maintenance")).toBe(false);
    expect(ids("maya")).toContain("coverage");
  });
});

describe("pack cases", () => {
  it("never lead with engine-only buyout/coverage/timing alerts for pack personas", () => {
    for (const id of ["ryan", "devon", "priya"] as const) {
      const result = deriveSummary(getServerDashboard(id), rates.gasPricePerGallon);
      expect(result.alerts.some((a) => a.id === "coverage" || a.id === "timing"), id).toBe(false);
      expect(JSON.stringify(result.alerts)).not.toMatch(/buy it out|buyout/i);
    }
  });
});
