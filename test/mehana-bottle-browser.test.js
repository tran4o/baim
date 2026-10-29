import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {browserAvailable} from './helpers/browser-availability.js';

// Actual UI progression. The manual test clock permits repeatable motion captures;
// it does not grant items, set quest flags, or invoke interaction methods.
test('Mehana bottle chain through actual BG/EN gameplay, inspection, save/load and prior art', {timeout:300000}, async t=>{
 if(!browserAvailable(t,chromium.executablePath()))return;
 const port=await new Promise(resolve=>{const p=createServer();p.listen(0,'127.0.0.1',()=>{const port=p.address().port;p.close(()=>resolve(port));});});
 const server=spawn(process.execPath,['tools/dev-server.mjs'],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 let output='';server.stdout.on('data',s=>output+=s);server.stderr.on('data',s=>output+=s);
 const root=process.env.BAIM_BOTTLE_REVIEW_DIR||('target/mehana-bottle-review-'+Date.now());mkdirSync(root,{recursive:true});
 const report={nativeHandoverMs:7371,manualClock:true,sampleMs:125,readingHolds:true,languages:[]};let browser;
 try{
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(`http://127.0.0.1:${port}/`)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}assert.ok(ready,output);
  browser=await chromium.launch({headless:true});
  for(const language of ['bg','en']){
   t.diagnostic(language+': begin fresh actual-click bottle chain');
   const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'}),page=await context.newPage();
   const errors=[],failed=[],frames=[];let phase='startup';const receiptTrace=[];for(const event of ['request','requestfinished','requestfailed'])page.on(event,r=>{if(r.url().includes('suspicious-receipt'))receiptTrace.push({event,phase,time:Date.now(),url:r.url()});});page.on('pageerror',e=>errors.push(String(e)));page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText,phase}));page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
   await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
   const url=`http://127.0.0.1:${port}/?play=1&testHarness=1`;await page.goto(url);await page.evaluate(()=>window.__comradeCandidateTest.ready);
   await page.evaluate(language=>window.__comradeCandidateTest.game.setLanguage(language),language);
   const advance=ms=>page.evaluate(ms=>{const g=window.__comradeCandidateTest.game;let left=ms;do{const step=Math.min(50,left);g.tick(g.lastTime+step);left-=step;}while(left>0);},ms);
   const wait=async(predicate,label)=>{for(let i=0;i<160;i++){if(await page.evaluate(predicate))return;await advance(250);await page.waitForTimeout(20);}throw Error('Timed out: '+label);};
   const choice=async key=>{const label=await page.evaluate(key=>window.__comradeCandidateTest.game.t(key),key);await page.locator('.dialogue-choice-list').getByRole('button',{name:label,exact:true}).click();};
   const verb=async name=>{const label=await page.evaluate(name=>window.__comradeCandidateTest.game.t('verb.'+name),name);for(let i=0;i<4;i++){if(await page.locator('.hud-verb').textContent()===label)return;await page.locator('.hud-verb').click();}assert.fail(name);};
   const click=async id=>{const point=await page.evaluate(async id=>{const g=window.__comradeCandidateTest.game;const {findTargetAt}=await import('/src/engine/SceneGeometry.js');const points=[];for(let y=80;y<580;y+=8)for(let x=16;x<1260;x+=8)if(findTargetAt(g.currentScene,{x,y},t=>g.targetAvailable(t))?.id===id)points.push({x,y});if(!points.length)throw Error('No exposed target '+id);return points[Math.floor(points.length/2)];},id);await page.locator('#game').click({position:point});};
   const settled=()=>wait(()=>{const g=window.__comradeCandidateTest.game;return !g.player.pendingInteraction&&!g.player.actionSequence&&!g.sceneTransitionPending&&!g.sceneAction.active;},'interaction settles');
   const go=async(id,scene)=>{await click(id);await wait(()=>!window.__comradeCandidateTest.game.sceneTransitionPending&&window.__comradeCandidateTest.game.currentScene.id===window.__expectedScene,'scene '+scene);};
   // Set only the expected assertion value, never game state.
   const exit=async(id,scene)=>{await page.evaluate(scene=>window.__expectedScene=scene,scene);await go(id,scene);};
   const talk=async id=>{await verb('talk');await click(id);await wait(()=>!!window.__comradeCandidateTest.game.dialogue.current,'dialogue');};
   const itemAction=async(id,key)=>{await page.locator('[data-item-id="'+id+'"]').click();const label=await page.evaluate(key=>window.__comradeCandidateTest.game.t(key),key);await page.locator('.inventory-item-actions').getByRole('button',{name:label,exact:true}).click();};
   const use=async(id,target)=>{await itemAction(id,'ui.inventory.use');await click(target);await settled();};
   const shot=async(name,durationMs=1500)=>{phase=name;await advance(0);const path=`${root}/${language}-${String(frames.length).padStart(3,'0')}-${name}.png`;await page.screenshot({path});frames.push({path,durationMs,name});};
   const snapshot=()=>page.evaluate(()=>{const g=window.__comradeCandidateTest.game;return structuredClone(g.state);});
   const reload=async()=>{phase='reload-start';const before=await snapshot();await page.locator('img').evaluateAll(images=>Promise.all(images.filter(i=>i.src).map(i=>i.decode())));await page.waitForLoadState('networkidle');phase='reload-navigation';await page.reload();phase='reload-ready';await page.evaluate(()=>window.__comradeCandidateTest.ready);await advance(0);const after=await snapshot();assert.deepEqual(after.inventory,before.inventory);for(const k of ['tonyVote','babaStoyankaVote','swappedOwnRakiaWithWater','influence','suspicion'])assert.equal(after[k],before[k]);};
   assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.inventory.has('item.accordion')),false,'bottle journey needs no accordion');
   await exit('exit.apartment.to_square','scene.chapter1.village_square');
   await exit('exit.square.to_mehana','scene.chapter1.mehana');
   assert.equal(await page.evaluate(()=>{const g=window.__comradeCandidateTest.game;return g.targetAvailable(g.currentScene.interactables.find(t=>t.id==='hotspot.mehana.oil'));}),false);
   await talk('npc.mehana_waiter');await shot('order');await choice('fountain.kiro.choice.refill');await advance(0);
   assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.sceneAction.state.phase),'playing');
   const paused=await page.evaluate(()=>{const g=window.__comradeCandidateTest.game;g.paused=true;return g.sceneAction.state.elapsedMs;});await advance(2000);assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.sceneAction.state.elapsedMs),paused);
   await page.evaluate(()=>{const g=window.__comradeCandidateTest.game;g.paused=false;g.menuOpen=true;g.renderUi();});await advance(2000);assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.sceneAction.state.elapsedMs),paused);
   await page.evaluate(()=>{const g=window.__comradeCandidateTest.game;g.menuOpen=false;g.renderUi();});
   for(let ms=0;ms<7371;ms+=125){if(ms)await advance(125);await shot('handover',Math.min(125,7371-ms));}
   await advance(7371%125);await wait(()=>window.__comradeCandidateTest.game.sceneAction.state.phase==='received','receipt');
   await page.locator('.item-model-viewer[data-model-state=ready]').waitFor();await shot('oil-receipt');
   await page.locator('.received-item-screen > button:last-child').click();await reload();
   await itemAction('item.sunflower_oil','ui.inventory.use_on_self');assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.inventory.has('item.sunflower_oil')),true);
   await exit('exit.mehana.to_square','scene.chapter1.village_square');await use('item.sunflower_oil','hotspot.square.statue');
   assert.deepEqual((await snapshot()).inventory.filter(id=>id.includes('bottle')||id==='item.sunflower_oil'),['item.empty_rakia_bottle']);await shot('oil-applied-empty-kept');await reload();
   await verb('use');await click('hotspot.square.fountain');await settled();assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.inventory.has('item.empty_rakia_bottle')),true);await shot('ordinary-use-keeps-empty');
   await itemAction('item.empty_rakia_bottle','ui.inventory.inspect');await page.locator('.item-model-viewer[data-model-state=ready]').waitFor();await shot('empty-inspection');
   const inspectInventory=(await snapshot()).inventory;await page.locator('.item-model-viewer canvas').evaluate(c=>c.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));await page.locator('.item-model-viewer[data-model-state=fallback] img').waitFor();await page.waitForFunction(()=>document.querySelector('.item-model-viewer img')?.naturalWidth>0);await shot('empty-fallback');await page.locator('.received-item-screen > button:last-child').click();assert.deepEqual((await snapshot()).inventory,inspectInventory);
   await verb('use');await click('hotspot.square.fountain');await settled();assert.equal((await snapshot()).flags.fountainRepaired,true);await shot('fountain-running');
   await use('item.empty_rakia_bottle','hotspot.square.fountain');await shot('fountain-filled');await reload();
   await itemAction('item.fountain_water_bottle','ui.inventory.inspect');await page.locator('.item-model-viewer[data-model-state=ready]').waitFor();await shot('water-inspection');
   const viewer=page.locator('.item-model-viewer');const canvas=viewer.locator('canvas'),box=await canvas.boundingBox();const orientation=await viewer.getAttribute('data-orientation');await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+90,box.y+box.height/2+70,{steps:2});await page.mouse.up();assert.notEqual(await viewer.getAttribute('data-orientation'),orientation);await canvas.hover();await page.mouse.wheel(0,-2000);await page.waitForFunction(()=>Number(document.querySelector('.item-model-viewer').dataset.zoom)>1);assert.ok(Math.abs(Number(await viewer.getAttribute('data-pitch')))<=Math.PI/12+.00001);await shot('water-controls');
   await canvas.evaluate(c=>c.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));await page.locator('.item-model-viewer[data-model-state=fallback] img').waitFor();await page.waitForFunction(()=>document.querySelector('.item-model-viewer img')?.naturalWidth>0);await shot('water-fallback');await page.locator('.received-item-screen > button:last-child').click();
   await talk('npc.baba_stoyanka');await choice('fountain.baba.choice.report');await shot('baba-support');
   await exit('exit.square.to_mehana','scene.chapter1.mehana');await talk('npc.tony_fridge');await choice('dialogue.tony.choice.challenge');await choice('dialogue.tony.choice.accept');await choice('dialogue.tony.choice.prepare');
   const suspicion=(await snapshot()).suspicion;
   await talk('npc.mehana_waiter');await choice('dialogue.waiter.choice.water');await settled();assert.equal(Boolean((await snapshot()).flags.tonyDistracted),false);
   await use('item.glass_of_water','hotspot.mehana.bai_mitko_rakia_glass');assert.equal((await snapshot()).swappedOwnRakiaWithWater,false);assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.inventory.has('item.glass_of_water')),true);await shot('glass-shortcut-refused');
   await use('item.fountain_water_bottle','hotspot.mehana.bai_mitko_rakia_glass');assert.equal((await snapshot()).swappedOwnRakiaWithWater,true);assert.equal((await snapshot()).suspicion,suspicion);assert.equal(Boolean((await snapshot()).flags.pepaMusicPlayed),false);assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.inventory.has('item.empty_rakia_bottle')),true);await shot('contest-prepared');await reload();
   await talk('npc.tony_fridge');await choice('dialogue.tony.choice.finish_challenge');
   assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.dialogue.current),null,'blackout closes the contest dialogue');
   await wait(()=>{const g=window.__comradeCandidateTest.game;return g.state.flags.tonyPassedOut&&!g.sceneAction.active;},'contest blackout completes');
   assert.equal((await snapshot()).tonyVote,true);await shot('contest-result');await page.waitForLoadState('networkidle');await page.locator('img').evaluateAll(images=>Promise.all(images.filter(i=>i.src).map(i=>i.decode())));phase='contest-complete';await reload();
   await exit('exit.mehana.to_square','scene.chapter1.village_square');await use('item.empty_rakia_bottle','hotspot.square.fountain');await exit('exit.square.to_mehana','scene.chapter1.mehana');assert.equal((await snapshot()).tonyVote,true);await shot('scene-return');
   const paths=await page.evaluate(()=>{const g=window.__comradeCandidateTest.game;return [...Object.values(g.assets.manifest.scenes[g.currentScene.id]),...Object.values(g.assets.manifest.items).flatMap(v=>Object.values(v))].filter(v=>typeof v==='string'&&/\.(png|webp)$/.test(v));});
   // Isolate the inventory/prior-art audit from the game's bounded image cache.
   // Decode and draw every resolved URL, then release each image before the next.
   const decodeContext=await browser.newContext(),decodePage=await decodeContext.newPage();
   const decodeErrors=[],decodeFailed=[];decodePage.on('pageerror',e=>decodeErrors.push(String(e)));decodePage.on('requestfailed',r=>decodeFailed.push({url:r.url(),error:r.failure()?.errorText}));decodePage.on('response',r=>{if(r.status()>=400)decodeFailed.push({url:r.url(),status:r.status()});});
   let decoded;try{decoded=await decodePage.evaluate(async({paths,origin})=>{const result=[];for(const path of paths){const i=new Image();i.src=new URL(path,origin).href;try{await i.decode();const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;canvas.getContext('2d').drawImage(i,0,0,1,1);result.push({path,ok:i.naturalWidth>0&&i.naturalHeight>0,width:i.naturalWidth,height:i.naturalHeight});}catch(e){result.push({path,ok:false,error:String(e)});}finally{i.src='';}}return result;},{paths,origin:url});await decodePage.waitForLoadState('networkidle');}finally{await decodeContext.close();}
   await page.waitForLoadState('networkidle');report.languages.push({language,frames,decoded,errors,failed,decodeErrors,decodeFailed,receiptTrace,state:await snapshot()});writeFileSync(root+'/results.json',JSON.stringify(report,null,2));assert.deepEqual(decoded.filter(x=>!x.ok),[]);assert.deepEqual(decodeErrors,[]);assert.deepEqual(decodeFailed,[]);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);await context.close();
  }
 }catch(e){writeFileSync(root+'/failure.json',JSON.stringify({error:String(e),stack:e.stack,report,serverOutput:output},null,2));throw e;}
 finally{await browser?.close();server.kill();writeFileSync(root+'/server.log',output);}
});
