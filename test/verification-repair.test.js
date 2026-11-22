import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {stripNortheastKiosk} from './helpers/northeast-kiosk-preservation.js';
import {stripPortraitClothesR48} from './helpers/portrait-clothes-r48-preservation.js';
import {stripCentreFacing} from './helpers/centre-facing-preservation.js';
import {observeImageDecode} from './helpers/image-decode-diagnostics.js';
import {stripTavernPageLifetime} from './helpers/tavern-page-lifetime-preservation.js';
const sha=value=>createHash('sha256').update(value).digest('hex');
const contract=JSON.parse(readFileSync('test/fixtures/verification-repair-contract.json'));

test('exact stop-test inverse reaches the unchanged historical catalog inventory through the full chain',()=>{
 const record=contract.checkedStopTest,file=record.file,current=readFileSync(file),restored=stripNortheastKiosk(file,current),catalogBytes=readFileSync('test/fixtures/walking-catalog-promotion.json'),catalog=JSON.parse(catalogBytes);
 assert.equal(sha(catalogBytes),record.oldCatalogFixtureSHA256,'Historical inventory itself stays immutable');
 const priorStopTest=stripPortraitClothesR48(file,current);
 assert.equal(sha(priorStopTest),record.afterSHA256);assert.equal(sha(restored),record.beforeSHA256);
 assert.equal(sha(stripCentreFacing(file,current)),catalog.acceptedRuntimeSHA256[file]);
 assert.equal(Buffer.from(restored).toString().replaceAll('{x:430,y:430}','{x:442.5,y:477.5}').replaceAll('{x:1090,y:630}','{x:1077.5,y:655}'),priorStopTest.toString());
});

test('stop-test inverse rejects extra bytes, different stop values and already-old unbound input',()=>{
 const r=contract.checkedStopTest,bytes=readFileSync(r.file),old=stripNortheastKiosk(r.file,bytes);
 for(const bad of [Buffer.concat([bytes,Buffer.from('\n// unbound edit')]),bytes.toString().replace('{x:442.5,y:477.5}','{x:442.6,y:477.5}'),old])assert.throws(()=>stripCentreFacing(r.file,bad),/exact scene fix northeast kiosk inverse/);
 const unrelated=Buffer.from('unchanged');assert.equal(stripNortheastKiosk('unrelated/test.js',unrelated),unrelated);
});

test('diagnostic harness retains every original assertion, readiness block and one independent decode',()=>{
 const r=contract.diagnosticHarness,source=stripTavernPageLifetime(readFileSync(r.file,'utf8'));assert.equal(sha(source),r.afterSHA256,'Instrumentation has its own explicit current binding');
 assert.deepEqual(source.match(/assert\.[\s\S]*?;/g)||[],r.originalAssertions);assert.ok(source.includes(r.readinessBlock));
 assert.equal((source.match(/await im\.decode\(\)/g)||[]).length,r.decodeCallsPerLanguage);assert.ok(source.includes('{timeout:'+r.timeoutMs+'}'));
 assert.ok(source.includes("normal.goto(origin+'/?play=1')"));assert.ok(source.includes('throw error;'));
});

test('finished harness page is closed before normal game boot, without changing the historical diagnostic',()=>{
 const current=readFileSync(contract.diagnosticHarness.file,'utf8'),old=stripTavernPageLifetime(current);
 assert.equal(sha(old),contract.diagnosticHarness.afterSHA256);
 const close=current.indexOf('await page.close();assert.equal(page.isClosed(),true);'),open=current.indexOf('const normal=await context.newPage();');
 assert.ok(close>0&&open>close);assert.ok(current.includes("await page.waitForLoadState('networkidle');await page.close()"));
 const navigation=current.indexOf("await normal.goto(origin+'/?play=1')"),paint=current.indexOf('await normal.waitForFunction('),independent=current.indexOf('let normalBinding;');
 assert.ok(navigation<paint&&paint<independent,'actual game paint precedes independent decode');
 assert.ok(current.includes("c.getContext('2d').getImageData(600,350,1,1).data[3]>0"));
 assert.throws(()=>stripTavernPageLifetime(current.replace('data[3]>0','data[3]>=0')),/exact tavern page-lifetime/);
 assert.throws(()=>stripTavernPageLifetime(current+'\n'),/exact tavern page-lifetime/);
 assert.throws(()=>stripTavernPageLifetime(current.replace('await page.close()','await normal.close()')),/exact tavern page-lifetime/);
});

const fakePage=()=>{const page=new EventEmitter();page.viewportSize=()=>({width:1280,height:720});Object.defineProperty(page,'request',{get(){throw Error('Observer must not initiate network requests');}});return page;};
const request=url=>({url:()=>url,method:()=> 'GET',resourceType:()=> 'image',timing:()=>({startTime:1,responseEnd:2}),failure:()=>({errorText:'net::ERR_FAILED'})});
const response=(req,body,headers={})=>({url:req.url,request:()=>req,status:()=>200,headers:()=>({'content-type':'image/webp','content-length':'3',...headers}),fromServiceWorker:()=>false,body});

test('decode observer binds existing request response bytes/hash/MIME and stage without a duplicate request',async()=>{
 const page=fakePage(),observer=observeImageDecode(page,{origin:'http://127.0.0.1:5173',language:'bg',browserVersion:'test'}),req=request('http://127.0.0.1:5173/target/runtime-assets/kiro-spitting-fixed-owner-export-c01.123456abcdef.webp');observer.mark('independent-decode');page.emit('request',req);page.emit('response',response(req,async()=>Buffer.from('abc')));page.emit('requestfinished',req);await observer.flush();const record=observer.snapshot().requests[0];assert.equal(record.stage,'independent-decode');assert.equal(record.status,200);assert.equal(record.responseBytes,3);assert.equal(record.responseSHA256,sha('abc'));assert.equal(record.mime,'image/webp');assert.equal(record.bodyState,'captured');assert.equal(record.exactURL,true);assert.deepEqual(record.timing,{startTime:1,responseEnd:2});observer.detach();assert.equal(page.listenerCount('response'),0);
});

test('decode observer preserves request failure/body-unavailable evidence and excludes sensitive headers/queries',async()=>{
 const page=fakePage(),observer=observeImageDecode(page,{origin:'http://127.0.0.1:5173',language:'en',browserVersion:'test'}),req=request('http://127.0.0.1:5173/target/runtime-assets/manifest.json?secret=do-not-log');page.emit('request',req);page.emit('response',response(req,async()=>{throw Error('Body unavailable');},{authorization:'do-not-log','set-cookie':'do-not-log'}));page.emit('requestfailed',req);await observer.flush();const snapshot=observer.snapshot(),record=snapshot.requests[0];assert.equal(record.failure,'net::ERR_FAILED');assert.equal(record.bodyState,'unavailable');assert.equal(record.bodyError,'Body unavailable');assert.equal(record.queryRedacted,true);assert.equal(record.exactURL,false);assert.ok(!JSON.stringify(snapshot).includes('do-not-log'));observer.detach();
});
