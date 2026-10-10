import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserAvailable } from './helpers/browser-availability.js';

test('oil bottle preserves the workshop GLB, embedded label and measured geometry', () => {
  const buffer=readFileSync('assets/chapter1/items/kiro-bottle/oil-200ml-r08.glb');
  assert.equal(buffer.toString('ascii',0,4),'glTF');
  assert.equal(buffer.readUInt32LE(4),2);
  assert.equal(createHash('sha256').update(buffer).digest('hex'),'ef5d72f082f9eab3b43883ef4063c823ab11746dbe1a3896ca6d974d46d180b1');
  const gltf=JSON.parse(buffer.toString('utf8',20,20+buffer.readUInt32LE(12)));
  assert.equal(gltf.images.length,1); assert.ok(gltf.images[0].bufferView>=0);
  assert.ok(!gltf.animations?.length); assert.ok(!gltf.cameras?.length);
});

test('received 3D item rotates, rests without rendering, disposes and falls back safely', { timeout:90_000 }, async t => {
  if (!browserAvailable(t,chromium.executablePath())) return;
  const probe=createServer(); await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=probe.address().port; await new Promise(resolve=>probe.close(resolve));
  const server=spawn(process.execPath,['tools/dev-server.mjs'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,PORT:String(port)},stdio:'ignore'});
  let browser;
  try {
    for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/`)).ok)break}catch{} await new Promise(resolve=>setTimeout(resolve,100));}
    browser=await chromium.launch({headless:true});
    let page=await browser.newPage({viewport:{width:1280,height:720},serviceWorkers:'block'});const errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
    await page.goto(`http://127.0.0.1:${port}/?play=1&testHarness=1`);
    await page.evaluate(()=>window.__comradeCandidateTest.ready);
    async function receive(language){await page.evaluate(async language=>{
      const g=window.__comradeCandidateTest.game; g.setLanguage(language); await g.changeScene('scene.chapter1.mehana');
      g.inventory.remove('item.sunflower_oil');g.state.hasSunflowerOil=false;
      const effect=g.content.dialogues['dialogue.mehana_waiter'].nodes.start.choices.find(c=>c.textKey==='fountain.kiro.choice.refill').effect;
      g.startSceneAction(effect);g.updateSceneAction(8);
    },language);}
    for(const language of ['bg','en']){
      await receive(language);
      const viewer=page.locator('.item-model-viewer[data-model-state=ready]'); await viewer.waitFor();
      assert.equal(await viewer.getAttribute('data-draw-calls'),'10');
      assert.equal(await viewer.getAttribute('data-triangles'),'176880');
      const canvas=viewer.locator('canvas');await canvas.focus();
      assert.equal(await page.locator('.item-model-toolbar').count(),0);
      assert.equal(await page.locator('.received-item-screen button').count(),1,'only Put away remains');
      const angle=await viewer.getAttribute('data-orientation');
      const box=await canvas.boundingBox();
      assert.ok(Math.abs(box.height-453.6)<2,'bottle viewing area is50percent taller at720px');
      async function drag(dx,dy){
        await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
        await page.mouse.move(box.x+box.width/2+dx,box.y+box.height/2+dy,{steps:6});await page.mouse.up();
      }
      for(const [dx,dy] of [[900,900],[900,900],[-900,-900],[-900,-900]]){
        await drag(dx,dy);
        assert.ok(Math.abs(Number(await viewer.getAttribute('data-pitch')))<=Math.PI/12+.000001);
        assert.ok(Math.abs(Number(await viewer.getAttribute('data-yaw')))<=Math.PI/12+.000001);
        assert.ok(Number(await viewer.getAttribute('data-up-y'))>.96,'bottle remains upright and front-facing');
      }
      assert.notEqual(await viewer.getAttribute('data-orientation'),angle);
      const orientation=await viewer.getAttribute('data-orientation'),distance=await viewer.getAttribute('data-distance');
      await canvas.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('e');
      await canvas.hover();await page.mouse.wheel(0,-2000);
      await page.waitForFunction(()=>document.querySelector('.item-model-viewer').dataset.zoom==='1.3499',null,{polling:100});
      await page.mouse.wheel(0,-2000);
      await page.waitForFunction(()=>document.querySelector('.item-model-viewer').dataset.zoom==='1.5000',null,{polling:100});
      await page.mouse.wheel(0,-2000);await page.waitForTimeout(100);
      assert.equal(await viewer.getAttribute('data-zoom'),'1.5000','zoom clamps at50percent closer');
      assert.equal(await viewer.getAttribute('data-orientation'),orientation,'zoom preserves tilt');
      await page.mouse.wheel(0,2000);await page.mouse.wheel(0,2000);
      await page.waitForFunction(()=>document.querySelector('.item-model-viewer').dataset.zoom==='1.0000',null,{polling:100});
      await page.mouse.wheel(0,2000);await page.waitForTimeout(100);
      assert.equal(await viewer.getAttribute('data-zoom'),'1.0000','zoom out clamps at approved default');
      assert.equal(await viewer.getAttribute('data-orientation'),orientation,'no keyboard full rotation');
      assert.equal(await viewer.getAttribute('data-distance'),distance,'zoom keeps camera position fixed');
      await page.waitForTimeout(100);const renders=await viewer.getAttribute('data-renders');await page.waitForTimeout(150);
      assert.equal(await viewer.getAttribute('data-renders'),renders,'no idle rendering loop');
      await page.evaluate(()=>window.__comradeCandidateTest.game.renderUi());
      await page.locator('.item-model-viewer[data-model-state=ready]').waitFor();assert.equal(await page.locator('.item-model-viewer canvas').count(),1);
      await page.locator('.item-model-viewer canvas').evaluate(c=>c.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
      await page.locator('.item-model-viewer[data-model-state=fallback] img').waitFor();
      await page.waitForFunction(()=>document.querySelector('.item-model-viewer img')?.naturalWidth>0,null,{polling:100});
      await page.locator('.received-item-screen > button:last-child').click();
      assert.equal(await page.locator('.item-model-viewer').count(),0);
      assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.state.inventory.filter(id=>id==='item.sunflower_oil').length),1);
    }
    // Close while a model request is pending: its late result must not resurrect a viewer.
    let release;const hold=new Promise(resolve=>release=resolve);
    await page.route('**/oil-200ml-r08.glb',async route=>{await hold;await route.continue();});
    await receive('en');await page.locator('.item-model-viewer[data-model-state=loading]').waitFor();
    await page.locator('.received-item-screen > button:last-child').click();release();
    await page.waitForTimeout(300);assert.equal(await page.locator('.item-model-viewer').count(),0);
    await page.close();
    // Isolate a failed request from Three's per-page in-flight request coalescing.
    page=await browser.newPage({viewport:{width:1280,height:720},serviceWorkers:'block'});
    page.on('pageerror',e=>errors.push(String(e)));
    await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
    await page.goto(`http://127.0.0.1:${port}/?play=1&testHarness=1`);
    await page.evaluate(()=>window.__comradeCandidateTest.ready);
    await page.route('**/oil-200ml-r08.glb',route=>route.abort());
    await receive('en');await page.locator('.item-model-viewer[data-model-state=fallback]').waitFor();
    await page.locator('.received-item-screen > button:last-child').click();
    assert.deepEqual(errors,[]);
  } finally { await browser?.close();server.kill(); }
});
