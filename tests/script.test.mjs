import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHmac,randomUUID} from 'node:crypto';
import {HEADERS,encodeEntry,replay} from '../src/journal.ts';
import {parseScriptUrl,storeScriptSession,getScriptSession,clearScriptSession,saveScriptConfig} from '../src/script-session.ts';
const password='test-password-not-for-production';
const debt={id:'d1',name:'Contoh',contract:'001',principal:10000000,months:12,installment:1100000,initialPaid:4,firstDue:'2026-01-15',color:'green'};
const source=readFileSync('public/lunas-apps-script.gs','utf8');
function backend(){
  const rows=[HEADERS,encodeEntry({type:'add',debt},replay([HEADERS]))],values={APP_PASSWORD:password};let locked=false,capacity=1000;
  const props={getProperty:k=>values[k]??null,setProperty:(k,v)=>{values[k]=v;},setProperties:o=>Object.assign(values,o),getProperties:()=>({...values}),deleteProperty:k=>delete values[k]};
  const sheet={getLastRow:()=>rows.length,getMaxRows:()=>capacity,insertRowsAfter:(_n,count)=>capacity+=count,getRange:(row,col,n,m)=>({getValues:()=>structuredClone(rows.slice(row-1,row-1+n)),setNumberFormat(){return this;},setValues(data){for(let i=0;i<data.length;i++)rows[row-1+i]=structuredClone(data[i]);}})};
  const ss={getId:()=> 'private-sheet-not-committed',getSheetByName:name=>name==='Transaksi'?sheet:null};
  const context=vm.createContext({console:{log(){}},PropertiesService:{getScriptProperties:()=>props},LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},hasLock:()=>locked,releaseLock(){locked=false;}})},SpreadsheetApp:{getActiveSpreadsheet:()=>ss,openById:()=>ss,flush(){}},Utilities:{getUuid:randomUUID,computeHmacSha256Signature:(s,key)=>createHmac('sha256',key).update(s).digest(),base64EncodeWebSafe:v=>Buffer.from(v).toString('base64url')}});
  vm.runInContext(source,context);context.setupLunas_();
  const call=request=>JSON.parse(JSON.stringify(context.lunasRequest(request)));
  const login=(remember=true)=>call({method:'login',password,remember});
  return {rows,values,context,call,login};
}
test('password setup preserves existing journal and removes plaintext password',()=>{
  const b=backend();assert.equal(b.rows.length,2);assert.equal(b.values.APP_PASSWORD,undefined);
  assert.ok(b.values.PASSWORD_HASH);assert.ok(!Object.values(b.values).includes(password));
  assert.equal(b.values.SPREADSHEET_ID,'private-sheet-not-committed');
});
test('anonymous requests cannot read, append or log out sessions',()=>{
  const b=backend();for(const method of ['read','write','writeBatch','logout'])assert.equal(b.call({method}).code,'AUTH');assert.equal(b.rows.length,2);
});

function batchFixture(){
  const b=backend();b.rows.push(encodeEntry({type:'add',debt:{...debt,id:'d2',name:'Kedua'}},replay(b.rows)));
  const token=b.login().data.token;
  const actions=[{type:'pay',id:'batch1',debtId:'d1',number:5,paidAt:'2026-05-01'},{type:'pay',id:'batch2',debtId:'d2',number:5,paidAt:'2026-05-01'}];
  const request={method:'writeBatch',token,actions,revisions:{d1:'add-d1',d2:'add-d2'}};
  return {...b,request};
}
test('bulk payments preserve individual history and can be safely retried',()=>{
  const b=batchFixture();assert.equal(b.call(b.request).ok,true);assert.equal(b.rows.length,5);
  assert.equal(b.call(b.request).ok,true);assert.equal(b.rows.length,5);
  const p=replay(b.rows);assert.equal(p.ledger.payments.length,2);assert.equal(p.conflicts.length,0);
  assert.equal(b.call({method:'write',token:b.request.token,action:{type:'undo',paymentId:'batch1'},revision:'batch1'}).ok,true);
  assert.ok(replay(b.rows).ledger.payments.find(p=>p.id==='batch1').voidedAt);
});
test('bulk validation failure leaves all debts unchanged',()=>{
  const b=batchFixture();b.request.actions[1].number=8;
  assert.equal(b.call(b.request).ok,false);assert.equal(b.rows.length,3);
  assert.equal(replay(b.rows).ledger.payments.length,0);
});
test('a second user cannot record the same batch or partially apply stale revisions',()=>{
  const b=batchFixture();const second=structuredClone(b.request);second.actions.forEach(a=>a.id+='-other');
  assert.equal(b.call({method:'write',token:b.request.token,action:b.request.actions[1],revision:'add-d2'}).ok,true);
  assert.equal(b.call(second).ok,false);assert.equal(b.rows.length,4);
  assert.equal(replay(b.rows).ledger.payments.filter(p=>p.debtId==='d1').length,0);
});
test('a lost bulk response can be recovered without duplicate rows',()=>{
  const b=batchFixture();b.context.SpreadsheetApp.flush=()=>{throw Error('Connection interrupted');};
  assert.equal(b.call(b.request).ok,false);assert.equal(b.rows.length,5);
  b.context.SpreadsheetApp.flush=()=>{};
  assert.equal(b.call(b.request).ok,true);assert.equal(b.rows.length,5);
});
test('bulk supports consecutive arrears but rejects duplicate IDs and unsupported actions',()=>{
  const b=batchFixture();b.request.actions[1]={...b.request.actions[0],id:'next',number:6};
  assert.equal(b.call(b.request).ok,true);assert.equal(replay(b.rows).ledger.payments.length,2);
  const c=batchFixture();c.request.actions[1].id=c.request.actions[0].id;
  assert.equal(c.call(c.request).ok,false);assert.equal(c.rows.length,3);
  c.request.actions=[{type:'undo',paymentId:'batch1'}];assert.equal(c.call(c.request).ok,false);
  c.request.actions=[];assert.equal(c.call(c.request).ok,false);
  c.request.actions=Array.from({length:501},()=>({type:'pay'}));assert.equal(c.call(c.request).ok,false);
});
test('bulk retries reject changed payment details and partial saved batches',()=>{
  const b=batchFixture();assert.equal(b.call(b.request).ok,true);
  b.request.actions[0].paidAt='2026-05-02';assert.equal(b.call(b.request).ok,false);assert.equal(b.rows.length,5);
  const c=batchFixture();assert.equal(c.call({method:'write',token:c.request.token,action:c.request.actions[0],revision:'add-d1'}).ok,true);
  assert.equal(c.call(c.request).ok,false);assert.equal(c.rows.length,4);
});

test('six-character PINs work while shorter values are rejected',()=>{
  const b=backend();b.values.APP_PASSWORD='12345';assert.throws(()=>b.context.setupLunas_(),/minimal 6/);
  b.values.APP_PASSWORD='629417';b.context.setupLunas_();
  assert.equal(b.call({method:'login',password:'629417'}).ok,true);
  assert.equal(b.values.APP_PASSWORD,undefined);
});

test('public setup entry rejects anonymous callers and other accounts',()=>{
  const b=backend(),hash=b.values.PASSWORD_HASH;
  for(const email of ['', 'other@example.com']){
    b.context.Session={getActiveUser:()=>({getEmail:()=>email}),getEffectiveUser:()=>({getEmail:()=> 'owner@example.com'})};
    assert.throws(()=>b.context.setupLunas(),/pemilik/);
    assert.throws(()=>b.context.checkLunas(),/pemilik/);
    assert.equal(b.values.PASSWORD_HASH,hash);assert.equal(b.rows.length,2);
  }
  b.context.Session={getActiveUser:()=>({getEmail:()=> 'owner@example.com'}),getEffectiveUser:()=>({getEmail:()=> 'owner@example.com'})};
  b.values.APP_PASSWORD=password;b.context.setupLunas();assert.notEqual(b.values.PASSWORD_HASH,hash);
  b.context.checkLunas();assert.equal(b.rows.length,2);
});
test('login, expiry, logout and password rotation are enforced on the server',()=>{
  const b=backend(),r=b.login();assert.equal(r.ok,true);assert.ok(r.data.expiresAt>Date.now()+29*86400000);
  assert.equal(b.call({method:'read',token:r.data.token}).data.length,2);
  assert.equal(b.call({method:'logout',token:r.data.token}).ok,true);assert.equal(b.call({method:'read',token:r.data.token}).code,'AUTH');
  const short=b.login(false).data;assert.ok(short.expiresAt<Date.now()+13*3600000);
  for(const key of Object.keys(b.values))if(key.startsWith('SESSION_'))b.values[key]='1';
  assert.equal(b.call({method:'read',token:short.token}).code,'AUTH');
  const old=b.login().data;b.values.APP_PASSWORD='different-long-password';b.context.setupLunas_();
  assert.equal(b.call({method:'read',token:old.token}).code,'AUTH');assert.equal(b.login().code,'PASSWORD');
});
test('password guessing is limited and sessions store only token hashes',()=>{
  const b=backend(),r=b.login();assert.ok(!Object.values(b.values).includes(r.data.token));
  for(let i=0;i<8;i++)assert.equal(b.call({method:'login',password:'wrong'}).code,'PASSWORD');
  assert.equal(b.login().code,'RATE');
  assert.equal(b.call({method:'read',token:r.data.token}).ok,true);
});
test('two users cannot duplicate an installment; retries and undo preserve the existing format',()=>{
  const b=backend(),one=b.login().data.token,two=b.login().data.token;
  const action={type:'pay',id:'p1',debtId:'d1',number:5,paidAt:'2026-05-01'},revision='add-d1';
  assert.equal(b.call({method:'write',token:one,action,revision}).ok,true);
  assert.equal(b.call({method:'write',token:one,action,revision}).ok,true);assert.equal(b.rows.length,3);
  assert.equal(b.call({method:'write',token:two,action:{...action,id:'p2'},revision}).ok,false);assert.equal(b.rows.length,3);
  assert.equal(b.call({method:'write',token:one,action:{...action,number:6},revision:'p1'}).ok,false);
  assert.equal(b.call({method:'write',token:two,action:{type:'undo',paymentId:'p1'},revision:'p1'}).ok,true);
  assert.equal(replay(b.rows).ledger.payments[0].voidedAt.length>0,true);
  assert.equal(b.call({method:'write',token:one,action:{...action,id:'p3'},revision:'undo-p1'}).ok,true);
  assert.equal(replay(b.rows).ledger.payments.filter(p=>!p.voidedAt).length,1);
});
test('backend rejects invalid money and spreadsheet formulas before appending',()=>{
  const b=backend(),token=b.login().data.token;
  for(const d of [{...debt,id:'bad1',principal:-1},{...debt,id:'bad2',name:'=IMPORTXML("https://example.com")'}]){
    assert.equal(b.call({method:'write',token,action:{type:'add',debt:d},revision:''}).ok,false);
  }
  assert.equal(b.rows.length,2);
});
function memoryStorage(){const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
test('remembered session survives new tabs and is bound to the configured endpoint',()=>{
  globalThis.localStorage=memoryStorage();globalThis.sessionStorage=memoryStorage();
  const url='https://script.google.com/macros/s/abcdefghijklmnopqrstuvwx/exec';
  assert.equal(parseScriptUrl(url+'?ignored=1'),url);assert.throws(()=>parseScriptUrl('https://example.com/macros/s/abcdefghijklmnopqrstuvwx/exec'));
  assert.throws(()=>parseScriptUrl(url.replace('/exec','/dev')));
  saveScriptConfig(url);const session={url,token:'a'.repeat(80),expiresAt:Date.now()+86400000};
  storeScriptSession(session,true);globalThis.sessionStorage=memoryStorage();assert.deepEqual(getScriptSession(url),session);
  assert.equal(getScriptSession(url.replace('abcdef','ghijkl')),null);
  clearScriptSession();assert.equal(getScriptSession(url),null);
  storeScriptSession(session,false);assert.deepEqual(getScriptSession(url),session);
  globalThis.sessionStorage=memoryStorage();assert.equal(getScriptSession(url),null);
  storeScriptSession({...session,expiresAt:1},true);assert.equal(getScriptSession(url),null);
});
