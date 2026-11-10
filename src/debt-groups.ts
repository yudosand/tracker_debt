import type {Debt,Ledger} from './debt.ts';
import {stats} from './debt.ts';

export type DebtGroup='A'|'B'|null;
const groupA=new Set([1,2,3,4,5,7,8,10,13,14]);
const groupB=new Set([6,9,11,12,15,16]);
export function debtGroup(debt:Pick<Debt,'name'>):DebtGroup{
  const name=debt.name.trim();
  if(/\bkopkari\b/i.test(name))return 'B';
  const match=name.match(/^(?:spinjam|s)\s*0*(\d+)$/i);
  if(!match)return null;
  const number=Number(match[1]);
  return groupA.has(number)?'A':groupB.has(number)?'B':null;
}
export function monthlyCommitment(ledger:Ledger){
  const result={total:0,active:0,A:0,B:0,ungrouped:0};
  for(const debt of ledger.debts){
    if(stats(debt,ledger.payments).left<=0)continue;
    result.total+=debt.installment;result.active++;
    result[debtGroup(debt)||'ungrouped']+=debt.installment;
  }
  return result;
}
