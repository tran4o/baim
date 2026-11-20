import { dismissItemView } from './helpers/hud-ui.js';
import { chooseHudVerb, chooseHudLanguage, inventoryItem, collapseInventory, expandInventory } from './helpers/hud-ui.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {browserAvailable} from './helpers/browser-availability.js';
test('c05 square actual BG/EN entry, repair, bottle, repeat, reload and scene return',{timeout:180000},async t=>{
 if(!browserAvailable(t,chromium.executablePath()))return;
 // Actual local review explicitly reuses 5173. Standalone suite/CI owns a bounded
 // ephemeral test fixture, following the other browser tests; never a service.
 let server,browser,output='';let origin=process.env.BAIM_SQUARE_PREVIEW_ORIGIN;
 if(!origin){const port=await new Promise(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});origin='http://127.0.0.1:'+port;server=spawn(process.execPath,['tools/dev-server.mjs'],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});server.stdout.on('data',v=>output+=v);server.stderr.on('data',v=>output+=v);}
 let ready=false;try{ready=(await fetch(origin)).ok;}catch{}
 const root=process.env.BAIM_SQUARE_REVIEW_DIR||'target/square-redesign-review';mkdirSync(root,{recursive:true});const report=[];
 try{
  for(let i=0;i<100&&!ready;i++){await new Promise(r=>setTimeout(r,100));try{ready=(await fetch(origin)).ok;}catch{}}assert.ok(ready,output);
  browser=await chromium.launch({headless:true});
  for(const lang of ['bg','en']){
   const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
   await page.addInitScript(()=>window.requestAnimationFrame=()=>0);await page.goto(origin+'/?play=1&testHarness=1');await page.evaluate(()=>window.__comradeCandidateTest.ready);await chooseHudLanguage(page,lang);
   const advance=ms=>page.evaluate(ms=>{const g=window.__comradeCandidateTest.game;for(let left=ms;left>0;){const s=Math.min(50,left);g.tick(g.lastTime+s);left-=s;}},ms);
   const wait=async fn=>{for(let i=0;i<200;i++){if(await page.evaluate(fn))return;await advance(250);await page.waitForTimeout(10);}throw Error('Gameplay did not settle');};
   const click=async id=>{await collapseInventory(page);const p=await page.evaluate(async id=>{const g=window.__comradeCandidateTest.game,{findTargetAt}=await import('/src/engine/SceneGeometry.js');for(let y=100;y<580;y+=8)for(let x=16;x<1260;x+=8)if(findTargetAt(g.currentScene,{x,y},t=>g.targetAvailable(t))?.id===id)return{x,y};throw Error('No target '+id);},id);await page.locator('#game').click({position:p});};
   const verb=name=>chooseHudVerb(page,name);
   const settled=()=>wait(()=>{const g=window.__comradeCandidateTest.game;return !g.player.pendingInteraction&&!g.sceneTransitionPending&&!g.player.actionSequence&&!g.sceneAction.active;});
   const choice=async key=>{const name=await page.evaluate(key=>window.__comradeCandidateTest.game.t(key),key);await page.locator('.dialogue-choice-list').getByRole('button',{name,exact:true}).click();};
   const shot=async name=>{await advance(1);await page.screenshot({path:`${root}/${lang}-${name}.png`});};
   await click('exit.apartment.to_square');await wait(()=>window.__comradeCandidateTest.game.currentScene.id==='scene.chapter1.village_square');await page.waitForTimeout(400);await shot('dry');
   await verb('talk');await click('hotspot.square.kiosk');await wait(()=>!!window.__comradeCandidateTest.game.dialogue.current);await advance(1);assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.npcDialogueSpeech.npcId),'hotspot.square.kiosk');await shot('pepa-dialogue');
   const elapsed=await page.evaluate(()=>{const g=window.__comradeCandidateTest.game;g.paused=true;return g.npcDialogueSpeech.elapsed;});await advance(2000);assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.npcDialogueSpeech.elapsed),elapsed);await page.evaluate(()=>window.__comradeCandidateTest.game.paused=false);
   await advance(30000);assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.npcSpeechAnimationTime('hotspot.square.kiosk')),null);assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.dialogue.current.id),'dialogue.penka_kiosk');await shot('pepa-listening-static');
   await choice('campaign.kiosk.choice.requirements');await advance(1);assert.notEqual(await page.evaluate(()=>window.__comradeCandidateTest.game.npcSpeechAnimationTime('hotspot.square.kiosk')),null);await shot('pepa-reply-static');await choice('campaign.kiosk.choice.leave');await advance(1);assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.npcDialogueSpeech),null);
   await click('exit.square.to_mehana');await wait(()=>window.__comradeCandidateTest.game.currentScene.id==='scene.chapter1.mehana');await verb('talk');await click('npc.mehana_waiter');await wait(()=>!!window.__comradeCandidateTest.game.dialogue.current);await choice('fountain.kiro.choice.refill');await advance(8000);await wait(()=>window.__comradeCandidateTest.game.sceneAction.state.phase==='received');await dismissItemView(page);
   await click('exit.mehana.to_square');await wait(()=>window.__comradeCandidateTest.game.currentScene.id==='scene.chapter1.village_square');
   const use=async item=>{await (await inventoryItem(page,item)).click();const label=await page.evaluate(()=>window.__comradeCandidateTest.game.t('ui.inventory.use'));await page.locator('.inventory-item-actions').getByRole('button',{name:label,exact:true}).click();await click(item==='item.sunflower_oil'?'hotspot.square.statue':'hotspot.square.fountain');await settled();};
   await use('item.sunflower_oil');assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.inventory.has('item.empty_rakia_bottle')),true);
   await verb('use');await click('hotspot.square.fountain');await settled();assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.inventory.has('item.empty_rakia_bottle')),true);
   await verb('use');await click('hotspot.square.fountain');await settled();assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.state.flags.fountainRepaired),true);await shot('repaired');
   await click('hotspot.square.fountain');await settled();await use('item.empty_rakia_bottle');assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.inventory.has('item.fountain_water_bottle')),true);await shot('filled');
   await page.reload();await page.evaluate(()=>window.__comradeCandidateTest.ready);await advance(1);assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.state.flags.fountainRepaired),true);assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.inventory.has('item.fountain_water_bottle')),true);
   await click('exit.square.to_mehana');await wait(()=>window.__comradeCandidateTest.game.currentScene.id==='scene.chapter1.mehana');await click('exit.mehana.to_square');await wait(()=>window.__comradeCandidateTest.game.currentScene.id==='scene.chapter1.village_square');await shot('return');assert.deepEqual(errors,[]);report.push({lang,errors,repair:true,bottle:true,reload:true,reentry:true});await context.close();
  }
 }catch(e){writeFileSync(root+'/failure.json',JSON.stringify({error:String(e),stack:e.stack,report,output},null,2));throw e;}
 finally{await browser?.close();server?.kill();writeFileSync(root+'/results.json',JSON.stringify({report,output},null,2));}
});
