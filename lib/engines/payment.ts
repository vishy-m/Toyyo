import type { Persona, CashflowSummary, EngineResult, WhatIfOverrides, ConsentSource } from '../types';
import { option, rates, round, dollars, payment, bounded } from './common';
/** Month-by-month amortization with a smaller final payment, including zero APR. */
export function amortize(principal: number, apr: number, monthlyPayment: number) {
  let balance=principal,interest=0,months=0,total=0;
  if(principal<=0) return {months:0,interest:0,total:0};
  if(monthlyPayment<=principal*apr/1200) return {months:Infinity,interest:Infinity,total:Infinity};
  while(balance>.000001&&months<1200) {
    const charge=balance*apr/1200;
    const paid=Math.min(balance+charge,monthlyPayment);
    interest+=charge; total+=paid; balance+=charge-paid; months++;
  }
  return {months,interest:round(interest),total:round(total)};
}
export function computePaymentOptions(persona: Persona, cashflow: CashflowSummary|null, overrides: WhatIfOverrides={}): EngineResult {
  const c=persona.contract;
  const limitedBy:ConsentSource[]=[];
  if(!persona.consent.banking) limitedBy.push('banking');
  if(!persona.consent.paymentHistory) limitedBy.push('paymentHistory');
  const history=persona.consent.paymentHistory;
  const banking=persona.consent.banking&&cashflow!==null;
  const apr=rates.aprByCreditTier[persona.creditTier];
  const dataUsed=[{source:'contract',detail:`${c.monthsRemaining} months remaining; ${dollars(c.monthlyPayment)}/month`},...(banking?[{source:'banking',detail:`Payday ${cashflow.payday}; due day ${cashflow.paymentDueDay}`}]:[]),...(history&&cashflow?[{source:'paymentHistory',detail:`${cashflow.latePaymentsLast12} late payments in the past 12 months`}]:[])];
  const base=option('payment','current','Keep your current payment',{monthlyCost:c.monthlyPayment,summary:`Scheduled payment ${dollars(c.monthlyPayment)}/month.`,dataUsed,math:[{label:'Remaining scheduled payments',formula:`${c.monthlyPayment} × ${c.monthsRemaining}`,result:dollars(c.monthlyPayment*c.monthsRemaining)}]});
  const loanEligible=c.kind==='loan';
  const gated=(reason:string)=>({eligible:false,ineligibleReason:reason});
  const principal=c.kind==='loan'?c.principalRemaining:0;
  const original=c.kind==='loan'?amortize(principal,c.apr,c.monthlyPayment):{months:0,interest:0,total:0};
  const refiPayment=payment(principal,apr,c.monthsRemaining);
  const refiTotal=refiPayment*c.monthsRemaining+rates.refinanceFee;
  const extra=bounded(overrides.extraPrincipal,50,0,5000);
  const accelerated=c.kind==='loan'?amortize(principal,c.apr,c.monthlyPayment+extra):original;
  const dueDay=Math.round(bounded(overrides.paymentDueDay,banking&&cashflow.payday==='biweekly-fri'?17:18,1,28));
  const dueEligible=banking&&(cashflow.paymentDueDay!==dueDay);
  const autopayApr=c.kind==='loan'?Math.max(0,c.apr-rates.autopayDiscountApr):0;
  const autopayPayment=payment(principal,autopayApr,c.monthsRemaining);
  const hardship=banking&&cashflow.recurringShortfall;
  const reason='This option requires a loan; your account is a lease.';
  const assumptions=[{label:'Offers',value:'All APRs and terms are synthetic, subject to underwriting.'},{label:'Refinance term',value:`Same remaining term: ${c.monthsRemaining} months; ${dollars(rates.refinanceFee)} fee paid upfront.`},{label:'Autopay discount',value:'0.25 percentage points APR, simulated; not retroactive.'}];
  const options=[base,
    option('payment','refinance','Refinance at your improved credit tier',{...(!loanEligible?gated(reason):!history?gated('Payment-history consent is required for a personalized refinance illustration.'):{}),monthlyCost:loanEligible?round(refiPayment):undefined,totalCost:loanEligible?round(refiTotal):undefined,savingsVsBaseline:loanEligible?round(original.total-refiTotal):undefined,highStakes:true,assumptions,dataUsed,summary:loanEligible?`${apr}% simulated APR: ${dollars(refiPayment)}/month; ${dollars(original.total-refiTotal)} net savings after the fee.`:reason,math:[{label:'Monthly refinance payment',formula:`Amortize ${principal} at ${apr}% over ${c.monthsRemaining} months`,result:dollars(refiPayment)},{label:'Monthly reduction',formula:`${c.monthlyPayment} − ${round(refiPayment)}`,result:dollars(c.monthlyPayment-refiPayment)},{label:'Lifetime savings after fee',formula:`${original.total} − (${round(refiPayment*c.monthsRemaining)} + ${rates.refinanceFee})`,result:dollars(original.total-refiTotal)}],tradeoffs:['Credit approval is required; quoted APR may differ.','Savings assume the remaining term is unchanged and the refinance fee is paid upfront.']}),
    option('payment','extra-principal','Pay a little extra toward principal',{...(!loanEligible?gated(reason):{}),monthlyCost:loanEligible?round(c.monthlyPayment+extra):undefined,totalCost:loanEligible?accelerated.total:undefined,savingsVsBaseline:loanEligible?round(original.total-accelerated.total):undefined,assumptions,dataUsed,summary:loanEligible?`${dollars(extra)} extra/month saves ${dollars(original.interest-accelerated.interest)} interest and ${original.months-accelerated.months} scheduled payments.`:reason,math:[{label:'Interest saved',formula:`${original.interest} − ${accelerated.interest}`,result:dollars(original.interest-accelerated.interest)},{label:'Payments avoided',formula:`${original.months} − ${accelerated.months}`,result:`${original.months-accelerated.months} months`}],tradeoffs:['A higher monthly payment reduces your cash buffer.','Assumes extra payments apply to principal with no prepayment penalty.']}),
    option('payment','due-date','Align your payment date with payday',{...(!banking?gated('Enable banking consent to use payday and due-date information.'):!dueEligible?gated('This is already your current payment due day.'):{}),monthlyCost:c.monthlyPayment,assumptions:[{label:'Suggested due day',value:String(dueDay)},{label:'Payday cadence',value:banking?`${cashflow.payday}; biweekly dates drift, so keep a cash buffer.`:'Withheld: banking consent off'}],dataUsed,summary:banking?`Ask to move your payment from day ${cashflow.paymentDueDay} to day ${dueDay}; keep a buffer because biweekly Fridays shift.`:'Enable banking consent to align your payment date.',math:[{label:'Due day',formula:banking?`${cashflow.paymentDueDay} → ${dueDay}`:'Banking consent required',result:banking?`Day ${dueDay}`:'Unavailable'}],tradeoffs:['Due-date changes require servicer approval and can change accrued interest.','No dollar savings are assumed; this is a cash-flow timing aid.']}),
    option('payment','autopay','Set up autopay with a rate discount',{...(!loanEligible?gated(reason):c.autopay?gated('Autopay is already enabled.'):{}),monthlyCost:loanEligible?round(autopayPayment):undefined,savingsVsBaseline:loanEligible?round(original.total-autopayPayment*c.monthsRemaining):undefined,assumptions,dataUsed,summary:loanEligible?`A simulated 0.25-point APR discount gives ${dollars(autopayPayment)}/month.`:reason,math:[{label:'Discounted APR',formula:`${c.kind==='loan'?c.apr:0} − 0.25`,result:`${autopayApr}%`},{label:'Monthly payment',formula:`Amortize ${principal} at ${autopayApr}% over ${c.monthsRemaining} months`,result:dollars(autopayPayment)}],tradeoffs:['Keep sufficient funds available to avoid overdraft.','Discount availability must be confirmed with your servicer.']}),
    option('payment','hardship','Talk with a payment-support specialist',{eligible:hardship,...(!hardship?{ineligibleReason:banking?'No recurring shortfall signal in this scenario.':'Banking consent is required to assess a cash-flow shortfall.'}:{}),highStakes:true,dataUsed,summary:'Specialist callback only: review a recurring shortfall before changing your loan.',assumptions:[{label:'Next step',value:'Specialist callback only; no automated hardship enrollment or transaction.'}],math:[{label:'Recurring cash-flow shortfall',formula:'Banking consent AND recurringShortfall',result:hardship?'Detected':'Not assessed or not present'}],tradeoffs:['Relief options and credit consequences require an individual specialist review.']})
  ];
  if(hardship) for(const choice of options) if(!['payment:current','payment:hardship'].includes(choice.id)) {choice.eligible=false;choice.ineligibleReason='Recurring shortfall: speak with a specialist before changing payments.';}
  return {moveType:'payment',baselineOptionId:base.id,options,...(limitedBy.length?{limitedBy}:{})};
}
