import type { Persona, DrivingSummary, EngineResult, WhatIfOverrides, ConsentSource } from '../types';
import tiers from '../../data/reference/insurance-tiers.json';
import { option, round, dollars, bounded } from './common';
export function insuranceMultiplier(score: number) { return tiers.bands.find(b=>score>=b.minScore)?.multiplier??1.25; }
export function computeInsuranceOptions(persona: Persona, driving: DrivingSummary, overrides: WhatIfOverrides={}): EngineResult {
  const limitedBy: ConsentSource[]=[];
  if(!persona.consent.driving) limitedBy.push('driving');
  if(!persona.consent.shareWithInsurers) limitedBy.push('shareWithInsurers');
  const current=persona.insurance.monthlyPremium;
  const score=driving.score;
  const improved=Math.min(100,score+bounded(overrides.scoreImprovement,15,0,100));
  const base=tiers.basePremium[persona.id];
  const premium=round(base*insuranceMultiplier(score));
  const improvedPremium=round(base*insuranceMultiplier(improved));
  const quoteAllowed=limitedBy.length===0;
  const factors=driving.scoreFactors.filter(f=>f.impact<0).sort((a,b)=>a.impact-b.impact).slice(0,2).map(f=>f.factor.toLowerCase());
  const assumptions=[{label:'Pricing',value:'Simulated UBI illustration; no quote is requested or data transmitted.'},{label:'Base premium',value:dollars(base)},{label:'Score',value:'Drive Pulse-style score (simulated), mileage-weighted; no demographic or ZIP inputs.'},{label:'Improvement',value:`${score} → ${improved}; improvement is a scenario, not a guarantee.`}];
  const dataUsed=[{source:'insurance',detail:`Current policy ${dollars(current)}/month`},...(persona.consent.driving?[{source:'driving',detail:`90-day score ${score}; annualized ${round(driving.avgMonthlyMiles*12)} miles`}]:[])];
  const gate={eligible:quoteAllowed,...(!quoteAllowed?{ineligibleReason:`Enable ${limitedBy.join(' and ')} consent to compare a personalized UBI illustration.`}:{})};
  const quote=(id:string,title:string,target:number,cost:number)=>option('insurance',id,title,{...gate,monthlyCost:quoteAllowed?cost:undefined,savingsVsBaseline:quoteAllowed?round((current-cost)*12):undefined,highStakes:true,assumptions,dataUsed,summary:!quoteAllowed?'Personalized insurance pricing is unavailable until consent is enabled.':`${dollars(cost)}/month at score ${target}; ${cost>current?`${dollars(cost-current)} more`:`${dollars(current-cost)} less`} than your current policy.`,math:quoteAllowed?[{label:'UBI monthly premium',formula:`${base} × ${insuranceMultiplier(target)} (score ${target})`,result:dollars(cost)},{label:'Annual savings',formula:`(${current} − ${cost}) × 12`,result:dollars((current-cost)*12)}]:[{label:'Consent gate',formula:'driving AND shareWithInsurers',result:'Personalized quote withheld'}],tradeoffs:['UBI can increase premiums; only switch after reviewing a confirmed quote.','Driving-data sharing requires separate, revocable consent.']});
  return {moveType:'insurance',baselineOptionId:'insurance:current',...(limitedBy.length?{limitedBy}:{}),options:[
    option('insurance','current','Keep your current policy',{monthlyCost:current,savingsVsBaseline:0,summary:`Current premium is ${dollars(current)}/month.`,assumptions,dataUsed,math:[{label:'Annual premium',formula:`${current} × 12`,result:dollars(current*12)}]}),
    quote('ubi-current','UBI at your current score',score,premium),
    quote('ubi-improved','UBI after coaching',improved,improvedPremium),
    option('insurance','coaching','Coach first, then compare insurance',{eligible:persona.consent.driving,...(!persona.consent.driving?{ineligibleReason:'Driving consent is required for personalized coaching.'}:{}),monthlyCost:0,savingsVsBaseline:quoteAllowed?round((current-improvedPremium)*12):undefined,summary:persona.consent.driving?`Work on ${factors.join(' and ')||'smooth driving'} toward score ${improved}. ${quoteAllowed?`At your current score UBI ${premium>current?'costs more':'may save money'}; the improved-score scenario is ${dollars(improvedPremium)}/month.`:'Insurance comparison stays off until you enable sharing; coaching does not share your data.'}`:'Enable driving consent for coaching.',assumptions,dataUsed,math:[{label:'Coaching target',formula:`min(100, ${score} + ${bounded(overrides.scoreImprovement,15,0,100)})`,result:`${improved} / 100`},...(quoteAllowed?[{label:'Conditional annual savings after coaching',formula:`(${current} − ${improvedPremium}) × 12`,result:dollars((current-improvedPremium)*12)}]:[])],tradeoffs:['Score improvement and future savings are not guaranteed.','Do not switch while the quote is higher; compare again after sustained improvement.']})]};
}
