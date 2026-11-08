/** Reproducible fixtures: npx tsx scripts/data/gen-trips.ts.
 * Route responses are pinned in data/reference/routes.json. Delete that cache to
 * refresh OSRM geometry; otherwise regeneration is byte-for-byte and offline.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PersonaId, Trip, TripCategory, TripEventType } from '../../lib/types';
import { computeTripScore, scorePenalties } from '../../lib/engines/score';

type Point = [number, number];
type Route = { coordinates: Point[]; miles: number; source: 'osrm' | 'fallback'; url: string };
type Pattern = { key: string; from: Point; to: Point; miles: number; highway: number; category: TripCategory; label: string };
const root = resolve(import.meta.dirname, '../..');
const cachePath = resolve(root, 'data/reference/routes.json');
const austin: Point = [-97.7428, 30.2675]; // Congress & 6th, public intersection
const sa: Point = [-98.4861, 29.4260]; // Alamo Plaza
const houston: Point = [-95.3698, 29.7604]; // downtown public intersection
const patterns: Record<string, Pattern> = {
  commute: { key: 'austin-north-round-rock', from: austin, to: [-97.6937,30.5683], miles: 28, highway: .82, category: 'commute', label: 'Round Rock' },
  dallas: { key: 'austin-dallas', from: austin, to: [-96.8089,32.7767], miles: 196, highway: .94, category: 'road-trip', label: 'Dallas' },
  daycare: { key: 'sa-brackenridge', from: sa, to: [-98.4737,29.4619], miles: 5.2, highway: .1, category: 'childcare', label: 'San Antonio childcare district' },
  errands: { key: 'sa-market', from: sa, to: [-98.4993,29.4259], miles: 3.1, highway: 0, category: 'errand', label: 'San Antonio market district' },
  garciaBigBend: { key: 'sa-big-bend', from: sa, to: [-103.2433,29.3287], miles: 430, highway: .94, category: 'road-trip', label: 'Big Bend NP' },
  urban: { key: 'houston-montrose', from: houston, to: [-95.3905,29.7426], miles: 5.4, highway: .08, category: 'commute', label: 'Houston Montrose' },
  houstonPark: { key: 'houston-memorial', from: houston, to: [-95.4334,29.7662], miles: 7.8, highway: .25, category: 'errand', label: 'Houston Memorial Park' },
  rock: { key: 'austin-enchanted-rock', from: austin, to: [-98.8198,30.4960], miles: 96, highway: .76, category: 'trailhead', label: 'Enchanted Rock' },
  falls: { key: 'austin-pedernales', from: austin, to: [-98.2589,30.3089], miles: 47, highway: .55, category: 'trailhead', label: 'Pedernales Falls' },
  rajBigBend: { key: 'austin-big-bend', from: austin, to: [-103.2433,29.3287], miles: 470, highway: .96, category: 'road-trip', label: 'Big Bend NP' },
  austinErrand: { key: 'austin-zilker', from: austin, to: [-97.7729,30.2669], miles: 4.2, highway: .05, category: 'errand', label: 'Austin Zilker Park' },
};
function mulberry32(seed: number) { return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function simplify(points: Point[], max: number): Point[] {
  if (points.length <= max) return points;
  return Array.from({length: max}, (_,i) => points[Math.round(i*(points.length-1)/(max-1))]);
}
function fallback(p: Pattern): Point[] {
  return Array.from({length: 24}, (_, i) => {
    const t=i/23, bend=Math.sin(t*Math.PI)*.002;
    return [p.from[0]+(p.to[0]-p.from[0])*t+bend,p.from[1]+(p.to[1]-p.from[1])*t-bend];
  });
}
function distance(a: Point, b: Point) {
  const radians = Math.PI/180, dlat=(b[1]-a[1])*radians, dlng=(b[0]-a[0])*radians;
  const h=Math.sin(dlat/2)**2+Math.cos(a[1]*radians)*Math.cos(b[1]*radians)*Math.sin(dlng/2)**2;
  return 3958.7613 * 2*Math.asin(Math.sqrt(Math.min(1,h)));
}
async function main() {
  let cache: Record<string,Route> = {};
  try { cache=JSON.parse(await readFile(cachePath,'utf8')); } catch { /* first run */ }
  async function route(p: Pattern): Promise<Route> {
    if (cache[p.key]) return cache[p.key];
    const url=`https://router.project-osrm.org/route/v1/driving/${p.from.join(',')};${p.to.join(',')}?overview=full&geometries=geojson`;
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload=await response.json() as {code:string;routes:{distance:number;geometry:{coordinates:Point[]}}[]};
      const r=payload.routes?.[0];
      if (payload.code!=='Ok'||!r||r.geometry.coordinates.length<2) throw new Error('No usable route');
      cache[p.key]={coordinates:simplify(r.geometry.coordinates,1200),miles:r.distance/1609.344,source:'osrm',url};
    } catch (error) {
      console.warn(`OSRM fallback for ${p.key}: ${String(error)}`);
      cache[p.key]={coordinates:fallback(p),miles:p.miles,source:'fallback',url};
    }
    return cache[p.key];
  }
  for (const [personIndex,id] of (['maya','garcia','jordan','raj'] as PersonaId[]).entries()) {
    const random=mulberry32(20261027+personIndex);
    // Separate telemetry seed keeps mileage and route geometry stable when tuning events.
    const telemetry=mulberry32(20261027+personIndex+1000);
    const trips: Trip[]=[];
    for (let day=0;day<90;day++) {
      const date=new Date(Date.UTC(2026,6,29+day));
      const weekday=date.getUTCDay();
      const plans: Pattern[]=[];
      if (id==='maya') {
        if (weekday>0&&weekday<6) plans.push(patterns.commute,patterns.commute);
        if ([10,11,52,53].includes(day)) plans.splice(0,plans.length,patterns.dallas);
        if (weekday===0&&!plans.length) plans.push(patterns.austinErrand);
      } else if (id==='garcia') {
        if (weekday>0&&weekday<6) plans.push(patterns.daycare,patterns.daycare);
        if (weekday===6) plans.push(patterns.errands,patterns.errands);
        if ([31,34].includes(day)) plans.splice(0,plans.length,patterns.garciaBigBend);
      } else if (id==='jordan') {
        plans.push(patterns.urban,day%3===0?patterns.houstonPark:patterns.urban);
      } else {
        if (weekday===2||weekday===4) plans.push(patterns.austinErrand,patterns.austinErrand);
        if (weekday===6) plans.push(day%2===0?patterns.rock:patterns.falls);
        if ([24,27].includes(day)) plans.splice(0,plans.length,patterns.rajBigBend);
      }
      for (let slot=0;slot<plans.length;slot++) {
        const p=plans[slot];
        const reverse=slot===1||[11,53,34,27].includes(day);
        const miles=Math.round(p.miles*(.97+random()*.06)*100)/100;
        const night=id==='jordan'?(day%4===0?.3:1):day%13===0?.25:0;
        const start=new Date(date);
        start.setUTCHours(id==='jordan'?(slot===0?4:6):slot===0?13:22,Math.floor(random()*25));
        const hardBrakes=id==='jordan'?(day%5===0?0:1):random()<.035?1:0;
        const trip: Trip={id:`${id}-${String(trips.length+1).padStart(3,'0')}`,personaId:id,start:start.toISOString(),end:'',miles,highwayPct:p.highway,nightPct:night,speedingPct:id==='jordan'?.10+random()*.1:random()*.025,hardBrakes,fastAccels:id==='jordan'&&day%7===0?1:0,harshCorners:id==='jordan'&&day%11===0?1:0,category:p.category,destinationLabel:reverse?(id==='garcia'?'San Antonio':id==='jordan'?'Houston':'Austin'):p.label,score:0,showcase:false,path:[],events:[]};
        // Keep planning metadata out of the public fixture shape.
        const coords=reverse?fallback(p).reverse():fallback(p);
        trip.path=coords.map(([lng,lat])=>[lng,lat,0]);
        trips.push(trip);
        metadata.set(trip.id,{p,reverse});
      }
    }
    const selected=new Set<number>([0,1]);
    if(id==='maya') { selected.add(trips.findIndex(t=>t.destinationLabel==='Dallas')); selected.add(Math.floor(trips.length/2)); selected.add(trips.length-1); }
    else if(id==='garcia') { selected.add(trips.findIndex(t=>t.destinationLabel==='Big Bend NP')); selected.add(trips.findIndex(t=>t.category==='errand')); selected.add(trips.length-1); }
    else if(id==='raj') { selected.add(trips.findIndex(t=>t.destinationLabel==='Big Bend NP')); selected.add(trips.findIndex(t=>t.destinationLabel==='Enchanted Rock')); selected.add(trips.findIndex(t=>t.destinationLabel==='Pedernales Falls')); }
    else { selected.add(30); selected.add(80); selected.add(140); }
    for (const [i,trip] of trips.entries()) {
      const {p,reverse}=metadata.get(trip.id)!;
      let coords: Point[]=trip.path.map(([lng,lat])=>[lng,lat]);
      trip.showcase=selected.has(i);
      if (trip.showcase) {
        const r=await route(p);
        coords=reverse?[...r.coordinates].reverse():r.coordinates;
        trip.miles=Math.round(r.miles*100)/100;
        if(id==='jordan'&&i===0) { trip.hardBrakes=3; trip.fastAccels=1; trip.nightPct=1; trip.speedingPct=.22; }
      }
      if(id==='maya') {
        const commute=trip.category==='commute';
        trip.hardBrakes=commute?2+(telemetry()<.55?1:0):trip.category==='road-trip'?5:0;
        trip.fastAccels=commute&&telemetry()<.55?1:0;
        trip.speedingPct=trip.category==='road-trip'?.25+telemetry()*.15:.12+telemetry()*.10;
        // A recent improvement leaves eight smooth trips after the last rough commute.
        if(i>=trips.length-8) { trip.hardBrakes=0; trip.fastAccels=0; trip.speedingPct=.04; }
        // Opening replay: I-35 braking plus a speeding segment, all anchored to the path.
        if(i===0) { trip.hardBrakes=2; trip.fastAccels=0; trip.speedingPct=.16; }
      } else if(id==='garcia') {
        trip.hardBrakes=trip.category==='road-trip'?2:telemetry()<.15?1:0;
        trip.speedingPct=trip.category==='road-trip'?.18+telemetry()*.07:.04+telemetry()*.04;
        if(i===0) { trip.hardBrakes=1; trip.speedingPct=.08; }
      } else if(id==='raj') {
        trip.hardBrakes=telemetry()<.15?1:0;
        trip.harshCorners=trip.category==='trailhead'?1:0;
        trip.speedingPct=.08+telemetry()*.08;
        // Only the outbound Big Bend showcase is deliberately spotless.
        if(trip.showcase&&trip.destinationLabel==='Big Bend NP') {
          trip.hardBrakes=0; trip.harshCorners=0; trip.speedingPct=0; trip.nightPct=0;
        }
      }
      let seconds=0;
      trip.path=coords.map(([lng,lat],j)=> {
        if(j>0) {
          const cityEdge=j<coords.length*.12||j>coords.length*.88;
          const mph=cityEdge?24:24+trip.highwayPct*42;
          seconds+=Math.max(.01,distance(coords[j-1],[lng,lat])/mph*3600);
        }
        return [Number(lng.toFixed(6)),Number(lat.toFixed(6)),Number(seconds.toFixed(2))];
      });
      trip.end=new Date(new Date(trip.start).getTime()+Math.round(trip.path.at(-1)![2]*1000)).toISOString();
      trip.score=computeTripScore(trip);
      const penalties=scorePenalties(trip);
      const events: {type:TripEventType;delta:number}[]=[];
      for(let j=0;j<trip.hardBrakes;j++) events.push({type:'hard-brake',delta:-penalties.braking/trip.hardBrakes});
      for(let j=0;j<trip.fastAccels;j++) events.push({type:'fast-accel',delta:-penalties.acceleration/trip.fastAccels});
      for(let j=0;j<trip.harshCorners;j++) events.push({type:'harsh-corner',delta:-penalties.cornering/trip.harshCorners});
      if(trip.speedingPct>=.08) events.push({type:'speeding-start',delta:-penalties.speeding},{type:'speeding-end',delta:0});
      trip.events=events.map((event,j)=>{
        const point=trip.path[Math.floor((j+1)/(events.length+1)*(trip.path.length-1))];
        return {t:point[2],type:event.type,scoreDelta:Number(event.delta.toFixed(2)),lngLat:[point[0],point[1]]};
      });
    }
    trips.sort((a,b)=>a.start.localeCompare(b.start));
    await writeFile(resolve(root,`data/trips/${id}.trips.json`),JSON.stringify(trips)+'\n');
    console.log(`${id}: ${trips.length} trips, ${trips.filter(t=>t.showcase).length} showcase, ${Math.round(trips.reduce((n,t)=>n+t.miles,0)/3)} mi/mo, weighted score ${Math.round(trips.reduce((n,t)=>n+t.score*t.miles,0)/trips.reduce((n,t)=>n+t.miles,0))}`);
  }
  await mkdir(resolve(root,'data/reference'),{recursive:true});
  await writeFile(cachePath,JSON.stringify(cache)+'\n');
  console.log(`Pinned routes: ${Object.values(cache).filter(r=>r.source==='osrm').length} OSRM, ${Object.values(cache).filter(r=>r.source==='fallback').length} fallback`);
}
const metadata=new Map<string,{p:Pattern;reverse:boolean}>();
main().catch(error=>{console.error(error);process.exitCode=1;});
