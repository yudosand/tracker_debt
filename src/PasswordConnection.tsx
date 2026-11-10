import {useState} from 'react';
import {KeyRound,Loader2,LogOut,Save} from 'lucide-react';
import {getScriptSession,saveScriptConfig,scriptLogin,scriptLogout} from './script';
import type {ScriptConfig} from './script';

export default function PasswordConnection({config,onUpdate,busy,compact=false}:{config:ScriptConfig;onUpdate:(c:ScriptConfig)=>void;busy:boolean;compact?:boolean}){
  const [url,setUrl]=useState(config.url),[password,setPassword]=useState(''),[remember,setRemember]=useState(true),[working,setWorking]=useState(false),[error,setError]=useState('');
  const active=!!getScriptSession(config.url),disabled=busy||working;
  async function login(){setError('');setWorking(true);try{const next=saveScriptConfig(url);await scriptLogin(next.url,password,remember);setPassword('');onUpdate({...next});}catch(e){setError((e as Error).message);}finally{setWorking(false);}}
  return <section className={'panel password-panel '+(compact?'compact-login':'')}>
    <div className="password-title"><KeyRound size={22}/><div><h2>{active?'Login sederhana aktif':'Masuk ke dashboard'}</h2><p>{active?'Perangkat ini sudah terhubung ke spreadsheet bersama.':'Cukup password dashboard. Tidak perlu login Google setiap membuka halaman.'}</p></div></div>
    {!active&&<form className="connection-form" onSubmit={e=>{e.preventDefault();void login();}}>
      {(!config.url||!compact)&&<label>URL penghubung Apps Script<input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" required disabled={disabled}/><small>Diatur sekali pada perangkat ini. Gunakan URL yang sama untuk kedua pengguna.</small></label>}
      <label>Password dashboard<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required disabled={disabled}/></label>
      <label className="remember-choice"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} disabled={disabled}/> Ingat perangkat ini selama 30 hari</label>
      <button className="button primary" disabled={disabled}>{working?<Loader2 size={16} className="spin"/>:<KeyRound size={16}/>} Masuk</button>
    </form>}
    {active&&<button className="button secondary" disabled={disabled} onClick={async()=>{setWorking(true);setError('');try{await scriptLogout(config.url);}catch{setError('Sesi lokal sudah dihapus. Pencabutan sesi di server belum terkonfirmasi.');}finally{setWorking(false);onUpdate({...config});}}}><LogOut size={16}/> Keluar dari perangkat ini</button>}
    {!compact&&<><p className="password-guide">Pemilik memasang penghubung sekali pada spreadsheet yang sudah ada. Password disimpan di Apps Script, bukan di GitHub.</p><a className="button secondary" href={import.meta.env.BASE_URL+'login-sederhana.html'} target="_blank" rel="noreferrer"><Save size={16}/> Panduan pemasangan sekali</a></>}
    {error&&<p className="error-box" role="alert">{error}</p>}
  </section>;
}
