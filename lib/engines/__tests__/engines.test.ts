import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { listPersonas, getPersona, getTrips, getTrip, getCashflow } from '../../data';
import { buildDashboard, runWhatIf, computeTfsMetrics } from '../index';
import { computeTripScore } from '../score';
import { amortize, computePaymentOptions } from '../payment';
import { computeProtectionOptions } from '../protection';
import { computeDrivingSummary } from '../driving';
import { computeLeaseEndOptions } from '../lease-end';
import { payment, addMonths } from '../common';
import type { PersonaId, MoveType, HandoffPacket } from '../../types';
const runtime=(id:PersonaId)=>{const p=getPersona(id);return {preferences:p.preferences,consent:p.consent};};
const dashboard=(id:PersonaId)=>buildDashboard(id,runtime(id));
const option=(id:PersonaId,type:MoveType,optionId:string)=>dashboard(id).engines[type].options.find(o=>o.id===optionId)!;
const number=(s:string)=>Number(s.replace(/[^\d.-]/g,''));

describe('persona acceptance criteria',()=>{
  for(const p of listPersonas()) {
    it(`${p.id} ranks its intended move first without consulting design intent`,()=>{
      const d=dashboard(p.id);
      expect(d.ranked[0].moveType).toBe(p.intendedBestMove);
      expect(d.ranked[0].score).toBeGreaterThan(d.ranked[1].score);
      expect(d.ranked.every(r=>d.engines[r.moveType].options.some(o=>o.id===r.optionId&&o.eligible))).toBe(true);
    });
    it(`${p.id} is deterministic and never exposes replay geometry in the list`,()=>{
      expect(dashboard(p.id)).toEqual(dashboard(p.id));
      expect(dashboard(p.id).trips.every(t=>!('path' in t)&&!('events' in t))).toBe(true);
    });
  }
  it('has the intended second choices',()=>{
    expect(dashboard('garcia').ranked[1].optionId).toBe('protection:service');
    expect(dashboard('jordan').ranked[1].optionId).toBe('payment:due-date');
    expect(dashboard('raj').ranked[1].optionId).toBe('protection:tire-wheel');
    expect(dashboard('raj').ranked[0].optionId).toBe('lease-end:upgrade');
    expect(option('raj','lease-end','lease-end:upgrade').upgradeModel?.name).toContain('4Runner');
  });
  it('Maya buyout has positive equity and $1,000–1,300 asset-adjusted advantage',()=>{
    const buyout=option('maya','lease-end','lease-end:buyout');
    expect(buyout.savingsVsBaseline).toBeGreaterThanOrEqual(1000);
    expect(buyout.savingsVsBaseline).toBeLessThanOrEqual(1300);
    expect(buyout.equity).toBeGreaterThan(0);
    expect(buyout.totalCost).toBe(20931.25);
    expect(buyout.equity).toBe(48.75);
    expect(buyout.savingsVsBaseline).toBe(1288.47);
    expect(buyout.deadline).toBe('2027-01-28');
    const over=buyout.math.find(m=>m.label==='Excess miles')!;
    expect(number(over.result)).toBeGreaterThan(3500);
    expect(number(over.result)).toBeLessThan(4500);
    expect(number(over.result)).toBe(3558.88);
    expect(buyout.assumptions.find(a=>a.label==='Lease starting odometer')?.value).toBe('7500 mi; synthetic used/demo lease when nonzero');
    expect(option('maya','lease-end','lease-end:return').totalCost).toBe(1239.72);
  });
  it('Maya 900 miles/month and zero projection horizon lower mileage charges',()=>{
    const baseline=option('maya','lease-end','lease-end:return');
    const less=runWhatIf('maya','lease-end',{monthlyMiles:900},runtime('maya')).options[0];
    const now=runWhatIf('maya','lease-end',{monthsAhead:0},runtime('maya')).options[0];
    expect(less.totalCost).toBeLessThan(baseline.totalCost!);
    expect(less.totalCost).toBe(675);
    expect(less.math.find(m=>m.label==='Excess miles')?.result).toBe('1300 mi');
    expect(now.totalCost).toBe(350);
  });
  it('every lease comparison and mileage what-if uses the supplied contract rate',()=>{
    for(const id of ['maya','raj'] as const) {
      const p=getPersona(id);
      if(p.contract.kind!=='lease') throw new Error('Expected lease fixture');
      expect(p.contract.overageRatePerMile).toBe(.25);
      const driving=computeDrivingSummary(p,getTrips(id));
      // A different contract rate catches hardcoded persona or reference-table pricing.
      for(const rate of [.25,.37]) {
        p.contract.overageRatePerMile=rate;
        const result=computeLeaseEndOptions(p,driving,{monthlyMiles:9000});
        for(const o of result.options) {
          const excess=number(o.math.find(m=>m.label==='Excess miles')!.result);
          const charge=o.math.find(m=>m.label==='Excess mileage charge')!;
          expect(excess).toBeGreaterThan(0);
          expect(number(charge.result)).toBeCloseTo(excess*rate,2);
          expect(charge.formula).toBe(`${excess} × $${rate.toFixed(2)}`);
        }
        const returned=result.options.find(o=>o.id==='lease-end:return')!;
        const buyout=result.options.find(o=>o.id==='lease-end:buyout')!;
        const charge=number(returned.math.find(m=>m.label==='Excess mileage charge')!.result);
        expect(returned.totalCost).toBeCloseTo(charge+p.contract.dispositionFee,2);
        expect(buyout.savingsVsBaseline).toBeCloseTo(returned.totalCost!+buyout.equity!,2);
      }
    }
  });
  it('Maya has a realistic score, recent smooth streak and three material driving factors',()=>{
    const d=dashboard('maya');
    expect(d.driving.score).toBeGreaterThanOrEqual(80);
    expect(d.driving.score).toBeLessThanOrEqual(84);
    expect(d.driving.smoothStreak).toBe(8);
    expect(d.driving.scoreFactors.filter(f=>f.impact<=-1).map(f=>f.factor)).toEqual(['Harsh braking','Fast acceleration','Speeding']);
    expect(d.ranked[0].optionId).toBe('lease-end:buyout');
    expect(d.ranked[1].optionId).toBe('protection:service');
    expect(option('maya','insurance','insurance:ubi-current').monthlyCost).toBe(162.80);
    expect(option('maya','insurance','insurance:ubi-current').savingsVsBaseline).toBe(-81.60);
  });
  it('Raj is under allowance with exactly zero excess mileage charge',()=>{
    const result=option('raj','lease-end','lease-end:return');
    expect(result.math.find(m=>m.label==='Excess mileage charge')?.result).toBe('$0.00');
    expect(result.totalCost).toBe(350);
  });
  it('loan personas cannot select lease-end actions',()=>{
    for(const id of ['garcia','jordan'] as const) expect(dashboard(id).engines['lease-end'].options.every(o=>!o.eligible&&o.ineligibleReason)).toBe(true);
  });
  it('Jordan at 68 pays more now and less at +15; coaching is first',()=>{
    const r=runtime('jordan');r.consent.shareWithInsurers=true;
    const insurance=runWhatIf('jordan','insurance',{scoreImprovement:15},r);
    expect(dashboard('jordan').driving.score).toBe(68);
    const current=insurance.options.find(o=>o.id==='insurance:ubi-current')!;
    const improved=insurance.options.find(o=>o.id==='insurance:ubi-improved')!;
    expect(current.monthlyCost).toBe(277.76);
    expect(current.savingsVsBaseline).toBe(-357.12);
    expect(improved.monthlyCost).toBe(218.24);
    expect(improved.savingsVsBaseline).toBe(357.12);
    expect(buildDashboard('jordan',r).ranked[0].optionId).toBe('insurance:coaching');
  });
  it('Garcias refinance keeps the term and includes fees',()=>{
    const refinance=option('garcia','payment','payment:refinance');
    expect(refinance.monthlyCost).toBeCloseTo(808.31,2);
    expect(refinance.savingsVsBaseline).toBeCloseTo(844.65,2);
    expect(refinance.highStakes).toBe(true);
    const service=option('garcia','protection','protection:service');
    expect(service.deadline).toBe('2026-12-15');
  });
});

describe('consent, preferences and numeric boundaries',()=>{
  it('separate insurer consent withholds quotes but permits private coaching',()=>{
    const result=dashboard('jordan').engines.insurance;
    expect(result.limitedBy).toContain('shareWithInsurers');
    for(const id of ['insurance:ubi-current','insurance:ubi-improved']) {
      const o=result.options.find(o=>o.id===id)!;
      expect(o.eligible).toBe(false);expect(o.monthlyCost).toBeUndefined();expect(o.savingsVsBaseline).toBeUndefined();
    }
    expect(result.options.find(o=>o.id==='insurance:coaching')?.eligible).toBe(true);
  });
  it('driving consent removes trips, insights, inferred tags and UBI eligibility',()=>{
    const r=runtime('raj');r.consent.driving=false;
    const d=buildDashboard('raj',r);
    expect(d.trips).toEqual([]);expect(d.tripInsights).toEqual([]);expect(d.driving.totalMiles).toBe(0);expect(d.driving.lifestyleTags).toEqual([]);
    for(const type of ['lease-end','insurance','protection'] as const) expect(d.engines[type].limitedBy).toContain('driving');
    expect(d.engines.insurance.options.filter(o=>o.id!=='insurance:current').every(o=>!o.eligible)).toBe(true);
  });
  it('banking consent removes cashflow and disables due-date personalization',()=>{
    const r=runtime('jordan');r.consent.banking=false;
    const d=buildDashboard('jordan',r);
    expect(d.cashflow).toBeNull();expect(d.engines.payment.limitedBy).toContain('banking');
    const due=d.engines.payment.options.find(o=>o.id==='payment:due-date')!;
    expect(due.eligible).toBe(false);expect(due.dataUsed.some(s=>s.source==='banking')).toBe(false);
  });
  it('payment-history consent blocks refinance and history evidence',()=>{
    const r=runtime('garcia');r.consent.paymentHistory=false;
    const result=buildDashboard('garcia',r).engines.payment;
    expect(result.limitedBy).toContain('paymentHistory');
    expect(result.options.find(o=>o.id==='payment:refinance')?.eligible).toBe(false);
    expect(result.options.every(o=>o.dataUsed.every(s=>s.source!=='paymentHistory'))).toBe(true);
  });
  it('suppression, dismissal, acceptance and weights affect ranking',()=>{
    const r=runtime('maya');r.preferences.suppressedMoveTypes=['lease-end'];
    expect(buildDashboard('maya',r).ranked.some(m=>m.moveType==='lease-end')).toBe(false);
    const j=runtime('jordan');j.preferences.dismissed=[{optionId:'insurance:coaching',reason:'not-now',at:'2026-10-27'}];
    expect(buildDashboard('jordan',j).ranked[0].optionId).toBe('payment:due-date');
    const raj=runtime('raj');raj.preferences.priorityWeights={monthlyPayment:1,totalCost:0,flexibility:0,lifestyleFit:0};
    expect(buildDashboard('raj',raj).ranked[0].optionId).not.toBe('lease-end:upgrade');
    const g=runtime('garcia');g.preferences.accepted=[{optionId:'payment:refinance',at:'2026-10-27'}];
    expect(buildDashboard('garcia',g).ranked.some(r=>r.optionId==='payment:refinance')).toBe(false);
  });
  it('numeric overrides are bounded and finite, including NaN',()=>{
    for(const overrides of [{monthlyMiles:NaN,monthsAhead:Infinity},{monthlyMiles:-900,monthsAhead:-1},{monthlyMiles:1e9,monthsAhead:1e9}]) {
      const result=runWhatIf('maya','lease-end',overrides,runtime('maya'));
      expect(result.options.every(o=>o.totalCost===undefined||Number.isFinite(o.totalCost))).toBe(true);
    }
    const due=runWhatIf('jordan','payment',{paymentDueDay:99},runtime('jordan')).options.find(o=>o.id==='payment:due-date')!;
    expect(due.math[0].result).toBe('Day 28');
  });
  it('extra principal reduces interest, handles zero extra and the final payment',()=>{
    expect(payment(1200,0,12)).toBe(100);
    expect(amortize(1200,0,100)).toEqual({months:12,interest:0,total:1200});
    expect(amortize(1200,0,500)).toEqual({months:3,interest:0,total:1200});
    const normal=runWhatIf('garcia','payment',{extraPrincipal:0},runtime('garcia')).options.find(o=>o.id==='payment:extra-principal')!;
    const extra=runWhatIf('garcia','payment',{extraPrincipal:100},runtime('garcia')).options.find(o=>o.id==='payment:extra-principal')!;
    expect(normal.savingsVsBaseline).toBe(0);expect(extra.savingsVsBaseline).toBeGreaterThan(0);
  });
  it('hardship allows only current payment or specialist review',()=>{
    const p=getPersona('jordan'),cashflow=getCashflow('jordan');cashflow.recurringShortfall=true;
    const result=computePaymentOptions(p,cashflow);
    expect(result.options.filter(o=>o.eligible).map(o=>o.id)).toEqual(['payment:current','payment:hardship']);
    expect(result.options.find(o=>o.id==='payment:hardship')?.highStakes).toBe(true);
  });
  it('coverage expires at mileage before the date when the mileage limit comes first',()=>{
    const p=getPersona('garcia');p.vehicle.odometer=24900;
    const summary=computeDrivingSummary(p,getTrips('garcia'));
    const result=computeProtectionOptions(p,summary);
    expect(result.options.find(o=>o.id==='protection:service')!.deadline! < '2026-12-15').toBe(true);
    expect(addMonths('2026-01-31',1)).toBe('2026-02-28');
  });
  it('all options have explanation evidence, math, assumptions and tradeoffs',()=>{
    for(const p of listPersonas()) for(const e of Object.values(dashboard(p.id).engines)) for(const o of e.options) {
      expect(o.summary.length).toBeGreaterThan(0);
      expect(o.assumptions.length).toBeGreaterThan(0);expect(o.math.length).toBeGreaterThan(0);expect(o.dataUsed.length).toBeGreaterThan(0);expect(o.tradeoffs.length).toBeGreaterThan(0);
      if(!o.eligible) expect(o.ineligibleReason).toBeTruthy();
      expect(JSON.stringify(o)).not.toMatch(/NaN|Infinity/);
    }
  });
});

describe('static data and route integrity',()=>{
  for(const p of listPersonas()) it(`${p.id}: bounded paths, pinned real showcase routes and matching scores/events`,()=>{
    const trips=getTrips(p.id);
    expect(trips.length).toBeGreaterThan(50);
    expect(trips.filter(t=>t.showcase)).toHaveLength(5);
    expect(statSync(resolve(`data/trips/${p.id}.trips.json`)).size).toBeLessThan(2_000_000);
    const unique=new Set(trips.map(t=>t.id));expect(unique.size).toBe(trips.length);
    for(const trip of trips) {
      expect(trip.score).toBe(computeTripScore(trip));
      expect(trip.path.length).toBeLessThanOrEqual(trip.showcase?1500:50);
      expect(trip.path[0][2]).toBe(0);
      expect(trip.path.at(-1)![2]).toBeGreaterThan(0);
      expect(Date.parse(trip.end)-Date.parse(trip.start)).toBeCloseTo(trip.path.at(-1)![2]*1000,0);
      expect(trip.path.every((point,i)=>i===0||point[2]>trip.path[i-1][2])).toBe(true);
      for(const event of trip.events) expect(trip.path.some(p=>p[0]===event.lngLat[0]&&p[1]===event.lngLat[1]&&p[2]===event.t)).toBe(true);
      if(trip.showcase) expect(trip.path.length).toBeGreaterThan(25);
    }
  });
  it('route cache records genuine OSRM sources for every showcase route',()=>{
    const cache=JSON.parse(readFileSync(resolve('data/reference/routes.json'),'utf8')) as Record<string,{source:string;url:string}>;
    expect(Object.values(cache).length).toBeGreaterThanOrEqual(10);
    expect(Object.values(cache).every(r=>r.source==='osrm'&&r.url.startsWith('https://router.project-osrm.org/'))).toBe(true);
  });
  it('has the deliberate night braking replay and smooth Big Bend replay',()=>{
    const worst=getTrips('jordan').filter(t=>t.showcase).sort((a,b)=>a.score-b.score)[0];
    expect(worst.hardBrakes).toBe(3);expect(worst.nightPct).toBe(1);
    expect(worst.events.filter(e=>e.type==='hard-brake')).toHaveLength(3);
    const bigBend=getTrips('raj').find(t=>t.showcase&&t.destinationLabel==='Big Bend NP')!;
    expect(bigBend.miles).toBeGreaterThan(400);expect(bigBend.score).toBe(100);expect(bigBend.events).toEqual([]);
  });
  it('only Raj Big Bend is spotless; other persona histories have bounded smooth streaks',()=>{
    expect(listPersonas().flatMap(p=>getTrips(p.id)).filter(t=>t.score===100).map(t=>t.id)).toEqual(['raj-018']);
    for(const id of ['garcia','raj'] as const) {
      const d=dashboard(id).driving;
      expect(d.score).toBeGreaterThanOrEqual(90);
      expect(d.score).toBeLessThan(100);
      expect(d.smoothStreak).toBeGreaterThan(0);
      expect(d.smoothStreak).toBeLessThanOrEqual(13);
    }
  });
  it('Maya opening replay shows I-35 braking and Dallas runs show speeding',()=>{
    const opening=getTrip('maya-001')!;
    expect(opening.showcase).toBe(true);
    expect(opening.category).toBe('commute');
    expect(opening.score).toBe(82);
    expect(opening.events.map(e=>e.type)).toEqual(['hard-brake','hard-brake','speeding-start','speeding-end']);
    const roadTrips=getTrips('maya').filter(t=>t.category==='road-trip');
    expect(roadTrips).toHaveLength(4);
    expect(roadTrips.every(t=>t.speedingPct>=.25&&t.events.some(e=>e.type==='speeding-start'))).toBe(true);
  });
  it('loaders are defensive copies and unknown trips are undefined',()=>{
    const p=getPersona('maya');p.preferences.suppressedMoveTypes.push('insurance');
    expect(getPersona('maya').preferences.suppressedMoveTypes).toEqual([]);
    const trips=getTrips('maya');const saved=trips[0].miles;trips[0].miles=0;
    expect(getTrip(trips[0].id)?.miles).toBe(saved);expect(getTrip('missing')).toBeUndefined();
    expect(()=>getPersona('invalid' as PersonaId)).toThrow('Unknown persona');
  });
  it('monthly history, destination counts and category totals reconcile',()=>{
    const d=dashboard('maya').driving;
    expect(d.monthlyMiles).toHaveLength(6);
    expect(d.monthlyMiles.slice(0,3).every(m=>m.miles===d.avgMonthlyMiles)).toBe(true);
    expect(Object.values(d.categoryMiles).reduce((a,b)=>a+b,0)).toBeCloseTo(d.totalMiles,2);
  });
  it('TFS metrics filter packets, count only self-service call savings and disclose assumptions',()=>{
    const packet=(id:PersonaId,mode:HandoffPacket['mode']):HandoffPacket=>({id:'packet',personaId:id,optionId:'lease-end:buyout',moveType:'lease-end',mode,customerSummary:'Synthetic',numbers:[],consentedData:[],statedPreferences:[],createdAt:'2026-10-27'});
    const metrics=computeTfsMetrics('maya',true,[packet('maya','self-service'),packet('maya','specialist-callback'),packet('raj','self-service')]);
    expect(metrics.callsAvoided).toBe(1.5);expect(metrics.openPackets).toBe(2);expect(metrics.retentionLikelihood).toBe(.88);expect(metrics.assumptions.length).toBeGreaterThan(0);
  });
});
