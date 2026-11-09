import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {applyAction,stats,dueDate,validateDebt,installmentSchedule} from '../src/debt.ts';
const debt={id:'shopee',name:'Shopee',contract:'001',principal:10000000,months:12,installment:1100000,initialPaid:4,firstDue:'2026-01-31',color:'orange'};
const seed=()=>({debts:[{...debt}],payments:[]});
const pay=(number=5,id='payment-1')=>({type:'pay',debtId:'shopee',number,id,paidAt:'2026-05-01'});
test('principal, interest and installments are separate',()=>{const s=stats(debt,[]);assert.equal(s.total,13200000);assert.equal(s.paid,4400000);assert.equal(s.remaining,8800000);assert.equal(s.left,8);});
test('one full payment reduces one installment, no mutation of input',()=>{const before=seed(),after=applyAction(before,pay());assert.equal(before.payments.length,0);assert.equal(stats(debt,after.payments).remaining,7700000);assert.equal(stats(debt,after.payments).left,7);});
test('duplicate request and stale installment cannot double pay',()=>{const once=applyAction(seed(),pay());assert.deepEqual(applyAction(once,pay()),once);assert.throws(()=>applyAction(once,pay(5,'another')),/berubah/);assert.throws(()=>applyAction(seed(),{...pay(),id:undefined}),/ID/);});
test('payoff cannot go negative',()=>{let l=seed();for(let n=5;n<=12;n++)l=applyAction(l,pay(n,'p'+n));const s=stats(debt,l.payments);assert.equal(s.remaining,0);assert.equal(s.left,0);assert.equal(s.nextDue,null);assert.throws(()=>applyAction(l,pay(13,'extra')),/berubah/);});
test('only latest payment can be voided; void preserved, repayment allowed',()=>{let l=applyAction(applyAction(seed(),pay()),pay(6,'p2'));assert.throws(()=>applyAction(l,{type:'undo',paymentId:'payment-1'}),/terakhir/);l=applyAction(l,{type:'undo',paymentId:'p2'});assert.ok(l.payments[1].voidedAt);assert.equal(stats(debt,l.payments).count,5);l=applyAction(l,pay(6,'p3'));assert.equal(l.payments.length,3);assert.equal(stats(debt,l.payments).count,6);});
test('month-end, leap-year and year rollover schedules',()=>{assert.equal(dueDate(debt,2),'2026-02-28');assert.equal(dueDate(debt,3),'2026-03-31');assert.equal(dueDate({...debt,firstDue:'2024-01-31'},2),'2024-02-29');assert.equal(dueDate({...debt,firstDue:'2026-12-31'},2),'2027-01-31');});
test('reject fractional months, invalid date, negative money, overpayment',()=>{for(const change of [{months:1.5},{initialPaid:13},{firstDue:'2026-02-30'},{principal:-1},{installment:1}])assert.throws(()=>validateDebt({...debt,...change}));assert.throws(()=>applyAction(seed(),{...pay(),paidAt:'2099-01-01'}));});

test('monthly detail preserves initial balance and separates due month from actual payment date',()=>{
  const ledger=applyAction(seed(),{...pay(),paidAt:'2026-06-02'});
  const rows=installmentSchedule(debt,ledger.payments,'2026-06-30');
  assert.equal(rows.length,12);
  assert.equal(rows[0].status,'paid');assert.equal(rows[0].initial,true);assert.equal(rows[0].paidAt,null);
  assert.equal(rows[0].paidAmount,1100000);
  assert.equal(rows[4].due,'2026-05-31');assert.equal(rows[4].paidAt,'2026-06-02');assert.equal(rows[4].status,'paid');
  assert.equal(rows[5].status,'due');assert.equal(rows[6].status,'upcoming');
  assert.equal(rows[11].due,'2026-12-31');
  assert.equal(rows.reduce((sum,row)=>sum+row.paidAmount,0),stats(debt,ledger.payments).paid);
});

test('voided payment reopens its month and replacement uses the new payment date',()=>{
  let ledger=applyAction(seed(),pay());ledger=applyAction(ledger,{type:'undo',paymentId:'payment-1'});
  let row=installmentSchedule(debt,ledger.payments,'2026-06-01')[4];
  assert.equal(row.status,'overdue');assert.equal(row.paidAt,null);assert.equal(row.paidAmount,0);
  ledger=applyAction(ledger,{...pay(5,'replacement'),paidAt:'2026-06-01'});
  row=installmentSchedule(debt,ledger.payments,'2026-06-01')[4];
  assert.equal(row.status,'paid');assert.equal(row.paidAt,'2026-06-01');assert.equal(row.paidAmount,1100000);
});

test('full schedule crosses years, excludes other contracts and supports a fully paid opening balance',()=>{
  const d={...debt,firstDue:'2026-11-30',initialPaid:12};
  const rows=installmentSchedule(d,[{debtId:'another',number:1,paidAt:'2026-01-01',amount:1,voidedAt:''}],'2027-01-01');
  assert.equal(rows.at(-1).due,'2027-10-30');assert.equal(rows[3].due,'2027-02-28');
  assert.ok(rows.every(row=>row.status==='paid'&&row.paidAt===null));
});
