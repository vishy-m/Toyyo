import type { Persona, Trip, DrivingSummary, TripCategory } from '../types';
import { round, SNAPSHOT_DATE } from './common';
import { scorePenalties } from './score';
export function computeDrivingSummary(persona: Persona, trips: Trip[]): DrivingSummary {
  const totalMiles=trips.reduce((sum,t)=>sum+t.miles,0);
  const categoryMiles: Record<TripCategory,number>={commute:0,errand:0,childcare:0,'road-trip':0,trailhead:0,other:0};
  const destinations=new Map<string,{label:string;trips:number;lngLat:[number,number]}>();
  const penalties={braking:0,acceleration:0,cornering:0,speeding:0,night:0};
  let nightMiles=0;
  for(const trip of trips) {
    categoryMiles[trip.category]+=trip.miles;
    nightMiles+=trip.miles*trip.nightPct;
    const factors=scorePenalties(trip);
    for(const key of Object.keys(penalties) as (keyof typeof penalties)[]) penalties[key]+=factors[key]*trip.miles;
    const last=trip.path.at(-1);
    const existing=destinations.get(trip.destinationLabel);
    destinations.set(trip.destinationLabel,{label:trip.destinationLabel,trips:(existing?.trips??0)+1,lngLat:last?[last[0],last[1]]:[0,0]});
  }
  for(const category of Object.keys(categoryMiles) as TripCategory[]) categoryMiles[category]=round(categoryMiles[category]);
  const avgMonthlyMiles=round(totalMiles/3);
  // Six 30-day buckets ending at the fixed snapshot. The older three are
  // extrapolated at the observed 90-day average; disclosure appears in factors.
  const monthlyMiles=Array.from({length:6},(_,i)=>{
    const end=Date.parse(`${SNAPSHOT_DATE}T00:00:00Z`)-(5-i)*30*86400000;
    const observed=trips.filter(t=>Date.parse(t.start)>=end-30*86400000&&Date.parse(t.start)<end).reduce((n,t)=>n+t.miles,0);
    return {month:new Date(end-86400000).toISOString().slice(0,7),miles:i<3?avgMonthlyMiles:round(observed)};
  });
  const tags:string[]=[];
  if(trips.filter(t=>t.miles>150).length>=2) tags.push('road-tripper');
  if(totalMiles&&nightMiles/totalMiles>.2) tags.push('night-driver');
  if(categoryMiles.trailhead>0) tags.push('off-road');
  if(categoryMiles.childcare>0) tags.push('family');
  let smoothStreak=0;
  for(const t of [...trips].sort((a,b)=>b.start.localeCompare(a.start))) { if(t.score<90) break; smoothStreak++; }
  const labels={braking:'Harsh braking',acceleration:'Fast acceleration',cornering:'Harsh cornering',speeding:'Speeding',night:'Night driving'};
  return {windowDays:90,totalMiles:round(totalMiles),avgMonthlyMiles,monthlyMiles,categoryMiles,
    topDestinations:[...destinations.values()].sort((a,b)=>b.trips-a.trips||a.label.localeCompare(b.label)).slice(0,5),
    score:totalMiles?Math.round(trips.reduce((n,t)=>n+t.score*t.miles,0)/totalMiles):0,
    scoreFactors:(Object.keys(penalties) as (keyof typeof penalties)[]).map(key=>({factor:labels[key],impact:totalMiles?-round(penalties[key]/totalMiles):0,detail:totalMiles?`${labels[key]} contributes ${round(penalties[key]/totalMiles)} points of mileage-weighted deductions over 90 days.`:'Driving data unavailable; no score inferred.'})).concat([{factor:'Mileage history',impact:0,detail:trips.length?'Older three monthly buckets are extrapolated from the latest 90-day pattern.':'Driving consent is off or no trips are available.'}]),
    smoothStreak,lifestyleTags:tags};
}
