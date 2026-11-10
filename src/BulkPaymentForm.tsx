import {useState} from 'react';
import {CheckCheck,Loader2} from 'lucide-react';
import {rupiah} from './debt';
import {paymentMonthLabel} from './payment-plan';
import type {BatchItem} from './payment-plan';

export default function BulkPaymentForm({items,month,date,busy,error,demo,onCancel,onConfirm}:{items:BatchItem[];month:string;date:string;busy:boolean;error:string;demo:boolean;onCancel:()=>void;onConfirm:(paidAt:string)=>void}){
  const [paidAt,setPaidAt]=useState(date);
  const total=items.reduce((sum,item)=>sum+item.amount,0),count=new Set(items.map(item=>item.debtId)).size;
  return <form onSubmit={e=>{e.preventDefault();onConfirm(paidAt);}}>
    <h2>Catat semua cicilan bulan ini?</h2>
    <p className="dialog-description">Rencana {paymentMonthLabel(month)} · {count} pinjaman · {items.length} angsuran. Termasuk rencana sebelumnya yang belum dibayar. Tanggal yang Anda pilih berlaku untuk semua catatan berikut.</p>
    <div className="bulk-payment-list" tabIndex={0} role="region" aria-label="Rincian pembayaran sekaligus">
      {items.map(item=><div className="bulk-payment-row" key={item.id}><div><strong>{item.name}</strong><small>Angsuran ke-{item.number} · jatuh tempo {new Date(item.due+'T00:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}</small></div><b>{rupiah(item.amount)}</b></div>)}
    </div>
    <div className="calculation"><span>Total pembayaran, termasuk bunga<b>{rupiah(total)}</b></span></div>
    <label>Tanggal pembayaran<input type="date" value={paidAt} onChange={e=>setPaidAt(e.target.value)} max={date} required disabled={busy}/></label>
    <label className="bulk-confirm"><input type="checkbox" required disabled={busy}/> Saya sudah menyelesaikan semua transfer/autodebet dalam daftar ini.</label>
    <p className="dialog-description">Tombol ini hanya mencatat pembayaran. Sisa tenor setelah bulan ini tetap berjalan. Koreksi tersedia per catatan di Riwayat pembayaran.</p>
    {demo&&<p className="demo-note">Mode demo: perubahan hanya disimpan di browser ini.</p>}
    {error&&<p role="alert" className="error-box">{error}</p>}
    <div className="dialog-actions"><button type="button" className="button secondary" disabled={busy} onClick={onCancel}>Batal</button><button className="button primary" disabled={busy||!items.length}>{busy?<Loader2 size={17} className="spin"/>:<CheckCheck size={17}/>} Ya, catat {items.length} angsuran</button></div>
  </form>;
}
