import {replay} from './journal';
import type {Action} from './debt';
import {clearScriptSession,getScriptSession,parseScriptUrl,storeScriptSession} from './script-session';
export {getScriptConfig,getScriptSession,saveScriptConfig,SCRIPT_SESSION_KEY,SCRIPT_CONFIG_KEY} from './script-session';
export type {ScriptConfig} from './script-session';
export class ScriptLoginRequired extends Error{constructor(){super('Sesi dashboard berakhir. Masukkan password untuk masuk kembali.');}}
type Reply={ok:boolean;code?:string;message?:string;data?:unknown};
type Pending={resolve:(r:Reply)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>};

// HTML Service supplies google.script.run inside its own sandbox. Messages avoid
// cross-origin fetch redirects and never place passwords or tokens in URLs.
class ScriptBridge{
  url:string;channel=crypto.randomUUID();frame:HTMLIFrameElement;source:Window|null=null;origin='';
  pending=new Map<string,Pending>();ready:Promise<void>;stop:()=>void;
  constructor(url:string){
    this.url=parseScriptUrl(url);this.frame=document.createElement('iframe');
    this.frame.hidden=true;this.frame.title='Koneksi penyimpanan Lunas';this.frame.referrerPolicy='no-referrer';
    let readyResolve:()=>void,readyReject:(e:Error)=>void;
    this.ready=new Promise<void>((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
    const timer=setTimeout(()=>{this.stop();readyReject(new Error('Penghubung belum dapat dibuka. Periksa URL /exec dan deployment Apps Script: Execute as Me, akses Anyone.'));},30000);
    const listener=(event:MessageEvent)=>{
      let origin:URL;try{origin=new URL(event.origin);}catch{return;}
      if(origin.protocol!=='https:'||!(origin.hostname==='script.google.com'||origin.hostname==='script.googleusercontent.com'||origin.hostname.endsWith('-script.googleusercontent.com')))return;
      const message=event.data;
      if(!message||message.channel!==this.channel||message.type!=='lunas-bridge'||!event.source)return;
      if(message.ready){if(this.source)return;this.source=event.source as Window;this.origin=event.origin;clearTimeout(timer);readyResolve();return;}
      if(event.source!==this.source||event.origin!==this.origin)return;
      const request=this.pending.get(message.id);if(!request)return;
      this.pending.delete(message.id);clearTimeout(request.timer);request.resolve(message.reply);
    };
    this.stop=()=>{clearTimeout(timer);window.removeEventListener('message',listener);this.frame.remove();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Koneksi penyimpanan diganti. Muat ulang sebelum mencoba lagi.'));}this.pending.clear();};
    window.addEventListener('message',listener);
    this.frame.src=this.url+'?channel='+encodeURIComponent(this.channel);
    document.body.append(this.frame);
  }
  async request(payload:unknown):Promise<Reply>{
    await this.ready;
    const id=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Respons penyimpanan belum diterima. Muat ulang untuk memeriksa apakah perubahan sudah tercatat sebelum mencoba lagi.'));},40000);
      this.pending.set(id,{resolve,reject,timer});
      this.source!.postMessage({type:'lunas-request',channel:this.channel,id,payload},this.origin);
    });
  }
}
let bridge:ScriptBridge|null=null;
async function request(url:string,payload:unknown){
  if(!bridge||bridge.url!==url){bridge?.stop();bridge=new ScriptBridge(url);}
  const target=bridge;
  let reply:Reply;try{reply=await target.request(payload);}catch(error){target.stop();if(bridge===target)bridge=null;throw error;}
  if(!reply?.ok){if(reply?.code==='AUTH'){clearScriptSession();throw new ScriptLoginRequired();}throw new Error(reply?.message||'Penyimpanan tidak dapat memproses permintaan.');}
  return reply.data;
}
function token(url:string){const session=getScriptSession(url);if(!session)throw new ScriptLoginRequired();return session.token;}
export async function scriptLogin(url:string,password:string,remember:boolean){
  const data=await request(url,{method:'login',password,remember}) as {token:string;expiresAt:number};
  if(!data||typeof data.token!=='string'||!/^[\w-]{60,180}$/.test(data.token)||!Number.isFinite(data.expiresAt))throw new Error('Respons login tidak valid. Periksa versi Apps Script.');
  storeScriptSession({url,token:data.token,expiresAt:data.expiresAt},remember);
}
export async function scriptLogout(url:string){
  const session=getScriptSession(url);clearScriptSession();
  if(session)await request(url,{method:'logout',token:session.token});
}
export const scriptSheets={
  async read(url:string){const rows=await request(url,{method:'read',token:token(url)}) as unknown[][];if(!Array.isArray(rows))throw new Error('Format data spreadsheet tidak valid.');return replay(rows);},
  async write(url:string,action:Action){
    const before=await scriptSheets.read(url);
    const debtId=action.type==='add'?action.debt.id:action.type==='pay'?action.debtId:before.ledger.payments.find(p=>p.id===action.paymentId)?.debtId;
    const rows=await request(url,{method:'write',token:token(url),action,revision:before.revisions.get(debtId||'')||''}) as unknown[][];
    if(!Array.isArray(rows))throw new Error('Format respons penyimpanan tidak valid.');return replay(rows);
  }
};
