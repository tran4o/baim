import {actionIconUrl} from '../src/engine/ActionIcons.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright';
import {browserAvailable} from './helpers/browser-availability.js';
import {inventoryItem,chooseHudVerb,dismissItemView} from './helpers/hud-ui.js';

test('static UI vectors are exact accepted frame zero, with no raster substitutes',()=>{
  const provenance=JSON.parse(readFileSync('assets_src/ui/action-cursors/static-icons-r65.json'));
  for(const record of provenance.records){
    const source=readFileSync(record.source),svg=readFileSync(record.runtime,'utf8');
    assert.equal(svg,JSON.parse(source).frames[0]);
    assert.equal(createHash('sha256').update(source).digest('hex'),record.sourceSHA256);
    assert.equal(createHash('sha256').update(svg).digest('hex'),record.runtimeSHA256);
    assert.doesNotMatch(svg,/<(?:image|script)\b/i);
    assert.equal(Buffer.from(actionIconUrl(record.verb).split(',')[1],'base64').toString(),svg);
  }
});

test('joined vector ears and read-only native views consume dismissal and preserve drag/zoom', {timeout:120000},async t=>{
  if(!browserAvailable(t,chromium.executablePath()))return;
  let browser,server;
  try{
    const port=await new Promise(resolve=>{const p=createServer();p.listen(0,'127.0.0.1',()=>{const n=p.address().port;p.close(()=>resolve(n));});});
    const origin='http://127.0.0.1:'+port;
    server=spawn(process.execPath,['tools/dev-server.mjs'],{env:{...process.env,PORT:String(port)},stdio:'ignore',windowsHide:true});
    for(let i=0;i<100;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1280,height:720},serviceWorkers:'block'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/?play=1&testHarness=1');await page.evaluate(()=>window.__comradeCandidateTest.ready);
    await page.evaluate(()=>{const g=window.__comradeCandidateTest.game;g.menuOpen=false;g.paused=false;g.state.flags.chapter1OpeningHeard=true;g.state.inventory=['item.mitko_child_photo','item.accordion','item.sunflower_oil'];g.renderUi();});
    for(const verb of ['look','talk','use','take']){
      await chooseHudVerb(page,verb);
      const css=await page.locator('.hud-verb-icon').evaluate(e=>({image:getComputedStyle(e).backgroundImage,size:getComputedStyle(e).backgroundSize}));
      assert.ok(css.image.includes('data:image/svg+xml;base64,'));assert.equal(css.size,'contain');
      const imageUrl=css.image.slice(5,-2);
      assert.equal(await page.evaluate(async url=>{const response=await fetch(url);const image=new Image();image.src=url;await image.decode();return response.headers.get('content-type');},imageUrl),'image/svg+xml');
    }
    for(const language of ['bg','en'])for(const id of ['item.mitko_child_photo','item.accordion']){
      await page.evaluate(language=>window.__comradeCandidateTest.game.setLanguage(language),language);
      const item=await inventoryItem(page,id);await item.click();
      assert.deepEqual(await item.evaluate(e=>[getComputedStyle(e).borderLeftColor,getComputedStyle(e).borderRightColor]),['rgb(216, 184, 121)','rgb(216, 184, 121)'],'the original item frame remains complete');
      assert.notEqual(await item.evaluate(e=>getComputedStyle(e).boxShadow),'none','original frame highlight remains');
      assert.equal(await page.locator('.inventory-ear-left').evaluate(e=>getComputedStyle(e).borderRightColor),'rgba(0, 0, 0, 0)','only the extra inner edge of the left ear is removed');
      assert.equal(await page.locator('.inventory-ear-right').evaluate(e=>getComputedStyle(e).borderLeftColor),'rgba(0, 0, 0, 0)','only the extra inner edge of the right ear is removed');
      const icons=await page.locator('.inventory-ear-icon').evaluateAll(es=>es.map(e=>({image:getComputedStyle(e).backgroundImage,size:getComputedStyle(e).backgroundSize,filter:getComputedStyle(e).filter})));
      assert.ok(icons.every(i=>i.image.includes('data:image/svg+xml;base64,')));assert.ok(icons.every(i=>i.size==='contain'&&i.filter==='none'));
      const label=await page.evaluate(()=>window.__comradeCandidateTest.game.t('ui.inventory.inspect'));
      await page.locator('.inventory-item-actions').getByRole('button',{name:label,exact:true}).click();
      const panel=page.locator('.received-item-screen');
      await page.locator('.item-model-viewer[data-model-state=ready]').waitFor();
      assert.equal(await panel.locator('button').count(),0);assert.equal(await panel.locator(':scope > p').count(),1);
      const canvas=panel.locator('canvas'),box=await canvas.boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(5,5,{steps:2});await page.mouse.up();
      assert.equal(await panel.count(),1,'drag ending outside is not a dismissal');
      await canvas.hover();await page.mouse.wheel(0,-2000);await page.waitForTimeout(100);
      await canvas.focus();await page.keyboard.press('Home');
      const before=await page.evaluate(()=>{const g=window.__comradeCandidateTest.game;return {position:{...g.player.position},flags:JSON.stringify(g.state.flags),inventory:[...g.state.inventory]};});
      await dismissItemView(page);
      assert.deepEqual(await page.evaluate(()=>{const g=window.__comradeCandidateTest.game;return {position:{...g.player.position},flags:JSON.stringify(g.state.flags),inventory:[...g.state.inventory]};}),before,'dismissal never activates scenery or changes items');
    }
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();server?.kill();}
});
