import {dueDate} from './debt.ts';
import type {Debt} from './debt.ts';

// Shared household policy: Kopkari is auto-debited in its due month;
// other installments are budgeted at the end of the preceding month.
export function isKopkari(debt:Debt){return /\bkopkari\b/i.test(debt.name);}
export function plannedPaymentMonth(debt:Debt,number:number){
  const due=dueDate(debt,number);
  if(isKopkari(debt))return due.slice(0,7);
  const [year,month]=due.split('-').map(Number);
  return new Date(Date.UTC(year,month-2,1)).toISOString().slice(0,7);
}
export function plannedInstallmentCount(debt:Debt,paidCount:number,asOf:string){
  if(!asOf)return 0;
  let count=0;
  for(let n=paidCount+1;n<=debt.months;n++){
    if(plannedPaymentMonth(debt,n)>asOf.slice(0,7))break;
    count++;
  }
  return count;
}
export const paymentMonthLabel=(month:string)=>new Date(month+'-01T00:00:00').toLocaleDateString('id-ID',{month:'long',year:'numeric'});
