import {useState} from 'react';

export default function RupiahInput({name,placeholder,onValueChange}:{name:string;placeholder:string;onValueChange:(value:number)=>void}){
  const [digits,setDigits]=useState('');
  return <>
    <input type="text" inputMode="numeric" required placeholder={placeholder} autoComplete="off" maxLength={32}
      onChange={event=>{
        const input=event.currentTarget,raw=input.value,caret=input.selectionStart??raw.length;
        const before=raw.slice(0,caret).replace(/\D/g,'').length;
        const original=raw.replace(/\D/g,''),next=original.replace(/^0+(?=\d)/,'');
        const formatted=next?'Rp'+next.replace(/\B(?=(\d{3})+(?!\d))/g,'.'):'';
        const value=Number(next);
        input.value=formatted;
        input.setCustomValidity(next&&(!Number.isSafeInteger(value)||value<1||value>1e12)?'Masukkan nominal antara Rp1 dan Rp1.000.000.000.000.':'');
        // Keep the caret beside the same digit when separators are inserted.
        const target=Math.max(0,before-(original.length-next.length));
        let position=formatted?2:0,seen=0;
        while(position<formatted.length&&seen<target){if(/\d/.test(formatted[position]))seen++;position++;}
        input.setSelectionRange(position,position);
        setDigits(next);onValueChange(value);
      }}/>
    <input type="hidden" style={{display:'none'}} name={name} value={digits}/>
  </>;
}
