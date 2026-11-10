// This file is bundled with the shared journal model and bridge HTML.
// All spreadsheet operations require a valid server-side dashboard session.
function doGet(e){
  const channel=String(e&&e.parameter&&e.parameter.channel||'');
  if(!/^[\w-]{20,100}$/.test(channel))return HtmlService.createHtmlOutput('Penghubung Lunas aktif. Buka dashboard untuk masuk.');
  const origin=PropertiesService.getScriptProperties().getProperty('ALLOWED_ORIGIN')||'https://yudosand.github.io';
  if(!/^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?$/.test(origin))throw new Error('ALLOWED_ORIGIN tidak valid.');
  const html=LUNAS_BRIDGE_HTML.replace('__LUNAS_ORIGIN__',JSON.stringify(origin)).replace('__LUNAS_CHANNEL__',JSON.stringify(channel));
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Editor entry point: never let anonymous web-app callers initialize the backend.
function setupLunas(){
  const active=Session.getActiveUser().getEmail(),owner=Session.getEffectiveUser().getEmail();
  if(!active||!owner||active!==owner)throw new Error('Setup hanya dapat dijalankan pemilik dari editor Apps Script.');
  setupLunas_();
}
// Run ONLY in the Apps Script editor after setting APP_PASSWORD in Script Properties.
// A trailing underscore makes this function inaccessible to google.script.run.
function setupLunas_(){
  const props=PropertiesService.getScriptProperties(),password=props.getProperty('APP_PASSWORD');
  if(!password||password.length<6||password.length>200)throw new Error('Atur APP_PASSWORD minimal 6 karakter di Project Settings > Script Properties.');
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss)throw new Error('Buka Apps Script melalui menu Ekstensi pada spreadsheet Lunas yang sudah ada.');
  const sheet=ss.getSheetByName('Transaksi');
  if(!sheet)throw new Error('Tab Transaksi tidak ditemukan. Tidak ada data yang diubah.');
  LunasCore.replay(sheet.getRange(1,1,Math.max(1,sheet.getLastRow()),16).getValues());
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    const pepper=Utilities.getUuid()+Utilities.getUuid();
    props.setProperties({SPREADSHEET_ID:ss.getId(),PASSWORD_PEPPER:pepper,PASSWORD_HASH:hashLunas_(password,pepper),ALLOWED_ORIGIN:'https://yudosand.github.io'});
    for(const key of Object.keys(props.getProperties()))if(key.startsWith('SESSION_')||key==='LOGIN_FAILURES')props.deleteProperty(key);
    props.deleteProperty('APP_PASSWORD');
  }finally{lock.releaseLock();}
  console.log('Penghubung siap. Password tersimpan sebagai hash, sesi lama dicabut, dan data Transaksi tidak diubah.');
}
function hashLunas_(value,key){return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(value),key)).replace(/=+$/,'');}
function equalLunas_(a,b){if(typeof a!=='string'||typeof b!=='string')return false;let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
function errorLunas_(code,message){const error=new Error(message);error.code=code;throw error;}
function sessionKeyLunas_(token,props){
  if(typeof token!=='string'||!/^[\w-]{60,180}$/.test(token))errorLunas_('AUTH','Silakan masuk ke dashboard.');
  return 'SESSION_'+hashLunas_(token,props.getProperty('PASSWORD_PEPPER'));
}
function requireSessionLunas_(token,props){
  const key=sessionKeyLunas_(token,props),expiresAt=Number(props.getProperty(key));
  if(!expiresAt||expiresAt<=Date.now()){props.deleteProperty(key);errorLunas_('AUTH','Sesi dashboard berakhir. Masuk kembali.');}return key;
}
function loginLunas_(request,props){
  const now=Date.now(),failures=JSON.parse(props.getProperty('LOGIN_FAILURES')||'{"count":0,"until":0}');
  if(failures.until>now&&failures.count>=8)errorLunas_('RATE','Terlalu banyak percobaan password. Tunggu 5 menit.');
  const password=request.password;
  if(typeof password!=='string'||password.length>200||!equalLunas_(hashLunas_(password,props.getProperty('PASSWORD_PEPPER')),props.getProperty('PASSWORD_HASH'))){
    const current=failures.until>now?failures:{count:0,until:now+300000};current.count++;props.setProperty('LOGIN_FAILURES',JSON.stringify(current));errorLunas_('PASSWORD','Password dashboard salah.');
  }
  props.deleteProperty('LOGIN_FAILURES');
  const sessions=Object.entries(props.getProperties()).filter(([key])=>key.startsWith('SESSION_')).sort((a,b)=>Number(a[1])-Number(b[1]));
  let live=0;for(const [key,value] of sessions){if(Number(value)<=now)props.deleteProperty(key);else live++;}
  for(const [key,value] of sessions){if(live<30)break;if(Number(value)>now){props.deleteProperty(key);live--;}}
  const token=Utilities.getUuid()+Utilities.getUuid()+Utilities.getUuid(),expiresAt=now+(request.remember===true?30*86400000:12*3600000);
  props.setProperty(sessionKeyLunas_(token,props),String(expiresAt));return {token,expiresAt};
}
function readLunas_(props){
  const sheet=SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID')).getSheetByName('Transaksi');
  if(!sheet)throw new Error('Tab Transaksi tidak ditemukan.');
  const count=sheet.getLastRow();if(count>50000)throw new Error('Jurnal melebihi 50.000 baris.');
  const rows=sheet.getRange(1,1,Math.max(count,1),16).getValues();
  const projection=LunasCore.replay(rows);return {sheet,rows,projection};
}
function canonicalLunas_(value){if(Array.isArray(value))return '['+value.map(canonicalLunas_).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalLunas_(value[key])).join(',')+'}';return JSON.stringify(value);}
function writeLunas_(request,props){
  const {sheet,rows,projection}=readLunas_(props),action=request.action;
  if(!action||!['add','pay','undo'].includes(action.type))throw new Error('Aksi tidak valid.');
  const id=LunasCore.actionId(action),existing=rows.slice(1).find(row=>row[0]===id);
  if(existing){
    if(canonicalLunas_(LunasCore.decodeEntry(existing,0).action)!==canonicalLunas_(action))throw new Error('ID transaksi digunakan untuk data berbeda.');
    if(projection.accepted.has(id))return rows;
    throw new Error('Catatan sebelumnya bentrok. Muat ulang sebelum membuat catatan baru.');
  }
  const debtId=action.type==='add'?action.debt.id:action.type==='pay'?action.debtId:projection.ledger.payments.find(p=>p.id===action.paymentId)?.debtId;
  if((projection.revisions.get(debtId)||'')!==request.revision)throw new Error('Data berubah di perangkat lain. Muat ulang sebelum mencatat pembayaran.');
  const row=LunasCore.encodeEntry(action,projection);
  // Plain text prevents Sheets from evaluating user-entered names as formulas.
  // setValues interprets leading '=' even when the column has a text format.
  if(row.some(value=>typeof value==='string'&&value.startsWith('=')))throw new Error('Nama dan nomor kontrak tidak boleh diawali tanda =.');
  if(rows.length>=50000)throw new Error('Jurnal melebihi 50.000 baris.');
  if(rows.length>=sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),100);
  sheet.getRange(rows.length+1,1,1,16).setNumberFormat('@').setValues([row]);SpreadsheetApp.flush();
  const saved=readLunas_(props);if(!saved.projection.accepted.has(id))throw new Error('Catatan belum terkonfirmasi. Muat ulang untuk memeriksa riwayat.');return saved.rows;
}
function lunasRequest(request){
  const lock=LockService.getScriptLock();
  try{
    if(!request||typeof request!=='object'||JSON.stringify(request).length>16000)throw new Error('Permintaan tidak valid.');
    lock.waitLock(30000);
    const props=PropertiesService.getScriptProperties();
    if(!props.getProperty('PASSWORD_HASH')||!props.getProperty('PASSWORD_PEPPER')||!props.getProperty('SPREADSHEET_ID'))errorLunas_('SETUP','Pemilik perlu menjalankan setupLunas terlebih dahulu.');
    if(request.method==='login')return {ok:true,data:loginLunas_(request,props)};
    const sessionKey=requireSessionLunas_(request.token,props);
    if(request.method==='logout'){props.deleteProperty(sessionKey);return {ok:true,data:null};}
    if(request.method==='read')return {ok:true,data:readLunas_(props).rows};
    if(request.method==='write')return {ok:true,data:writeLunas_(request,props)};
    throw new Error('Aksi tidak dikenal.');
  }catch(error){return {ok:false,code:error.code||'REQUEST',message:error.message||'Penyimpanan gagal.'};}
  finally{if(lock.hasLock())lock.releaseLock();}
}
