import type { Persona, Trip, DrivingSummary, TripInsight } from '../types';
import { dollars, round, rates } from './common';
export function computeTripInsights(persona: Persona, trips: Trip[], driving: DrivingSummary): TripInsight[] {
  if(!persona.consent.driving) return [];
  const insights:TripInsight[]=[];
  const longTrip=[...trips].sort((a,b)=>b.miles-a.miles)[0];
  if(persona.vehicle.isHybrid) {
    const comparableGasMpg=28;
    const gallons=driving.totalMiles*(1/comparableGasMpg-1/persona.vehicle.mpg);
    insights.push({id:'hybrid-fuel',text:`Your hybrid used about ${round(gallons)} fewer gallons over ${driving.totalMiles} miles: ${dollars(gallons*rates.gasPricePerGallon)} at a simulated $3.05/gal, compared with a 28 MPG gas model (${persona.vehicle.mpg} MPG hybrid).`,relatedMove:'lease-end',relatedTripId:longTrip?.id});
  }
  const destination=driving.topDestinations[0];
  if(destination) insights.push({id:'destination-pattern',text:`${destination.trips} trips ended around ${destination.label} in the last 90 days.`,relatedTripId:trips.find(t=>t.destinationLabel===destination.label)?.id});
  if(driving.lifestyleTags.includes('off-road')) insights.push({id:'trail-fit',text:`${trips.filter(t=>t.category==='trailhead').length} trailhead trips suggest comparing 4Runner cargo and trail capability, plus tire coverage exclusions.`,relatedMove:'lease-end',relatedTripId:trips.find(t=>t.category==='trailhead'&&t.showcase)?.id});
  if(driving.lifestyleTags.includes('family')) insights.push({id:'family-fit',text:'Childcare trips suggest family cargo needs; compare a Highlander Hybrid at a future trade-in, after reviewing today’s refinance.',relatedMove:'payment',relatedTripId:trips.find(t=>t.category==='childcare')?.id});
  if(driving.lifestyleTags.includes('night-driver')) insights.push({id:'night-coaching',text:'More than 20% of your miles are at night. Leave more following distance and brake earlier; review your score before changing insurance.',relatedMove:'insurance',relatedTripId:[...trips].filter(t=>t.showcase).sort((a,b)=>a.score-b.score)[0]?.id});
  return insights;
}
