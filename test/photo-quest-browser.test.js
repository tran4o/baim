import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { mousePuzzleSlide } from './helpers/puzzle-mouse.js';

test('3D cupboard puzzle, persisted progress and Pepa transactions work in BG/EN without duplicate rewards', {timeout:180000}, async()=>{
  const probe=createServer(); await new Promise(r=>probe.listen(0,'127.0.0.1',r)); const port=probe.address().port; await new Promise(r=>probe.close(r));
  const server=spawn(process.execPath,['tools/dev-server.mjs'],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
  let browser;
  const evidence='target/photo-quest-review';mkdirSync(evidence,{recursive:true});
  try {
    for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/`)).ok)break;}catch{} await new Promise(r=>setTimeout(r,100));}
    browser=await chromium.launch({headless:true});
    for(const lang of ['bg','en']) {
      const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(String(e)));
      await page.goto(`http://127.0.0.1:${port}/?play=1&testHarness=1`);await page.evaluate(()=>window.__comradeCandidateTest.ready);
      await page.evaluate(lang=>{const g=window.__comradeCandidateTest.game;g.setLanguage(lang);g.useTarget(g.currentScene.interactables.find(t=>t.objectCloseup));},lang);
      await page.locator('.object-closeup-screen [data-item-id="hotspot.apartment.wardrobe_photo_puzzle"]:enabled').click();
      await page.locator('.photo-puzzle-view[data-model-state=ready]').waitFor();
      assert.ok(Number(await page.locator('.photo-puzzle-view').getAttribute('data-triangles'))>100);
      await page.screenshot({path:`${evidence}/puzzle-${lang}.png`});
      // Actual user controls, not injected solve state.
      await mousePuzzleSlide(page,'yellow3',0,-1);
      await page.keyboard.press('Escape');assert.equal(await page.locator('.photo-puzzle-screen').count(),0);
      await page.reload();await page.evaluate(()=>window.__comradeCandidateTest.ready);
      assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.state.photoPuzzle.moves),1);
      await page.evaluate(()=>{const g=window.__comradeCandidateTest.game;g.useTarget(g.currentScene.interactables.find(t=>t.objectCloseup));});
      await page.locator('.object-closeup-screen [data-item-id="hotspot.apartment.wardrobe_photo_puzzle"]:enabled').click();
      await page.locator('.photo-puzzle-view[data-model-state=ready]').waitFor();
      for(const [piece,dx,dy] of [['red3',-1,0],['yellow4',0,-1],['red4',1,0],['blue',0,1]]) {
        await mousePuzzleSlide(page,piece,dx,dy);
      }
      assert.equal(await page.locator('.photo-puzzle-screen').count(),0);
      assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.state.inventory.filter(i=>i==='item.mitko_child_photo').length),1);
      await page.locator('.object-closeup-screen [data-action=close]').click();
      await page.evaluate(()=>{const g=window.__comradeCandidateTest.game;g.takeTarget(g.currentScene.interactables.find(t=>t.id==='hotspot.apartment.adult_photo'));});
      await page.evaluate(async()=>{
        const g=window.__comradeCandidateTest.game;g.inventory.add('item.accordion');await g.changeScene('scene.chapter1.village_square');
        const kiosk=g.currentScene.interactables.find(t=>t.id==='hotspot.square.kiosk');
        g.useInventoryItemOnTarget('item.mitko_photo',kiosk);
      });
      assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.inventory.has('item.campaign_pamphlets')),false,'music first');
      await page.evaluate(()=>{const g=window.__comradeCandidateTest.game,k=g.currentScene.interactables.find(t=>t.id==='hotspot.square.kiosk');g.useInventoryItemOnTarget('item.accordion',k);g.useInventoryItemOnTarget('item.mitko_photo',k);});
      assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.inventory.has('item.campaign_pamphlets')),true);
      await page.evaluate(async()=>{
        const g=window.__comradeCandidateTest.game; await g.changeScene('scene.chapter1.mehana');
        g.takeTarget(g.currentScene.interactables.find(t=>t.id==='hotspot.mehana.tony_diploma'));
      });
      await page.evaluate(()=>{const g=window.__comradeCandidateTest.game;g.clearStatusMessage();g.renderUi();});
      await page.screenshot({path:`${evidence}/tony-diploma-${lang}.png`});
      assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.inventory.has('item.tony_diploma')),false,'awake Tony guards diploma');
      // The native journey exercises the real contest. This controlled transaction
      // still waits for the normal blackout before attempting the guarded pickup.
      await page.evaluate(()=>{const g=window.__comradeCandidateTest.game;g.state.swappedOwnRakiaWithWater=true;g.dialogue.start('dialogue.tony_fridge');const c=g.dialogue.getNode().choices.find(c=>c.next==='contest_result');g.applyContentEffect(c.effect);g.dialogue.close();});
      await page.waitForFunction(()=>{const g=window.__comradeCandidateTest.game;return g.state.flags.tonyPassedOut&&!g.sceneAction.active;});
      await page.evaluate(()=>{const g=window.__comradeCandidateTest.game;g.takeTarget(g.currentScene.interactables.find(t=>t.id==='hotspot.mehana.tony_diploma'));});
      assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.inventory.has('item.tony_diploma')),true);
      await page.evaluate(async()=>{const g=window.__comradeCandidateTest.game;await g.changeScene('scene.chapter1.village_square');g.useInventoryItemOnTarget('item.tony_diploma',g.currentScene.interactables.find(t=>t.id==='hotspot.square.kiosk'));g.save();g.renderUi();});
      await page.reload();await page.evaluate(()=>window.__comradeCandidateTest.ready);
      const result=await page.evaluate(()=>{const s=window.__comradeCandidateTest.game.state;return {music:s.flags.pepaMusicPlayed,photo:s.inventory.includes('item.mitko_photo'),diploma:s.hasFakeDiploma,original:s.inventory.includes('item.tony_diploma')};});
      assert.deepEqual(result,{music:true,photo:true,diploma:true,original:false});assert.deepEqual(errors,[]);
      await context.close();
    }
  } finally {await browser?.close();server.kill();}
});
