import {applyAction,validateDebt,validDate} from './debt.ts';
import type {Action,Ledger} from './debt.ts';

// A single append-only journal makes concurrent writes non-destructive. Replaying
// the spreadsheet's row order accepts only one event against a given revision.
export const HEADERS=['eventId','aksi','waktu','idUtang','nama','kontrak','pokok','tenor','cicilan','bulanAwal','tanggalAwal','warna','angsuran','tanggalBayar','idPembayaranBatal','versiSebelum'];
export type Cell=string|number;
export type Entry={id:string;debtId:string;action:Action;at:string;revision:string};
export type Projection={ledger:Ledger;revisions:Map<string,string>;accepted:Set<string>;conflicts:{id:string;row:number;reason:string}[]};
const idOK=(s:unknown):s is string=>typeof s==='string'&&/^[\w-]{1,170}$/.test(s);
export function actionId(a:Action){return a.type==='add'?'add-'+a.debt.id:a.type==='pay'?a.id:'undo-'+a.paymentId;}
export function encodeEntry(a:Action,p:Projection,at=new Date().toISOString()):Cell[]{
  const debt=a.type==='add'?a.debt:a.type==='pay'?p.ledger.debts.find(d=>d.id===a.debtId):p.ledger.debts.find(d=>d.id===p.ledger.payments.find(x=>x.id===a.paymentId)?.debtId);
  if(!debt)throw new Error('Kontrak tidak ditemukan.');
  applyAction(p.ledger,a,at);
  return[actionId(a),a.type,at,debt.id,debt.name,debt.contract,debt.principal,debt.months,debt.installment,debt.initialPaid,debt.firstDue,debt.color,a.type==='pay'?a.number:'',a.type==='pay'?a.paidAt:'',a.type==='undo'?a.paymentId:'',p.revisions.get(debt.id)||''];
}
export function decodeEntry(row:unknown[],n:number):Entry{
  const [id,type,at,debtId,name,contract,principal,months,installment,initialPaid,firstDue,color,number,paidAt,paymentId,revision]=row;
  if(!idOK(id)||!idOK(debtId)||typeof at!=='string'||Number.isNaN(Date.parse(at))||(revision!==undefined&&revision!==''&&!idOK(revision)))throw new Error(`Baris ${n}: identitas atau waktu transaksi tidak valid.`);
  let action:Action;
  if(type==='add'){
    const debt={id:debtId,name,contract:contract??'',principal,months,installment,initialPaid,firstDue,color} as Parameters<typeof validateDebt>[0];validateDebt(debt);action={type:'add',debt};
  }else if(type==='pay'){
    if(typeof number!=='number'||!Number.isInteger(number)||number<1||typeof paidAt!=='string'||!validDate(paidAt))throw new Error(`Baris ${n}: data pembayaran tidak valid.`);
    action={type:'pay',id,debtId,number,paidAt};
  }else if(type==='undo'){
    if(!idOK(paymentId))throw new Error(`Baris ${n}: referensi pembatalan tidak valid.`);action={type:'undo',paymentId};
  }else throw new Error(`Baris ${n}: aksi tidak dikenal.`);
  return{id,debtId,at,action,revision:typeof revision==='string'?revision:''};
}
export function replay(rows:unknown[][]):Projection{
  if(!rows.length||HEADERS.some((h,i)=>rows[0][i]!==h))throw new Error('Header tab Transaksi tidak sesuai. Pilih spreadsheet yang dibuat oleh Lunas.');
  const p:Projection={ledger:{debts:[],payments:[]},revisions:new Map(),accepted:new Set(),conflicts:[]},seen=new Map<string,string>();
  for(let i=1;i<rows.length;i++){
    const row=rows[i];if(row.every(v=>v===''||v===null||v===undefined))continue;
    const e=decodeEntry(row,i+1),serialized=JSON.stringify({debtId:e.debtId,action:e.action});
    if(seen.has(e.id)){if(seen.get(e.id)!==serialized)throw new Error(`Baris ${i+1}: ID transaksi dipakai untuk data berbeda.`);continue;}seen.set(e.id,serialized);
    if((p.revisions.get(e.debtId)||'')!==e.revision){p.conflicts.push({id:e.id,row:i+1,reason:'Data sudah berubah sebelum transaksi ini disimpan.'});continue;}
    try{
      const action=e.action;
      if(action.type==='undo'&&p.ledger.payments.find(x=>x.id===action.paymentId)?.debtId!==e.debtId)throw new Error('Referensi utang tidak cocok.');
      if(e.action.type==='add'&&p.ledger.debts.some(d=>d.id===e.debtId))throw new Error('Kontrak sudah ada.');
      p.ledger=applyAction(p.ledger,e.action,e.at);p.revisions.set(e.debtId,e.id);p.accepted.add(e.id);
    }catch(error){p.conflicts.push({id:e.id,row:i+1,reason:error instanceof Error?error.message:'Transaksi tidak valid.'});}
  }
  return p;
}
