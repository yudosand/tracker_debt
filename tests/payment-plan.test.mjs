import test from 'node:test';
import assert from 'node:assert/strict';
import {plannedPaymentMonth,plannedInstallmentCount} from '../src/payment-plan.ts';
import {applyAction,stats,installmentSchedule} from '../src/debt.ts';

const debt={id:'plan',name:'Pinjaman',contract:'',principal:3000000,months:3,installment:1100000,initialPaid:0,firstDue:'2026-12-01',color:'green'};
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
