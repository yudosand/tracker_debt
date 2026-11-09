import {actionId,encodeEntry,HEADERS,replay} from './journal.ts';
import type {Projection} from './journal.ts';
import type {Action} from './debt.ts';

export type Settings={clientId:string;spreadsheetId:string};
const SETTINGS_KEY='lunas-pages-settings-v1';
const SCOPE='https://www.googleapis.com/auth/drive.file';
let accessToken='',expiresAt=0;
export class LoginRequired extends Error{constructor(){super('Sesi Google berakhir atau belum terhubung. Klik Hubungkan Google untuk melanjutkan.');}}
export function connected(){return !!accessToken&&Date.now()<expiresAt;}
export function disconnect(){accessToken='';expiresAt=0;}
export function getSettings():Settings{try{const s=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');return{clientId:typeof s.clientId==='string'?s.clientId:(import.meta.env?.VITE_GOOGLE_CLIENT_ID||''),spreadsheetId:typeof s.spreadsheetId==='string'?s.spreadsheetId:''};}catch{return{clientId:import.meta.env?.VITE_GOOGLE_CLIENT_ID||'',spreadsheetId:''};}}
export function parseSheetId(value:string){const v=value.trim(),m=v.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/);const id=m?m[1]:v;if(!/^[\w-]{20,160}$/.test(id))throw new Error('Masukkan URL atau ID spreadsheet yang valid.');return id;}
export function saveSettings(settings:Settings){if(!/^[\w-]+\.apps\.googleusercontent\.com$/.test(settings.clientId.trim()))throw new Error('Client ID Google harus berakhir .apps.googleusercontent.com. Ini bukan client secret.');const s={clientId:settings.clientId.trim(),spreadsheetId:settings.spreadsheetId?parseSheetId(settings.spreadsheetId):''};localStorage.setItem(SETTINGS_KEY,JSON.stringify(s));return s;}

type TokenResult={access_token?:string;expires_in?:number;error?:string;scope?:string};
type OAuth={initTokenClient:(config:{client_id:string;scope:string;callback:(r:TokenResult)=>void;error_callback:(e:{type:string})=>void})=>{requestAccessToken:(options:{prompt:string})=>void};hasGrantedAllScopes:(r:TokenResult,...scopes:string[])=>boolean};
declare global{interface Window{google?:{accounts:{oauth2:OAuth}}}}
export function signIn(clientId:string):Promise<void>{
  if(!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId))return Promise.reject(new Error('Simpan OAuth Client ID Google terlebih dahulu.'));
  const oauth=window.google?.accounts.oauth2;if(!oauth)return Promise.reject(new Error('Komponen login Google belum dimuat. Periksa koneksi, lalu coba lagi.'));
  // Call synchronously inside the click handler so browsers permit the popup.
  return new Promise((resolve,reject)=>{const client=oauth.initTokenClient({client_id:clientId,scope:SCOPE,callback:r=>{if(r.error||!r.access_token||!oauth.hasGrantedAllScopes(r,SCOPE)){reject(new Error('Izin akses file Google belum diberikan.'));return;}accessToken=r.access_token;expiresAt=Date.now()+Math.max(0,Number(r.expires_in||3600)-60)*1000;resolve();},error_callback:e=>reject(new Error(e.type==='popup_closed'?'Jendela login ditutup.':'Jendela login tidak dapat dibuka. Izinkan popup Google untuk website ini.'))});client.requestAccessToken({prompt:'select_account'});});
}
export function createSheetsClient(request:typeof fetch=fetch,token:()=>string=()=>{if(!connected())throw new LoginRequired();return accessToken;}){
  async function api(path:string,init:RequestInit={}){
    let r:Response;try{r=await request('https://sheets.googleapis.com/v4/spreadsheets'+path,{...init,headers:{Authorization:'Bearer '+token(),'Content-Type':'application/json'},cache:'no-store',signal:AbortSignal.timeout(25000)});}catch(e){if(e instanceof LoginRequired)throw e;throw new Error('Koneksi Google terputus. Muat ulang data untuk memeriksa apakah perubahan sudah tercatat.');}
    if(r.status===401){disconnect();throw new LoginRequired();}
    if(r.status===403)throw new Error('Akses ditolak. Pastikan Sheets API aktif dan spreadsheet dibuat melalui OAuth Client ID serta akun Google yang sama.');
    if(r.status===404)throw new Error('Spreadsheet tidak ditemukan atau belum diizinkan untuk aplikasi ini.');
    if(r.status===429)throw new Error('Batas permintaan Google tercapai. Tunggu sebentar lalu muat ulang.');
    if(!r.ok)throw new Error('Google Sheets gagal memproses permintaan ('+r.status+'). Periksa spreadsheet sebelum mencoba lagi.');
    return r.json();
  }
  async function read(id:string):Promise<Projection>{const sheet=parseSheetId(id);const body=await api('/'+sheet+'/values/'+encodeURIComponent("'Transaksi'!A1:P50001")+'?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING') as {values?:unknown[][]};const rows=body.values||[];if(rows.length>50000)throw new Error('Jurnal melebihi 50.000 baris. Arsipkan data sebelum melanjutkan.');return replay(rows);}
  async function write(id:string,action:Action):Promise<Projection>{
    const sheet=parseSheetId(id),before=await read(sheet),opId=actionId(action);
    if(before.accepted.has(opId))return before;
    if(before.conflicts.some(c=>c.id===opId))throw new Error('Transaksi ini bentrok dengan perubahan sebelumnya. Muat ulang dan buat catatan baru.');
    const row=encodeEntry(action,before);
    await api('/'+sheet+'/values/'+encodeURIComponent("'Transaksi'!A:P")+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{method:'POST',body:JSON.stringify({majorDimension:'ROWS',values:[row]})});
    const after=await read(sheet);
    if(!after.accepted.has(opId))throw new Error('Data berubah di tab atau perangkat lain. Catatan ini tidak diterapkan. Muat ulang sebelum mencoba kembali.');
    return after;
  }
  async function create():Promise<string>{
    const header={values:HEADERS.map(h=>({userEnteredValue:{stringValue:h},userEnteredFormat:{backgroundColor:{red:.15,green:.43,blue:.31},textFormat:{bold:true,foregroundColor:{red:1,green:1,blue:1}}}}))};
    const result=await api('',{method:'POST',body:JSON.stringify({properties:{title:'Lunas — Debt Tracker',locale:'id_ID',timeZone:'Asia/Jakarta'},sheets:[{properties:{title:'Transaksi',gridProperties:{rowCount:1000,columnCount:16,frozenRowCount:1}},data:[{startRow:0,startColumn:0,rowData:[header]}]},{properties:{title:'Panduan',gridProperties:{rowCount:20,columnCount:2}},data:[{rowData:[{values:[{userEnteredValue:{stringValue:'Lunas — jurnal cicilan pribadi'}}]},{values:[{userEnteredValue:{stringValue:'Gunakan dashboard untuk menambah utang, membayar, dan membatalkan catatan. Setiap aksi menambah baris di Transaksi.'}}]},{values:[{userEnteredValue:{stringValue:'Jangan menghapus, mengurutkan, atau mengubah ID/versi/waktu/aksi. Gunakan filter view saat meninjau data.'}}]},{values:[{userEnteredValue:{stringValue:'Data demo tidak disalin. File ini tetap privat sesuai izin Google Drive Anda.'}}]},{values:[{userEnteredValue:{stringValue:'Perubahan sel dibaca ulang oleh dashboard, tetapi hanya data valid yang diterapkan. Perubahan struktur atau urutan dapat membatalkan riwayat.'}}]}]}]}]})}) as {spreadsheetId:string};return parseSheetId(result.spreadsheetId);
  }
  return{read,write,create};
}
export const sheets=createSheetsClient();
