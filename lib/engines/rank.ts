import type { Persona, Preferences, DrivingSummary, EngineResult, MoveOption, RankedMove, MoveType, Priority, CashflowSummary } from '../types';
import { SNAPSHOT_DATE, monthsBetween, round } from './common';
/** Non-dollar impacts below express relative usefulness, never projected savings. */
function impact(option: MoveOption, persona: Persona, driving: DrivingSummary, cashflow: CashflowSummary|null): number {
  const id=option.id;
  if(id==='payment:hardship') return 1;
  if(id==='lease-end:upgrade') return driving.lifestyleTags.includes('off-road')?.95:driving.lifestyleTags.includes('family')?.4:.15;
  if(id==='lease-end:re-lease') return .2;
  if(id==='insurance:ubi-improved') return 0; // future quote is an illustration; coach first
  if(id==='insurance:coaching') return driving.score<80?.85:.1;
  if(id==='payment:due-date') return cashflow?.payday==='biweekly-fri'&&cashflow.paymentDueDay<=5?.6:.08;
  if(id==='protection:service') return persona.contract.kind==='loan'?.45:.2;
  if(id==='protection:tire-wheel') return driving.lifestyleTags.includes('off-road')?.75:.15;
  return Math.max(0,Math.min(1,(option.savingsVsBaseline??0)/(option.moveType==='insurance'?600:1500)));
}
function fit(o:MoveOption):Record<Priority,number> {
  if(o.id==='lease-end:upgrade') return {monthlyPayment:.1,totalCost:.15,flexibility:.7,lifestyleFit:1};
  if(o.id==='lease-end:buyout') return {monthlyPayment:.65,totalCost:1,flexibility:1,lifestyleFit:.65};
  if(o.id==='payment:extra-principal') return {monthlyPayment:.05,totalCost:1,flexibility:.1,lifestyleFit:.2};
  if(o.id==='payment:due-date') return {monthlyPayment:.8,totalCost:.2,flexibility:1,lifestyleFit:.4};
  if(o.id==='protection:tire-wheel') return {monthlyPayment:.25,totalCost:.4,flexibility:.4,lifestyleFit:1};
  if(o.moveType==='protection') return {monthlyPayment:.5,totalCost:.65,flexibility:.35,lifestyleFit:.8};
  return {monthlyPayment:1,totalCost:.85,flexibility:.55,lifestyleFit:.5};
}
export function rankMoves(persona:Persona, engines:Record<MoveType,EngineResult>, driving:DrivingSummary, cashflow:CashflowSummary|null, preferences:Preferences):RankedMove[] {
  const ranked:RankedMove[]=[];
  const weights=preferences.priorityWeights;
  const weightTotal=Object.values(weights).reduce((n,v)=>n+Math.max(0,v),0)||1;
  for(const engine of Object.values(engines)) {
    if(preferences.suppressedMoveTypes.includes(engine.moveType)) continue;
    const candidates:RankedMove[]=[];
    for(const o of engine.options) {
      if(!o.eligible||o.id===engine.baselineOptionId||preferences.dismissed.some(d=>d.optionId===o.id)||preferences.accepted.some(a=>a.optionId===o.id)) continue;
      const normalizedImpact=impact(o,persona,driving,cashflow);
      if(normalizedImpact<=0) continue;
      const moveFit=fit(o);
      const preferenceFit=(Object.keys(weights) as Priority[]).reduce((n,key)=>n+Math.max(0,weights[key])/weightTotal*moveFit[key],0);
      const months=o.deadline?monthsBetween(SNAPSHOT_DATE,o.deadline):Infinity;
      let urgency=months<=2&&months>=0?1.6:months<=6&&months>=0?1.2:1;
      if(o.id==='payment:hardship') urgency=3;
      const confidence={high:1,medium:.85,low:.55}[o.confidence];
      const score=normalizedImpact*preferenceFit*urgency*confidence;
      candidates.push({rank:0,optionId:o.id,moveType:o.moveType,score:round(score),breakdown:{impact:round(normalizedImpact),preferenceFit:round(preferenceFit),urgency,confidence}});
    }
    // One winning option per move tile, so top two recommendations are distinct actions.
    candidates.sort((a,b)=>b.score-a.score||a.optionId.localeCompare(b.optionId));
    if(candidates[0]) ranked.push(candidates[0]);
  }
  return ranked.sort((a,b)=>b.score-a.score||a.optionId.localeCompare(b.optionId)).map((r,i)=>({...r,rank:i+1}));
}
