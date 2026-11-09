export type Debt = { id:string; name:string; contract:string; principal:number; months:number; installment:number; initialPaid:number; firstDue:string; color:string };
export type Payment = { id:string; debtId:string; number:number; amount:number; paidAt:string; createdAt:string; voidedAt:string };
export type Ledger = { debts:Debt[]; payments:Payment[] };
export type Action = {type:'add';debt:Debt}|{type:'pay';debtId:string;number:number;id:string;paidAt:string}|{type:'undo';paymentId:string};
export const rupiah=(v:number)=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(v);
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function dueDate(d:Debt,n:number){const[y,m,day]=d.firstDue.split('-').map(Number);const date=new Date(Date.UTC(y,m-1+n-1,1));const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,last));return date.toISOString().slice(0,10);}
export function stats(d:Debt,ps:Payment[]){const count=d.initialPaid+ps.filter(p=>p.debtId===d.id&&!p.voidedAt).length;return{count,total:d.months*d.installment,paid:count*d.installment,remaining:(d.months-count)*d.installment,left:d.months-count,percent:Math.round(count/d.months*100),nextDue:count<d.months?dueDate(d,count+1):null};}
export function validateDebt(d:Debt){
  if(!d||typeof d.id!=='string'||!/^[\w-]{1,80}$/.test(d.id)||typeof d.name!=='string'||!d.name.trim()||d.name.length>80||typeof d.contract!=='string'||d.contract.length>100)throw new Error('Nama atau nomor kontrak tidak valid.');
  if(!Number.isSafeInteger(d.principal)||d.principal<1||d.principal>1e12||!Number.isSafeInteger(d.installment)||d.installment<1||d.installment>1e12)throw new Error('Nominal harus berupa rupiah bulat yang positif.');
  if(!Number.isInteger(d.months)||d.months<1||d.months>600||!Number.isInteger(d.initialPaid)||d.initialPaid<0||d.initialPaid>d.months)throw new Error('Tenor atau jumlah bulan terbayar tidak valid.');
  if(!validDate(d.firstDue))throw new Error('Tanggal jatuh tempo tidak valid.');
  if(d.installment*d.months<d.principal)throw new Error('Total cicilan tidak boleh kurang dari pokok pinjaman.');
  if(!['green','blue','orange','purple'].includes(d.color))throw new Error('Warna tidak valid.');
}
export function validDate(s:string){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
export function applyAction(ledger:Ledger,a:Action,now=new Date().toISOString()):Ledger{
  const next=structuredClone(ledger);
  if(a.type==='add'){validateDebt(a.debt);if(next.debts.some(d=>d.id===a.debt.id))return next;if(next.debts.length>=500)throw new Error('Maksimum 500 utang.');next.debts.push({...a.debt,name:a.debt.name.trim(),contract:a.debt.contract.trim()});}
  else if(a.type==='pay'){
    if(typeof a.id!=='string'||!/^[\w-]{1,80}$/.test(a.id))throw new Error('ID pembayaran tidak valid.');if(next.payments.some(p=>p.id===a.id))return next;
    const d=next.debts.find(d=>d.id===a.debtId);if(!d)throw new Error('Utang tidak ditemukan.');const s=stats(d,next.payments);
    if(!s.left||a.number!==s.count+1)throw new Error('Cicilan sudah berubah. Muat ulang data sebelum mencatat pembayaran.');
    if(!validDate(a.paidAt)||a.paidAt>today())throw new Error('Tanggal pembayaran tidak valid atau masih di masa depan.');
    next.payments.push({id:a.id,debtId:d.id,number:a.number,amount:d.installment,paidAt:a.paidAt,createdAt:now,voidedAt:''});
  }else if(a.type==='undo'){
    const p=next.payments.find(p=>p.id===a.paymentId);if(!p)throw new Error('Pembayaran tidak ditemukan.');if(p.voidedAt)return next;
    if(next.payments.some(x=>x.debtId===p.debtId&&!x.voidedAt&&x.number>p.number))throw new Error('Hanya pembayaran terakhir per utang yang dapat dibatalkan.');p.voidedAt=now;
  }else throw new Error('Aksi tidak dikenali.');return next;
}
export function demoLedger():Ledger{const first=(back:number)=>{const d=new Date(today()+'T00:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-back);return d.toISOString().slice(0,8)+'15';};return{debts:[
{id:'demo-shopee',name:'Shopee PayLater',contract:'SP-2026-001',principal:10000000,months:12,installment:1100000,initialPaid:4,firstDue:first(4),color:'orange'},
{id:'demo-bca',name:'BCA Personal Loan',contract:'BCA-2026-002',principal:24000000,months:24,installment:1200000,initialPaid:9,firstDue:first(9),color:'blue'},
{id:'demo-kredivo',name:'Kredivo',contract:'KRD-2026-003',principal:3000000,months:6,installment:550000,initialPaid:3,firstDue:first(3),color:'purple'}],payments:[]};}
