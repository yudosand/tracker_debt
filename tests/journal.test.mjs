import test from 'node:test';
import assert from 'node:assert/strict';
import {HEADERS,encodeEntry,replay} from '../src/journal.ts';
import {createSheetsClient,parseSheetId,LoginRequired,SheetsRequestError,creationMayHaveSucceeded} from '../src/google.ts';
import {stats} from '../src/debt.ts';
const id='test-spreadsheet-id-1234567890';
const debt={id:'shopee',name:'Shopee',contract:'001',principal:10000000,months:12,installment:1100000,initialPaid:4,firstDue:'2026-01-31',color:'orange'};
const add={type:'add',debt};
const pay=(number=5,eventId='payment-1')=>({type:'pay',debtId:'shopee',number,id:eventId,paidAt:'2026-05-01'});
const empty=()=>replay([HEADERS]);
const seed=()=>[HEADERS,encodeEntry(add,empty())];
test('journal replay reconstructs contracts and paid installments',()=>{const rows=seed();rows.push(encodeEntry(pay(),replay(rows)));const p=replay(rows);assert.equal(p.ledger.payments.length,1);assert.equal(stats(debt,p.ledger.payments).remaining,7700000);assert.ok(p.accepted.has('payment-1'));});
test('same event retried with another timestamp is counted once',()=>{const rows=seed(),p=replay(rows);rows.push(encodeEntry(pay(),p,'2026-05-01T00:00:00Z'));rows.push(encodeEntry(pay(),p,'2026-05-01T00:00:01Z'));assert.equal(replay(rows).ledger.payments.length,1);});
test('concurrent same-bill payments preserve both rows, apply only first',()=>{const rows=seed(),before=replay(rows);rows.push(encodeEntry(pay(),before));rows.push(encodeEntry(pay(5,'second'),before));const result=replay(rows);assert.equal(rows.length,4);assert.equal(result.ledger.payments.length,1);assert.equal(result.conflicts[0].id,'second');assert.equal(stats(debt,result.ledger.payments).remaining,7700000);});
test('revision prevents a stale tab from paying next bill after undo',()=>{const rows=seed();rows.push(encodeEntry(pay(),replay(rows)));const stale=replay(rows);rows.push(encodeEntry({type:'undo',paymentId:'payment-1'},stale));rows.push(encodeEntry(pay(6,'stale'),stale));const p=replay(rows);assert.equal(stats(debt,p.ledger.payments).count,4);assert.equal(p.conflicts[0].id,'stale');});
test('undo and repayment retain complete audit history',()=>{const rows=seed();rows.push(encodeEntry(pay(),replay(rows)));rows.push(encodeEntry({type:'undo',paymentId:'payment-1'},replay(rows)));rows.push(encodeEntry(pay(5,'replacement'),replay(rows)));const p=replay(rows);assert.equal(p.ledger.payments.length,2);assert.ok(p.ledger.payments[0].voidedAt);assert.equal(stats(debt,p.ledger.payments).count,5);assert.equal(p.conflicts.length,0);});
test('invalid headers, data and reused event IDs fail closed',()=>{assert.throws(()=>replay([['wrong']]),/Header/);const rows=seed();rows[1][6]=-1;assert.throws(()=>replay(rows),/Nominal/);const r=seed();r.push([...r[1]]);r[2][4]='Different meaning';assert.throws(()=>replay(r),/ID transaksi/);});
test('sheet URL is parsed without permitting arbitrary network destinations',()=>{assert.equal(parseSheetId('https://docs.google.com/spreadsheets/d/'+id+'/edit'),id);assert.throws(()=>parseSheetId('https://evil.example/'+id));assert.throws(()=>parseSheetId(''));});

function fixture(){
 const rows=seed(),calls=[];let loseResponse=false;
 const fetcher=async(url,options)=>{
  calls.push({url,options});assert.ok(url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/'));assert.equal(options.headers.Authorization,'Bearer test-token');
  if(options.method==='POST'){
   assert.ok(url.includes('valueInputOption=RAW'));const body=JSON.parse(options.body);rows.push(...body.values);
   if(loseResponse){loseResponse=false;throw new Error('Connection dropped after append');}
   return Response.json({updates:{updatedRows:1}});
  }
  return Response.json({values:structuredClone(rows)});
 };
 return{rows,calls,client:createSheetsClient(fetcher,()=> 'test-token'),loseNext(){loseResponse=true;}};
}
test('HTTP adapter uses append RAW and reads result before reporting success',async()=>{const f=fixture(),p=await f.client.write(id,pay());assert.equal(f.calls.length,3);assert.equal(f.calls[1].options.method,'POST');assert.ok(p.accepted.has('payment-1'));assert.equal(f.rows.length,3);});
test('lost response is recoverable without appending a duplicate payment',async()=>{const f=fixture();f.loseNext();await assert.rejects(f.client.write(id,pay()),/terputus/);assert.equal(f.rows.length,3);const p=await f.client.write(id,pay());assert.ok(p.accepted.has('payment-1'));assert.equal(f.rows.length,3);});
test('concurrent HTTP writes: exactly one payment succeeds',async()=>{const f=fixture();const results=await Promise.allSettled([f.client.write(id,pay()),f.client.write(id,pay(5,'second'))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.rows.length,4);assert.equal(replay(f.rows).ledger.payments.length,1);});
test('expired, denied, missing and rate-limited access never return demo',async()=>{for(const status of [401,403,404,429]){const client=createSheetsClient(async()=>new Response('{}',{status}),()=> 'test-token');await assert.rejects(client.read(id),status===401?LoginRequired:Error);}});
test('spreadsheet creation sends empty journal and least data required',async()=>{let call;const client=createSheetsClient(async(url,options)=>{call={url,options};return Response.json({spreadsheetId:id});},()=> 'test-token');assert.equal(await client.create(),id);const body=JSON.parse(call.options.body);assert.equal(body.sheets[0].properties.title,'Transaksi');assert.equal(body.sheets[0].data[0].rowData.length,1);assert.equal(body.sheets[0].data[0].rowData[0].values[0].userEnteredValue.stringValue,'eventId');assert.equal(call.options.headers.Authorization,'Bearer test-token');});

test('create does not force an optional locale that Google may reject',async()=>{
  const client=createSheetsClient(async(url,options)=>{
    const body=JSON.parse(options.body);
    assert.equal(body.properties.timeZone,'Asia/Jakarta');
    assert.equal(Object.hasOwn(body.properties,'locale'),false);
    assert.equal(body.sheets[0].properties.gridProperties.columnCount,HEADERS.length);
    return Response.json({spreadsheetId:id});
  },()=> 'test-token');
  assert.equal(await client.create(),id);
});

test('400 creation rejection exposes Google detail and allows retry without uncertain-file warning',async()=>{
  let calls=0;
  const client=createSheetsClient(async()=>{calls++;return Response.json({error:{message:'Invalid value at spreadsheet.properties.locale'}},{status:400});},()=> 'test-token');
  await assert.rejects(client.create(),e=>{
    assert.ok(e instanceof SheetsRequestError);assert.equal(e.status,400);
    assert.match(e.message,/Detail Google: Invalid value/);
    assert.equal(creationMayHaveSucceeded(e),false);return true;
  });
  assert.equal(calls,1);
});

test('ambiguous creation failures still require checking Drive; known rejections do not',async()=>{
  for(const status of [400,403,404,408,429,500,503]){
    const client=createSheetsClient(async()=>new Response('not JSON',{status}),()=> 'test-token');
    await assert.rejects(client.create(),e=>{
      assert.ok(e instanceof SheetsRequestError);
      assert.equal(creationMayHaveSucceeded(e),status===408||status>=500);
      assert.doesNotMatch(e.message,/SyntaxError|not JSON/);return true;
    });
  }
  const client=createSheetsClient(async()=>{throw new Error('offline');},()=> 'test-token');
  await assert.rejects(client.create(),e=>{assert.equal(creationMayHaveSucceeded(e),true);return true;});
  assert.equal(creationMayHaveSucceeded(new LoginRequired()),false);
});
