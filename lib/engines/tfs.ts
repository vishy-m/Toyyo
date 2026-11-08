import type { PersonaId, HandoffPacket, TfsMetrics } from '../types';
import { getPersona } from '../data';
import { buildDashboard } from './index';
import { round } from './common';
export function computeTfsMetrics(personaId: PersonaId, accepted: boolean, packets: HandoffPacket[]):TfsMetrics {
  const persona=getPersona(personaId);
  const dashboard=buildDashboard(personaId,{preferences:persona.preferences,consent:persona.consent});
  const relevant=packets.filter(p=>p.personaId===personaId);
  const top=dashboard.ranked[0];
  const latest=relevant.at(-1);
  const optionId=latest?.optionId??top?.optionId;
  const choice=Object.values(dashboard.engines).flatMap(e=>e.options).find(o=>o.id===optionId);
  const years=optionId==='lease-end:buyout'?4.2:optionId==='payment:refinance'?persona.contract.monthsRemaining/12:optionId==='lease-end:upgrade'?3:1;
  const annualValue=choice?.moveType==='lease-end'?420:choice?.moveType==='payment'?300:120;
  const retentionLikelihood=accepted?.88:.62;
  return {personaId,recommendedMove:choice?.title??'Review your next move',accepted,retentionLikelihood,projectedValue:round(years*annualValue*retentionLikelihood),callsAvoided:relevant.filter(p=>p.mode==='self-service').length*1.5,openPackets:relevant.length,assumptions:[{label:'Retention likelihood',value:'Simulated 62% before acceptance, 88% after; illustrative, not measured.'},{label:'Retained relationship',value:`${round(years)} years; buyout 4.2 years, upgrade 3, refinance remaining loan term.`},{label:'Projected value',value:`${round(years)} years × $${annualValue}/year contribution × ${retentionLikelihood}; not gross loan principal or promised revenue.`},{label:'Calls avoided',value:'1.5 calls per self-service packet; specialist callbacks receive no call-avoidance credit.'},{label:'Packet status',value:'All packets count as open; the demo contract has no closed-status field.'}]};
}
