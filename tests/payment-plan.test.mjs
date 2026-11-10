import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyPaymentBatch,plannedPaymentMonth,plannedInstallmentCount,pendingMonthlyInstallment} from '../src/payment-plan.ts';
import {debtGroup,monthlyCommitment} from '../src/debt-groups.ts';
import {applyAction,stats,installmentSchedule} from '../src/debt.ts';

const debt={id:'plan',name:'Pinjaman',contract:'',principal:3000000,months:3,installment:1100000,initialPaid:0,firstDue:'2026-12-01',color:'green'};
test('monthly bulk selection includes one full installment per active loan, even before its due month',()=>{
  const ledger={debts:[debt,{...debt,id:'kopkari',name:'Kopkari',firstDue:'2026-11-30'},{...debt,id:'future',firstDue:'2027-01-01'},{...debt,id:'paid',initialPaid:3}],payments:[]};
  let id=0;const items=monthlyPaymentBatch(ledger,'2026-11-10',()=>String(++id));
  assert.deepEqual(items.map(p=>p.debtId),['plan','kopkari','future']);
  assert.equal(items.reduce((sum,p)=>sum+p.amount,0),3300000);
  assert.ok(items.every(p=>p.number===1));assert.equal(new Set(items.map(p=>p.id)).size,3);
  assert.equal(items.find(p=>p.debtId==='kopkari').group,'B');
  assert.equal(monthlyPaymentBatch({debts:[],payments:[]},'2026-11-10').length,0);
});
test('group membership is disjoint and S11 belongs to B',()=>{
  const groups={A:[],B:[]};
  for(let n=1;n<=16;n++)groups[debtGroup({name:'S'+n})].push(n);
  assert.deepEqual(groups.A,[1,2,3,4,5,7,8,10,13,14]);
  assert.deepEqual(groups.B,[6,9,11,12,15,16]);
  assert.equal(debtGroup({name:' Kopkari '}),'B');
  assert.equal(debtGroup({name:' Spinjam 05 '}),'A');
  assert.equal(debtGroup({name:'s11'}),'B');
  assert.equal(debtGroup({name:'S110'}),null);
  assert.equal(debtGroup({name:'Bank baru'}),null);
});
test('monthly commitment stays stable on payment, falls on payoff, and returns on undo',()=>{
  const a={...debt,name:'S1',id:'a',months:2},b={...debt,name:'S11',id:'b',months:1,installment:500000};
  let ledger={debts:[a,b,{...debt,id:'unknown',installment:250000}],payments:[]};
  const initial=monthlyCommitment(ledger);
  assert.deepEqual(initial,{total:1850000,active:3,A:1100000,B:500000,ungrouped:250000});
  ledger=applyAction(ledger,{type:'pay',debtId:'a',id:'pay-a',number:1,paidAt:'2026-10-29'});
  assert.deepEqual(monthlyCommitment(ledger),initial);
  assert.equal(monthlyPaymentBatch(ledger,'2026-10-30').reduce((s,p)=>s+p.amount,0),750000);
  ledger=applyAction(ledger,{type:'pay',debtId:'b',id:'pay-b',number:1,paidAt:'2026-10-29'});
  assert.deepEqual(monthlyCommitment(ledger),{...initial,total:1350000,active:2,B:0});
  ledger=applyAction(ledger,{type:'undo',paymentId:'pay-b'});
  assert.deepEqual(monthlyCommitment(ledger),initial);
});
test('monthly pending respects payment month, undo, opening balances and completed loans',()=>{
  assert.equal(pendingMonthlyInstallment(debt,[],'2026-10-30'),1);
  assert.equal(pendingMonthlyInstallment({...debt,initialPaid:1},[],'2026-10-30'),1);
  assert.equal(pendingMonthlyInstallment({...debt,initialPaid:3},[],'2026-10-30'),0);
  assert.equal(pendingMonthlyInstallment(debt,[],''),0);
  let ledger=applyAction({debts:[debt],payments:[]},{type:'pay',debtId:debt.id,id:'p',number:1,paidAt:'2026-10-29'});
  assert.equal(pendingMonthlyInstallment(debt,ledger.payments,'2026-10-30'),0);
  assert.equal(monthlyPaymentBatch(ledger,'2026-10-30').length,0);
  assert.equal(monthlyPaymentBatch(ledger,'2026-11-01')[0].number,2);
  ledger=applyAction(ledger,{type:'undo',paymentId:'p'});
  assert.equal(pendingMonthlyInstallment(debt,ledger.payments,'2026-10-30'),1);
});
test('undo of an extra payment keeps the month recorded when another payment remains',()=>{
  let ledger={debts:[debt],payments:[]};
  for(let n=1;n<=2;n++)ledger=applyAction(ledger,{type:'pay',debtId:debt.id,id:'extra'+n,number:n,paidAt:'2026-10-29'});
  ledger=applyAction(ledger,{type:'undo',paymentId:'extra2'});
  assert.equal(pendingMonthlyInstallment(debt,ledger.payments,'2026-10-30'),0);
});
test('December installments are budgeted in November, including late-month due dates',()=>{
  for(const day of ['01','15','31']){
    const d={...debt,firstDue:'2026-12-'+day};
    assert.equal(plannedPaymentMonth(d,1),'2026-11');
    assert.equal(plannedInstallmentCount(d,0,'2026-11-10'),1);
    assert.equal(plannedInstallmentCount(d,0,'2026-10-31'),0);
  }
});
test('Kopkari stays in its due month and completed contracts have no budget',()=>{
  const d={...debt,name:' KOPKARI ',firstDue:'2026-11-30'};
  assert.equal(plannedPaymentMonth(d,1),'2026-11');
  assert.equal(plannedInstallmentCount(d,0,'2026-11-10'),1);
  assert.equal(plannedInstallmentCount(d,3,'2027-03-01'),0);
});
test('planned months handle January, leap years and final installments',()=>{
  assert.equal(plannedPaymentMonth({...debt,firstDue:'2027-01-31'},1),'2026-12');
  assert.equal(plannedPaymentMonth({...debt,firstDue:'2024-03-31'},1),'2024-02');
  assert.equal(plannedPaymentMonth(debt,3),'2027-01');
});
test('unpaid past plans stay in budget; opening balance excludes already paid months',()=>{
  assert.equal(plannedInstallmentCount(debt,0,'2026-12-10'),2);
  assert.equal(plannedInstallmentCount(debt,1,'2026-12-10'),1);
  assert.equal(plannedInstallmentCount(debt,2,'2026-12-10'),0);
  assert.equal(plannedInstallmentCount(debt,0,''),0);
});
test('early payment and undo update the plan without changing contractual due dates',()=>{
  const d={...debt,firstDue:'2026-11-01'};
  const paid=applyAction({debts:[d],payments:[]},{type:'pay',debtId:d.id,id:'early',number:1,paidAt:'2026-10-29'});
  assert.equal(plannedInstallmentCount(d,stats(d,paid.payments).count,'2026-10-30'),0);
  const row=installmentSchedule(d,paid.payments,'2026-10-30')[0];
  assert.equal(row.due,'2026-11-01');assert.equal(row.paidAt,'2026-10-29');assert.equal(row.status,'paid');
  const undone=applyAction(paid,{type:'undo',paymentId:'early'});
  assert.equal(plannedInstallmentCount(d,stats(d,undone.payments).count,'2026-10-30'),1);
  assert.equal(installmentSchedule(d,undone.payments,'2026-10-30')[0].status,'upcoming');
});
