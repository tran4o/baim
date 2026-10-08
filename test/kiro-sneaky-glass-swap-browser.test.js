import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { browserAvailable } from './helpers/browser-availability.js';

test('Kiro c02 quiet variation renders behind the counter, cancels safely and decodes inventory/prior animations in BG and EN', {timeout:120000}, async t => {
  if (!browserAvailable(t,chromium.executablePath())) return;
  const port=await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(0,'127.0.0.1',()=>{const value=probe.address().port;probe.close(()=>resolve(value));});});
  const origin=`http://127.0.0.1:${port}`;
  const server=spawn(process.execPath,['tools/dev-server.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(port)},stdio:'ignore'});
  let browser;
  const evidence='target/ludo-review/kiro-sneaky-glass-swap-c02/browser';mkdirSync(evidence,{recursive:true});
  const report={clock:'controlled real Game.tick, native requestAnimationFrame disabled only in test',languages:[]};
  try {
    let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(origin)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
    browser=await chromium.launch({headless:true});
    for(const language of ['bg','en']) {
      const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
      const page=await context.newPage();const errors=[],failedRequests=[],badResponses=[];
      page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
      page.on('requestfailed',request=>failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
      page.on('response',response=>{if(response.status()>=400)badResponses.push({url:response.url(),status:response.status()});});
      // Bound the full-catalog decode check to a separate page without the
      // game's active cache. Every actual hashed URL is decoded AND rasterized;
      // the gameplay page then verifies its own protected working set.
      const assetPage=await context.newPage();
      assetPage.on('pageerror',error=>errors.push(String(error)));
      assetPage.on('requestfailed',request=>failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
      assetPage.on('response',response=>{if(response.status()>=400)badResponses.push({url:response.url(),status:response.status()});});
      await assetPage.goto(origin+'/docs/animation-library-index.html');
      const decoded=await assetPage.evaluate(async()=>{
        const manifest=await (await fetch('/target/runtime-assets/manifest.json',{cache:'no-store'})).json();
        const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;const ctx=canvas.getContext('2d');const images=[];
        for(const [source,record]of Object.entries(manifest.assets)) {
          const image=new Image();image.src='/'+record.url;
          try { await image.decode(); } catch(error) { throw Error('Decode failed: '+source+'; '+error); }
          if(!image.complete||!image.naturalWidth||!image.naturalHeight)throw Error('Failed image: '+source);
          ctx.clearRect(0,0,2,2);ctx.drawImage(image,0,0,2,2);ctx.getImageData(0,0,2,2);
          images.push({source,url:image.src,width:image.naturalWidth,height:image.naturalHeight});image.src='';
        }
        return {version:manifest.version,images};
      });
      await assetPage.close();
      await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
      await page.goto(origin+'/?play=1&testHarness=1');await page.evaluate(()=>window.__comradeCandidateTest.ready);
      const loaded=await page.evaluate(async language=>{
        const {game}=window.__comradeCandidateTest;game.setLanguage(language);await game.changeScene('scene.chapter1.mehana');
        game.sceneIdleVariations.random=()=>0;game.sceneIdleVariations.reset();game.player.idleVariantTimer=1e9;
        const layer=game.currentScene.foregroundLayers.find(l=>l.id==='layer.mehana.waiter_idle');
        window.__kiroView=()=>game.sceneIdleVariationPresentation(game.currentScene,layer);
        window.__kiroAdvance=ms=>{let remaining=ms;while(remaining>0){const step=Math.min(50,remaining);game.tick(game.lastTime+step);remaining-=step;}if(ms===0)game.tick(game.lastTime);const view=window.__kiroView();return view?{phase:view.phase,elapsed:view.elapsed,idleTime:view.idleTime,remainingMs:view.remainingMs}:null;};
        window.__kiroCounterPixels=()=>Array.from(game.canvas.getContext('2d').getImageData(720,343,105,13).data);
        window.__kiroAdvance(0);
        const manifest=await (await fetch('/target/runtime-assets/manifest.json',{cache:'no-store'})).json();
        // Await the protected gameplay working set before any capture.
        game.protectCurrentAssetWorkingSet();
        await game.assets.preloadSceneAssets(game.currentScene.id);
        await game.assets.preloadCharacterSlots(game.player.id,game.bootstrapCharacterSlots());
        for(const key of Object.keys(game.assets.manifest.scenes[game.currentScene.id])) {
          if(!game.assets.isLoaded(game.assets.getSceneImage(game.currentScene.id,key)))throw Error('Scene asset not ready: '+key);
        }
        game.renderer.draw();
        return {version:manifest.version,loadedVersion:game.assets.runtimeVersion};
      },language);
      loaded.images=decoded.images;assert.equal(loaded.version,loaded.loadedVersion);assert.equal(loaded.version,decoded.version);assert.ok(loaded.images.length>=90);
      const baseCounter=await page.evaluate(()=>window.__kiroCounterPixels());
      await page.screenshot({path:evidence+'/'+language+'-idle.png'});
      assert.equal((await page.evaluate(()=>window.__kiroAdvance(24999))).phase,'idle');
      assert.equal((await page.evaluate(()=>window.__kiroAdvance(1))).phase,'playing');
      const frames=[];let previous=0;
      for(let i=0;i<36;i++) {
        const elapsed=i*131+0.01;const state=await page.evaluate(ms=>window.__kiroAdvance(ms),elapsed-previous);previous=elapsed;
        assert.equal(state.phase,'playing');assert.equal(Math.floor(state.elapsed/131),i);frames.push(i);
        assert.deepEqual(await page.evaluate(()=>window.__kiroCounterPixels()),baseCounter,'opaque counter must hide all moving lower body/glass pixels');
        if([0,7,13,19,25,35].includes(i))await page.screenshot({path:evidence+'/'+language+'-frame-'+i+'.png'});
      }
      const returned=await page.evaluate(ms=>window.__kiroAdvance(ms),4716-previous);
      assert.equal(returned.phase,'idle');assert.equal(returned.idleTime,0);assert.equal(returned.remainingMs,25000);
      await page.screenshot({path:evidence+'/'+language+'-handoff.png'});
      await page.evaluate(()=>window.__kiroAdvance(25000));await page.evaluate(()=>window.__kiroAdvance(500));
      const frozen=await page.evaluate(()=>{const {game}=window.__comradeCandidateTest;game.paused=true;return window.__kiroAdvance(0);});
      assert.deepEqual(await page.evaluate(()=>window.__kiroAdvance(30000)),frozen);
      await page.evaluate(()=>{window.__comradeCandidateTest.game.paused=false;});
      assert.equal((await page.evaluate(()=>window.__kiroAdvance(131))).elapsed,631);
      const canceled=await page.evaluate(()=>{const {game}=window.__comradeCandidateTest;game.dialogue.start('dialogue.mehana_waiter');game.renderUi();return window.__kiroAdvance(0);});
      assert.equal(canceled,null);await page.screenshot({path:evidence+'/'+language+'-dialogue.png'});
      assert.equal(await page.evaluate(()=>window.__kiroAdvance(30000)),null);
      await page.evaluate(()=>{const {game}=window.__comradeCandidateTest;game.dialogue.close();game.renderUi();});
      assert.equal((await page.evaluate(()=>window.__kiroAdvance(0))).remainingMs,25000);
      await page.evaluate(()=>window.__kiroAdvance(25000));
      await page.evaluate(async()=>{const {game}=window.__comradeCandidateTest;await game.changeScene('scene.chapter1.village_square');await game.changeScene('scene.chapter1.mehana');});
      assert.equal((await page.evaluate(()=>window.__kiroAdvance(0))).remainingMs,25000);
      const lateLoad=await page.evaluate(()=>{
        const {game}=window.__comradeCandidateTest;const path=game.assets.getSceneAssetPath(game.currentScene.id,'mehanaWaiterSneakyGlassSwap');
        const image=game.assets.images.get(path);image.dataset.loaded='false';const skipped=window.__kiroAdvance(25000);
        image.dataset.loaded='true';const afterLoad=window.__kiroAdvance(50);return {skipped,afterLoad};
      });
      assert.equal(lateLoad.skipped.phase,'idle');assert.equal(lateLoad.skipped.remainingMs,25000);assert.equal(lateLoad.afterLoad.phase,'idle');
      const fallback=await page.evaluate(()=>{
        const {game}=window.__comradeCandidateTest;const layer=game.currentScene.foregroundLayers.find(l=>l.id==='layer.mehana.waiter_idle');
        const path=game.assets.getSceneAssetPath(game.currentScene.id,layer.animation.asset),image=game.assets.images.get(path);image.dataset.loaded='false';
        let used=false;const draw=game.renderer.ctx.drawImage.bind(game.renderer.ctx);game.renderer.ctx.drawImage=(...args)=>{if(args[0]===game.assets.getSceneImage(game.currentScene.id,layer.asset))used=true;draw(...args);};
        game.renderer.drawSceneRasterLayer(game.currentScene,layer);game.renderer.ctx.drawImage=draw;image.dataset.loaded='true';return used;
      });assert.equal(fallback,true);
      assert.deepEqual(errors,[]);assert.deepEqual(failedRequests,[]);assert.deepEqual(badResponses,[]);
      report.languages.push({language,frames,manifest:loaded,checks:{counterOcclusion:true,idleFrameZeroHandoff:true,pauseFreeze:true,dialogueCancellation:true,sceneCancellation:true,lateLoadSkip:true,staticFallback:true},errors,failedRequests,badResponses});
      await context.close();
    }
    writeFileSync(evidence+'/browser-review.json',JSON.stringify(report,null,2)+'\n');
  } finally {
    await browser?.close();if(server.exitCode===null){server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));}
  }
});
