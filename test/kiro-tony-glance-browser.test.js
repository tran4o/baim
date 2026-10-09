import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {browserAvailable} from './helpers/browser-availability.js';

test('c05 Tony hint plays once in BG/EN, settles to listener and survives pause, interruption and scene return',{timeout:180000},async t=>{
 if(!browserAvailable(t,chromium.executablePath()))return;
 const port=await new Promise(resolve=>{const probe=createServer();probe.listen(0,'127.0.0.1',()=>{const p=probe.address().port;probe.close(()=>resolve(p));});});
 const origin=`http://127.0.0.1:${port}`;
 const server=spawn(process.execPath,['tools/dev-server.mjs'],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 let serverOutput='';server.stdout.on('data',v=>serverOutput+=v);server.stderr.on('data',v=>serverOutput+=v);
 const evidence='target/ludo-review/kiro-tony-glance-c05/browser';mkdirSync(evidence,{recursive:true});
 const report={languages:[],nativeDurationMs:4032,authoredReadingWindows:true};let browser;
 try{
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(origin)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}assert.ok(ready,serverOutput);
  browser=await chromium.launch({headless:true});
  for(const language of ['bg','en']){
   const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
   const page=await context.newPage(),errors=[],failed=[];
   page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>failed.push(r.url()));page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
   await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
   await page.goto(origin+'/?play=1&testHarness=1');await page.evaluate(()=>window.__comradeCandidateTest.ready);
   await page.evaluate(async language=>{
    const {game}=window.__comradeCandidateTest;game.setLanguage(language);await game.changeScene('scene.chapter1.mehana');game.protectCurrentAssetWorkingSet();await game.assets.preloadSceneAssets(game.currentScene.id);await game.assets.preloadCharacterSlots(game.player.id,game.bootstrapCharacterSlots());
    const layer=game.currentScene.foregroundLayers.find(l=>l.id==='layer.mehana.waiter_idle');window.__glanceLayer=layer;
    window.__glanceView=()=>game.sceneNpcSpeech.presentation(game.currentScene.id,layer);
    window.__advanceGlance=ms=>{let remaining=ms;while(remaining>0){const step=Math.min(21,remaining);game.tick(game.lastTime+step);remaining-=step;}if(ms===0)game.tick(game.lastTime);return window.__glanceView();};
    window.__hint=()=>{game.dialogue.start('dialogue.mehana_waiter');game.dialogue.enterNode('tony_weakness');game.renderUi();return window.__advanceGlance(0);};
    window.__counterGlance=()=>Array.from(game.canvas.getContext('2d').getImageData(720,343,105,13).data);
    game.sceneIdleVariations.random=()=>0;window.__advanceGlance(0);
   },language);
   const counter=await page.evaluate(()=>window.__counterGlance());
   assert.equal((await page.evaluate(()=>window.__hint())).phase,'reacting');
   const seconds=await page.evaluate(()=>window.__comradeCandidateTest.game.npcDialogueSpeech.visibleSeconds);assert.equal(seconds,6);
   const indices=[];
   for(let i=0;i<64;i++){
    const v=await page.evaluate(ms=>window.__advanceGlance(ms),i?63:0);assert.equal(v.phase,'reacting');assert.ok(Math.abs(v.reaction.elapsed-i*63)<.001);
    indices.push(i);assert.deepEqual(await page.evaluate(()=>window.__counterGlance()),counter);
    await page.screenshot({path:`${evidence}/${language}-frame-${String(i).padStart(2,'0')}.png`});
   }
   assert.equal((await page.evaluate(()=>window.__advanceGlance(63))).phase,'speaking');
   await page.screenshot({path:`${evidence}/${language}-return-to-speech.png`});
   assert.equal((await page.evaluate(()=>window.__advanceGlance(2400))).phase,'listening');
   await page.screenshot({path:`${evidence}/${language}-choices-listening.png`});
   const held=await page.evaluate(()=>{const {game}=window.__comradeCandidateTest;return Array.from(game.canvas.getContext('2d').getImageData(727,220,100,100).data);});
   await page.evaluate(()=>window.__advanceGlance(5000));assert.deepEqual(await page.evaluate(()=>{const {game}=window.__comradeCandidateTest;return Array.from(game.canvas.getContext('2d').getImageData(727,220,100,100).data);}),held);
   await page.evaluate(()=>{const {game}=window.__comradeCandidateTest;game.dialogue.enterNode('people');game.renderUi();window.__advanceGlance(0);});assert.equal((await page.evaluate(()=>window.__glanceView())).phase,'speaking');
   await page.evaluate(()=>{const {game}=window.__comradeCandidateTest;game.dialogue.enterNode('tony_weakness');game.renderUi();window.__advanceGlance(0);window.__advanceGlance(700);game.paused=true;});
   const paused=await page.evaluate(()=>window.__glanceView());assert.deepEqual(await page.evaluate(()=>window.__advanceGlance(10000)),paused);
   await page.evaluate(()=>{const {game}=window.__comradeCandidateTest;game.paused=false;game.menuOpen=true;});assert.deepEqual(await page.evaluate(()=>window.__advanceGlance(10000)),paused);
   await page.evaluate(()=>{const {game}=window.__comradeCandidateTest;game.menuOpen=false;game.dialogue.enterNode('people');game.renderUi();window.__advanceGlance(0);});assert.equal((await page.evaluate(()=>window.__glanceView())).phase,'speaking');
   const fallback=await page.evaluate(()=>{
    const {game}=window.__comradeCandidateTest;const image=game.assets.getSceneImage(game.currentScene.id,window.__glanceLayer.speechAnimation.nodeReactions.tony_weakness.asset);
    image.dataset.loaded='false';game.dialogue.enterNode('tony_weakness');game.renderUi();window.__advanceGlance(0);const missing=window.__glanceView().phase;image.dataset.loaded='true';window.__advanceGlance(500);return {missing,late:window.__glanceView().phase};
   });assert.deepEqual(fallback,{missing:'speaking',late:'speaking'});
   await page.evaluate(()=>{const {game}=window.__comradeCandidateTest;game.dialogue.close();game.renderUi();window.__advanceGlance(400);});assert.equal((await page.evaluate(()=>window.__glanceView())).phase,'idle');await page.screenshot({path:`${evidence}/${language}-closed.png`});
   await page.evaluate(async()=>{const {game}=window.__comradeCandidateTest;window.__hint();window.__advanceGlance(500);await game.changeScene('scene.chapter1.village_square');await game.changeScene('scene.chapter1.mehana');game.protectCurrentAssetWorkingSet();await game.assets.preloadSceneAssets(game.currentScene.id);window.__advanceGlance(0);});
   assert.notEqual((await page.evaluate(()=>window.__glanceView())).phase,'reacting');
   const paths=await page.evaluate(()=>{const {game}=window.__comradeCandidateTest;return [...Object.values(game.assets.manifest.scenes[game.currentScene.id]),...Object.values(game.assets.manifest.items).flatMap(v=>Object.values(v))].filter(v=>typeof v==='string'&&/\.(png|webp)$/.test(v));});
   const decodeContext=await browser.newContext();const decodePage=await decodeContext.newPage();
   const assets=await decodePage.evaluate(async({paths,origin})=>{const results=[];for(const path of paths){const image=new Image();image.src=new URL(path,origin).href;try{await image.decode();const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;canvas.getContext('2d').drawImage(image,0,0,1,1);results.push({path,ok:image.naturalWidth>0});}catch(e){results.push({path,ok:false,error:String(e)});}image.src='';}return results;},{paths,origin});
   await decodeContext.close();assert.ok(assets.length>30);assert.deepEqual(assets.filter(v=>!v.ok),[]);
   assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);report.languages.push({language,indices,readingSeconds:seconds,decodedAssets:assets.length,errors,failed});await context.close();
  }
 }finally{writeFileSync(evidence+'/report.json',JSON.stringify(report,null,2)+'\n');await browser?.close();server.kill();}
});
