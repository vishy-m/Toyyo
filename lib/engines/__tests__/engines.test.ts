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
import { VEHICLES } from '../../cinematic/vehicles';
import { CASE_SUMMARIES } from '../../cinematic/cases';
import { getCaseFile } from '../../data';
const runtime=(id:PersonaId)=>{const p=getPersona(id);return {preferences:p.preferences,consent:p.consent};};
const dashboard=(id:PersonaId)=>buildDashboard(id,runtime(id));
const option=(id:PersonaId,type:MoveType,optionId:string)=>dashboard(id).engines[type].options.find(o=>o.id===optionId)!;
const number=(s:string)=>Number(s.replace(/[^\d.-]/g,''));

describe('persona acceptance criteria',()=>{
  for(const p of listPersonas()) {
    // Pack personas (profile.packCustomerId) are checked against the pack's golden answers instead (see the pack describe below).
    it.skipIf(!!p.profile)(`${p.id} ranks its intended move first without consulting design intent`,()=>{
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

describe('carousel case studies match their stories',()=>{
  const move=(id:PersonaId,n:number)=>dashboard(id).ranked[n].optionId;
  it('every persona contract agrees with its start date, term and months remaining',()=>{
    for(const p of listPersonas()) {
      const end=addMonths(p.contract.startDate,p.contract.termMonths);
      const left=Math.round((Date.parse(end)-Date.parse('2026-10-27'))/(365.25/12*86400000));
      expect(Math.abs(left-p.contract.monthsRemaining),p.id).toBeLessThanOrEqual(1);
    }
  });
  it('Maya and the Garcias now match the 3D assets and keep a possible lease start',()=>{
    const maya=getPersona('maya'),garcia=getPersona('garcia');
    expect([maya.vehicle.year,maya.vehicle.model,maya.vehicle.isHybrid]).toEqual([2025,'Camry Hybrid SE',true]);
    expect(Date.parse(maya.contract.startDate)).toBeGreaterThanOrEqual(Date.parse('2024-09-01'));
    expect(maya.contract.kind==='lease'&&maya.contract.annualMileageAllowance*maya.contract.termMonths/12).toBe(36000);
    expect([garcia.vehicle.year,garcia.vehicle.model]).toEqual([2021,'RAV4 Hybrid XLE']);
  });
  it('Nora keeps a used Land Cruiser on a loan; refinance first, older-vehicle service second',()=>{
    const p=getPersona('nora');
    expect([p.vehicle.year,p.vehicle.model,p.contract.kind,p.contract.monthsRemaining]).toEqual([2017,'Land Cruiser','loan',52]);
    expect(move('nora',0)).toBe('payment:refinance');
    expect(move('nora',1)).toBe('protection:service');
    expect(option('nora','protection','protection:current').summary).toMatch(/expired/);
  });
  it('Eli lives in Puerto Rico with a 2007 Hilux on a used-vehicle loan and a payoff plan',()=>{
    const p=getPersona('eli');
    expect([p.city,p.vehicle.year,p.vehicle.model,p.contract.kind,p.contract.monthsRemaining]).toEqual(['San Juan',2007,'Hilux','loan',27]);
    expect(p.insurance.carrier).toMatch(/\(simulated\)$/);
    expect(p.insurance.carrier).not.toMatch(/Lone Star/);
    expect(dashboard('eli').engines['lease-end'].options.every(o=>!o.eligible)).toBe(true);
    expect(option('eli','payment','payment:extra-principal').eligible).toBe(true);
    expect(move('eli',0)).toBe('payment:refinance');
  });
  it('Ava is in a 2025 Corolla Cross (US model year 2022+) with due-date and extra-principal options',()=>{
    const p=getPersona('ava');
    expect(p.vehicle.year).toBeGreaterThanOrEqual(2022);
    expect([p.contract.kind,p.contract.monthsRemaining]).toEqual(['loan',58]);
    expect(option('ava','payment','payment:extra-principal').eligible).toBe(true);
    expect(option('ava','payment','payment:extra-principal').savingsVsBaseline).toBeGreaterThan(0);
    expect(move('ava',0)).toBe('payment:due-date');
    expect(option('ava','payment','payment:refinance').savingsVsBaseline).toBeLessThan(0);
    expect(option('ava','protection','protection:current').summary).toMatch(/projected to end/);
  });
  it('Theo’s fast starts hold his score under 80 and coaching could lower his quote',()=>{
    const d=dashboard('theo');
    expect(d.driving.score).toBe(78);
    expect(d.driving.scoreFactors.filter(f=>f.impact<=-3).map(f=>f.factor)).toContain('Fast acceleration');
    expect(move('theo',0)).toBe('insurance:coaching');
    const current=option('theo','insurance','insurance:current'),improved=option('theo','insurance','insurance:ubi-improved');
    expect(improved.monthlyCost!).toBeLessThan(current.monthlyCost!);
    expect(getPersona('theo').contract.kind==='loan'&&(getPersona('theo').contract as {autopay:boolean}).autopay).toBe(true);
    expect(option('theo','protection','protection:tire-wheel').eligible).toBe(true);
  });
  it('car summaries quote figures that match the data',()=>{
    const copy=(id:string)=>VEHICLES.find(v=>v.id===id)!.summary;
    expect(copy('land-cruiser')).toContain(`${getPersona('nora').contract.monthsRemaining} payments left`);
    expect(copy('hilux')).toContain(`${getPersona('eli').contract.monthsRemaining} payments left`);
    const lease=(id:PersonaId)=>{const c=getPersona(id).contract;if(c.kind!=='lease') throw new Error('lease expected');return c;};
    const money=(n:number)=>`$${Math.round(n).toLocaleString('en-US')}`;
    const opt=(id:PersonaId,optionId:string)=>getCaseFile(id)!.options!.find(o=>o.optionId===optionId)!;
    // Priya: pack RETURN $3,770 and BUYOUT $16,670; $1,930 ahead.
    expect(copy('corolla-cross')).toContain(`${lease('priya').monthsRemaining} months`);
    expect(copy('corolla-cross')).toContain(money(opt('priya','RETURN').upfrontCost!));
    expect(copy('corolla-cross')).toContain(money(opt('priya','BUYOUT').upfrontCost!));
    expect(copy('corolla-cross')).toContain('49,500');
    expect(copy('corolla-cross')).toContain('$1,930');
    expect(copy('gr-yaris')).toContain(`${getPersona('theo').contract.monthsRemaining} payments left`);
    expect(copy('gr-yaris')).toContain(`score at ${dashboard('theo').driving.score}`);
    expect(copy('camry')).toContain(`${lease('ryan').monthsRemaining} months left at ${money(lease('ryan').monthlyPayment)}`);
    expect(copy('camry')).toContain(money(opt('ryan','EARLYEND').upfrontCost!));
    expect(copy('rav4')).toContain(`${lease('devon').monthsRemaining} months`);
    expect(copy('rav4')).toContain(money(opt('devon','BUYOUT').upfrontCost!));
    expect(copy('rav4')).toContain(money(opt('devon','RETURN').upfrontCost!));
    expect(copy('rav4')).toContain('$26,650');
    expect(copy('gr-supra')).toContain(`score from ${dashboard('jordan').driving.score}`);
    // The car copy stays car-centric (second person); driver names appear only in the case UI.
    for(const v of VEHICLES) expect(`${v.descriptor} ${v.headline} ${v.summary}`).not.toContain(getPersona(v.personaId).name.replace(/^The /,''));
    expect(VEHICLES.map(v=>v.year)).toEqual(VEHICLES.map(v=>getPersona(v.personaId).vehicle.year));
  });
});

// ---------- Hackathon data pack cases (ryan = C010, devon = C006, priya = C003) ----------
function csv(file:string):Record<string,string>[]{
  const text=readFileSync(resolve('data/pack/data',file),'utf8');const rows:string[][]=[];let row:string[]=[],cell='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=c;}
    else if(c==='"') q=true;else if(c===',') {row.push(cell);cell='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n') i++;row.push(cell);cell='';if(row.length>1||row[0]!=='') rows.push(row);row=[];}
    else cell+=c;}
  const [head,...body]=rows;return body.map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]??''])));
}
const PACK:[PersonaId,string][]=[['ryan','C010'],['devon','C006'],['priya','C003']];
const CAROUSEL:PersonaId[]=['ryan','devon','jordan','nora','eli','priya','theo'];
describe('hackathon pack cases match the pack',()=>{
  for(const [id,packId] of PACK) {
    const golden=csv('golden_answers.csv').find(r=>r.customer_id===packId)!;
    const acct=csv('accounts.csv').find(r=>r.customer_id===packId)!;
    const veh=csv('vehicles.csv').find(r=>r.customer_id===packId)!;
    const cust=csv('customers.csv').find(r=>r.customer_id===packId)!;
    const situation=csv('situations.csv').find(r=>r.customer_id===packId)!;
    const opts=csv('option_scenarios.csv').filter(r=>r.customer_id===packId);
    it(`${id}: case best move equals the golden answer verbatim`,()=>{
      const c=getCaseFile(id)!;
      expect(c.source).toBe('pack');expect(c.packCustomerId).toBe(packId);
      expect(c.bestMove).toEqual({title:golden.best_next_move,nextStepType:golden.next_step_type,message:golden.plain_language_message,whyNotOthers:golden.why_not_the_others,guardrails:golden.guardrail_notes,optionId:golden.offer_id});
      expect(c.quote).toBe(situation.customer_says);expect(c.context).toBe(situation.context_summary);
      expect(c.driver).toEqual({firstName:cust.first_name,age:Number(cust.age),city:cust.city,state:cust.state,occupation:cust.occupation});
    });
    it(`${id}: persona vehicle and lease contract match accounts.csv and vehicles.csv`,()=>{
      const p=getPersona(id),c=p.contract;
      if(c.kind!=='lease') throw new Error('lease expected');
      expect(c.startDate).toBe(acct.contract_start);expect(c.termMonths).toBe(Number(acct.term_months));expect(c.monthsRemaining).toBe(Number(acct.months_remaining));
      expect(c.monthlyPayment).toBe(Number(acct.monthly_payment));expect(c.residualValue).toBe(Number(acct.residual_value));
      expect(c.annualMileageAllowance*c.termMonths/12).toBe(Number(acct.mileage_allowance_total));
      expect([c.overageRatePerMile,c.dispositionFee,c.purchaseOptionFee]).toEqual([.25,395,350]);
      expect([p.vehicle.year,p.vehicle.odometer]).toEqual([Number(veh.model_year),Number(veh.odometer_now)]);
      expect(p.vehicle.model).toContain(veh.trim);expect(p.age).toBe(Number(cust.age));expect(p.profile?.packCustomerId).toBe(packId);
      expect(p.profile?.vulnerable).toBe(cust.vulnerable_flag==='Y');expect(p.profile?.marketingConsent).toBe(cust.marketing_consent==='Y');
      expect(getCashflow(id).latePaymentsLast12).toBe(Number(acct.missed_payments_12m));
      expect(p.insurance.carrier).toMatch(/\(simulated\)$/);
    });
    it(`${id}: the pack option rows are preserved with their numbers`,()=>{
      const c=getCaseFile(id)!;
      expect(c.options!.map(o=>o.optionId)).toEqual(opts.map(o=>o.option_id));
      expect(c.options!.map(o=>o.upfrontCost)).toEqual(opts.map(o=>o.upfront_cost===''?null:Number(o.upfront_cost)));
      expect(c.options!.map(o=>o.plainLanguageSummary)).toEqual(opts.map(o=>o.plain_language_summary));
      expect(c.options!.map(o=>o.newMonthlyPayment)).toEqual(opts.map(o=>o.new_monthly_payment===''?null:Number(o.new_monthly_payment)));
      expect(c.options!.map(o=>o.totalCostVsKeepAsIs)).toEqual(opts.map(o=>o.total_cost_vs_keep_as_is===''?null:Number(o.total_cost_vs_keep_as_is)));
      expect(c.options!.some(o=>o.optionId===golden.offer_id)).toBe(true);
    });
    it(`${id}: engine return cost equals the pack RETURN option and mileage agrees with annual_miles_est`,()=>{
      const ret=option(id,'lease-end','lease-end:return');
      expect(ret.totalCost).toBe(Number(opts.find(o=>o.option_id==='RETURN')!.upfront_cost));
      const monthly=dashboard(id).driving.avgMonthlyMiles;
      expect(monthly).toBeCloseTo(Number(veh.annual_miles_est)/12,1);
    });
    it(`${id}: honours the pack's responsible-AI flags and has no NaN`,()=>{
      expect(getPersona(id).profile?.vulnerable).toBe(false);
      expect(JSON.stringify(dashboard(id))).not.toMatch(/NaN|Infinity|null,null/);
    });
  }
  it('Priya engine return is $3,770 from 13,500 excess miles; buyout differs from the pack only by sales tax',()=>{
    const ret=option('priya','lease-end','lease-end:return');
    expect(ret.math.find(m=>m.label==='Excess miles')?.result).toBe('13500 mi');
    expect(ret.totalCost).toBe(3770);
    const buyout=option('priya','lease-end','lease-end:buyout');
    const packBuyout=Number(csv('option_scenarios.csv').find(r=>r.customer_id==='C003'&&r.option_id==='BUYOUT')!.upfront_cost);
    expect(buyout.totalCost!-packBuyout).toBeCloseTo(Math.round(packBuyout*.0625*100)/100,0);
  });
  it('Ryan and Devon owe no excess mileage',()=>{
    for(const id of ['ryan','devon'] as const) expect(option(id,'lease-end','lease-end:return').math.find(m=>m.label==='Excess mileage charge')?.result).toBe('$0.00');
  });
  it('pack persona showcase routes are pinned genuine OSRM routes',()=>{
    const cache=JSON.parse(readFileSync(resolve('data/reference/routes.json'),'utf8')) as Record<string,{source:string}>;
    for(const key of ['richardson-plano-legacy','richardson-dallas-uptown','richardson-austin','dallas-design-district','dallas-bishop-arts','dallas-austin','plano-downtown-dallas','plano-frisco-square','plano-austin']) expect(cache[key]?.source,key).toBe('osrm');
  });
});
describe('carousel case files',()=>{
  it('exist and are well formed for all seven carousel personas',()=>{
    expect(VEHICLES.map(v=>v.personaId).sort()).toEqual([...CAROUSEL].sort());
    for(const id of CAROUSEL) {
      const c=getCaseFile(id)!;
      expect(c,id).toBeDefined();expect(c.personaId).toBe(id);
      expect(['pack','toyyo']).toContain(c.source);
      expect(['Self-service','Follow-up','Offer']).toContain(c.bestMove.nextStepType);
      for(const t of [c.driver.firstName,c.driver.city,c.driver.state,c.driver.occupation,c.quote,c.context,c.bestMove.title,c.bestMove.message,c.bestMove.whyNotOthers,c.bestMove.guardrails]) expect(t.length).toBeGreaterThan(0);
      expect(c.notes.length).toBeGreaterThan(0);
      expect(c.driver.age).toBe(getPersona(id).age);expect(c.driver.firstName).toBe(getPersona(id).name);
      expect(c.source==='pack'?c.options!.length>0:c.options===undefined).toBe(true);
      expect(JSON.stringify(c)).not.toMatch(/NaN|Infinity|undefined/);
      expect(dashboard(id).caseFile).toBeUndefined(); // attached by the server layer, not the pure engines
      const s=CASE_SUMMARIES[id]!;
      expect([s.firstName,s.age,s.city,s.quote,s.context,s.bestMoveTitle,s.nextStepType,s.source]).toEqual([c.driver.firstName,c.driver.age,c.driver.city,c.quote,c.context,c.bestMove.title,c.bestMove.nextStepType,c.source]);
    }
  });
  it('Toyyo cases agree with the engines and the pack responsible-AI rules',()=>{
    for(const id of ['jordan','nora','eli','theo'] as const) {
      const c=getCaseFile(id)!;
      expect(dashboard(id).ranked.slice(0,2).map(r=>r.optionId)).toContain(c.bestMove.optionId);
    }
    expect(getCaseFile('nora')!.bestMove.optionId).toBe(dashboard('nora').ranked[0].optionId);
    expect(getCaseFile('eli')!.bestMove.optionId).toBe(dashboard('eli').ranked[0].optionId);
    expect(getCaseFile('theo')!.bestMove.optionId).toBe(dashboard('theo').ranked[0].optionId);
    // Jordan has 2 late payments and a building tier: rule 6 means a person, no upsell.
    expect(getCashflow('jordan').latePaymentsLast12).toBeGreaterThanOrEqual(2);
    expect(getCaseFile('jordan')!.bestMove.nextStepType).toBe('Follow-up');
    expect(getCaseFile('jordan')!.bestMove.guardrails).toMatch(/rule 6/);
  });
});
