import {CalendarDays,ChevronDown} from 'lucide-react';
import {installmentSchedule,rupiah} from './debt';
import {isKopkari,plannedPaymentMonth,paymentMonthLabel} from './payment-plan';
import type {Debt,Payment} from './debt';

const dateLabel=(date:string)=>new Date(date+'T00:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
const labels={paid:'Dibayar',overdue:'Lewat tempo',due:'Jatuh tempo hari ini',upcoming:'Belum dibayar'};

export default function InstallmentSchedule({debt,payments}:{debt:Debt;payments:Payment[]}){
  const rows=installmentSchedule(debt,payments),complete=rows.every(row=>row.status==='paid');
  return <div className="installment-section">
    <div className="payoff-target"><CalendarDays size={17}/><div><span>{complete?'Akhir jadwal awal':'Target lunas · jadwal awal'}</span><strong>{paymentMonthLabel(plannedPaymentMonth(debt,debt.months))}</strong></div></div>
    <details className="installment-schedule">
      <summary><span>Rincian {debt.months} bulan<span className="sr-only"> · {debt.name}</span></span><ChevronDown size={16}/></summary>
      <p className="schedule-note">{isKopkari(debt)?'Acuan awal Kopkari: bulan jatuh tempo.':'Acuan awal: bulan sebelum jatuh tempo.'} Agenda bulan berjalan menyiapkan satu angsuran per pinjaman aktif, termasuk lebih awal dari acuan ini. Tanggal pembayaran sebenarnya dicatat terpisah; pelunasan bisa lebih cepat.</p>
      <ol className="installment-list" aria-label={`Jadwal angsuran ${debt.name}`}>
        {rows.map(row=><li key={row.number} className={'installment-row '+row.status}>
          <div className="installment-heading"><strong>{paymentMonthLabel(plannedPaymentMonth(debt,row.number))}</strong><span className={'installment-status '+row.status}>{labels[row.status]}</span></div>
          <div className="installment-amount"><span>Angsuran ke-{row.number}</span><b>{rupiah(row.amount)}</b></div>
          <div className="installment-meta">Jatuh tempo {dateLabel(row.due)}</div>
          <div className="installment-payment">{row.initial?`Terbayar ${rupiah(row.paidAmount)} · saldo awal`:row.paidAt?`Dibayar ${rupiah(row.paidAmount)} · ${dateLabel(row.paidAt)}`:`Belum dibayar · sisa ${rupiah(row.amount)}`}</div>
          {row.initial&&<div className="installment-meta">Tanggal bayar belum dicatat.</div>}
        </li>)}
      </ol>
    </details>
  </div>;
}
