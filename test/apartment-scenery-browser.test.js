import { objectRemark } from '../src/content/chapter1/objectCommentary.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright';
import {browserAvailable} from './helpers/browser-availability.js';
import {chooseHudVerb,inventoryItem,clickScenePoint} from './helpers/hud-ui.js';
import {chapter1} from '../src/content/chapter1/index.js';
import {strings} from '../src/content/localization/index.js';
import {findTargetAt} from '../src/engine/SceneGeometry.js';
import {requirementsMet} from '../src/engine/EffectSystem.js';

const points={icon:{x:45,y:90},lamp:{x:620,y:28},suitcase:{x:824,y:60},bag:{x:924,y:60},plant:{x:154,y:268},radiator:{x:244,y:330},empty_frame:{x:487,y:168},wall_rug:{x:1210,y:165},patriot_photos:{x:1180,y:325}};

test('all owner-marked scenery has bilingual Look-only commentary and the empty frame follows pickup',()=>{
  const scene=chapter1.scenes.find(s=>s.id==='scene.chapter1.apartment');
  const available=t=>!t.requirements||requirementsMet(t.requirements,{state:{flags:{adultPhotoTaken:true}}});
  for(const[name,point]of Object.entries(points)){
    const t=findTargetAt(scene,point,available);
    assert.equal(t?.id,'hotspot.apartment.'+name,name+' is actually reachable over existing geometry');
    assert.equal(t.plainUseAvailable,false);assert.equal(t.takeItemId,undefined);assert.equal(t.useRules,undefined);assert.equal(t.actions,undefined);
    for(const language of ['bg','en']){assert.ok(strings[language][t.lookKey]);assert.ok(strings[language][t.nameKey]);}
  }
  const initial=t=>!t.requirements||requirementsMet(t.requirements,{state:{flags:{adultPhotoTaken:false},chapter1Completed:false}});
  assert.equal(findTargetAt(scene,points.empty_frame,initial).id,'hotspot.apartment.adult_photo','new frame target never blocks the original collectible');
});

test('real BG/EN clicks give all scenery comments without moving/granting items, and inventory hover stays silent',{timeout:90000},async t=>{
  if(!browserAvailable(t,chromium.executablePath()))return;
  let browser,server;
  try{
    const port=await new Promise(resolve=>{const p=createServer();p.listen(0,'127.0.0.1',()=>{const n=p.address().port;p.close(()=>resolve(n));});});
    const origin='http://127.0.0.1:'+port;server=spawn(process.execPath,['tools/dev-server.mjs'],{env:{...process.env,PORT:String(port)},stdio:'ignore',windowsHide:true});
    for(let i=0;i<100;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:720},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/?play=1&testHarness=1');await page.evaluate(()=>window.__comradeCandidateTest.ready);
    await page.evaluate(()=>{const g=window.__comradeCandidateTest.game;g.menuOpen=false;g.paused=false;g.dialogue.close();g.state.flags.chapter1OpeningHeard=true;g.state.flags.adultPhotoTaken=true;g.state.inventory=['item.mitko_child_photo','item.accordion','item.fountain_water_bottle','item.fake_diploma'];g.inventoryExpanded=false;g.renderUi();});
    for(const language of ['bg','en']){
      await page.evaluate(language=>window.__comradeCandidateTest.game.setLanguage(language),language);
      await chooseHudVerb(page,'look');
      for(const[name,point]of Object.entries(points)){
        t.diagnostic(language+': '+name);
        const before=await page.evaluate(()=>{const g=window.__comradeCandidateTest.game;return {inventory:[...g.state.inventory],flags:JSON.stringify(g.state.flags),position:{...g.player.position}};});
        await clickScenePoint(page,point);
        await page.waitForFunction(expected=>window.__comradeCandidateTest.game.message===expected,objectRemark('hotspot.apartment.'+name,'look',language),{timeout:5000}).catch(async error=>{t.diagnostic(JSON.stringify(await page.evaluate(()=>{const g=window.__comradeCandidateTest.game;return{message:g.message,scene:g.currentScene.id,verb:g.selectedVerb,hover:g.hoveredTarget?.id,menu:g.menuOpen,paused:g.paused,dialogue:g.dialogue.current,flags:g.state.flags};})));throw error;});
        assert.equal(await page.locator('.dialogue-panel,.received-item-screen').count(),0);
        assert.deepEqual(await page.evaluate(()=>{const g=window.__comradeCandidateTest.game;return {inventory:[...g.state.inventory],flags:JSON.stringify(g.state.flags),position:{...g.player.position}};}),before,'Look is commentary without movement or quest/item changes');
      }
      for(const id of ['item.mitko_child_photo','item.accordion','item.fountain_water_bottle','item.fake_diploma']){
        const item=await inventoryItem(page,id);await item.hover();await item.focus();
        assert.equal(await item.getAttribute('title'),null);assert.equal(await item.getAttribute('aria-describedby'),null);assert.ok(await item.getAttribute('aria-label'));
        assert.equal(await page.locator('.inventory-tooltip,.inventory-hover-label,[role=tooltip]').count(),0);
      }
      await page.mouse.move(700,500);
      await page.locator('.inventory-toggle').click();
    }
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();server?.kill();}
});
