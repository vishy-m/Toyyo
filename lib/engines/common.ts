import type { MoveOption, MoveType } from '../types';
import rates from '../../data/reference/rates.json';
export { rates };
export const SNAPSHOT_DATE = rates.asOf;
export const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const dollars = (n: number) => `$${round(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function bounded(value: number | undefined, fallback: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value!)) : fallback;
}
export function addMonths(iso: string, months: number): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth()+1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}
export function monthsBetween(a: string, b: string) { return (Date.parse(b)-Date.parse(a))/(365.25/12*86400000); }
export function payment(principal: number, apr: number, months: number) {
  if(principal<=0||months<=0) return 0;
  const rate=apr/1200;
  return rate===0 ? principal/months : principal*rate/(1-(1+rate)**-months);
}
export function option(moveType: MoveType, id: string, title: string, details: Partial<MoveOption>): MoveOption {
  return { id: `${moveType}:${id}`, moveType, title, summary: title,
    tradeoffs:['Estimates are simulated; confirm terms with a specialist before acting.'],
    assumptions:[{label:'Scenario date',value:SNAPSHOT_DATE},{label:'Pricing',value:'Synthetic demonstration estimates, not an offer.'}],
    math:[{label:'Scenario',formula:'Fixed synthetic snapshot',result:SNAPSHOT_DATE}],
    dataUsed:[{source:'contract',detail:'Synthetic vehicle and account contract'}],
    confidence:'medium',highStakes:false,eligible:true,...details };
}
