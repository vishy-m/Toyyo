// Lease mileage facts for charts. Dollar figures always come from the engine; this only shapes
// odometer series for visualization (projected odometer vs the lease's odometer limit).
import type { DashboardData, LeaseContract } from "@/lib/types";

const SNAPSHOT = "2026-10-27";

export function leaseStartOdometer(data: DashboardData): number {
  const opts = data.engines["lease-end"]?.options ?? [];
  for (const o of opts) {
    const a = o.assumptions.find((x) => /starting odometer/i.test(x.label));
    if (a) {
      const n = parseInt(a.value.replace(/[^0-9]/g, " ").trim().split(/\s+/)[0] ?? "", 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

export interface LeaseFacts {
  contract: LeaseContract;
  startOdo: number;
  allowanceTotal: number;
  limitOdo: number;
  monthsElapsed: number;
  monthlyMiles: number;
  projectedOdo: number;
  overMiles: number;
  allowancePerMonth: number;
}

export function leaseFacts(data: DashboardData, monthlyMiles?: number): LeaseFacts | null {
  const c = data.persona.contract;
  if (c.kind !== "lease") return null;
  const startOdo = leaseStartOdometer(data);
  const allowanceTotal = (c.annualMileageAllowance * c.termMonths) / 12;
  const mm = monthlyMiles ?? data.driving.avgMonthlyMiles ?? Math.round(c.annualMileageAllowance / 12);
  const projectedOdo = data.persona.vehicle.odometer + mm * c.monthsRemaining;
  return {
    contract: c,
    startOdo,
    allowanceTotal,
    limitOdo: startOdo + allowanceTotal,
    monthsElapsed: c.termMonths - c.monthsRemaining,
    monthlyMiles: mm,
    projectedOdo,
    overMiles: Math.max(0, projectedOdo - startOdo - allowanceTotal),
    allowancePerMonth: Math.round(c.annualMileageAllowance / 12),
  };
}

/** Month-by-month odometer: history (linear back-cast) + projection to lease end. */
export function leaseSeries(data: DashboardData, monthlyMiles?: number) {
  const f = leaseFacts(data, monthlyMiles);
  if (!f) return [];
  const odo = data.persona.vehicle.odometer;
  const elapsed = f.monthsElapsed;
  const histRate = elapsed > 0 ? (odo - f.startOdo) / elapsed : f.monthlyMiles;
  const start = new Date(f.contract.startDate + "T12:00:00Z");
  const rows: { m: number; label: string; actual?: number; projected?: number; allowance: number }[] = [];
  for (let m = 0; m <= f.contract.termMonths; m++) {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + m);
    const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
    const allowance = Math.round(f.startOdo + (f.allowanceTotal * m) / f.contract.termMonths);
    if (m <= elapsed) rows.push({ m, label, actual: Math.round(f.startOdo + histRate * m), allowance, projected: m === elapsed ? odo : undefined });
    else rows.push({ m, label, projected: Math.round(odo + f.monthlyMiles * (m - elapsed)), allowance });
  }
  return rows;
}

export { SNAPSHOT };
