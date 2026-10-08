import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {browserAvailable} from './helpers/browser-availability.js';
// PNG and WebP browser decoding can differ by one premultiplication rounding
// value despite identical raw RGBA. Bound that difference; do not tolerate pose
// or mouth-shape changes. Subsequent held-still samples must match exactly.
const sameFace=(actual,expected)=>assert.ok(Math.max(...actual.map((v,i)=>Math.abs(v-expected[i])))<=2,'rendered face must retain frame0 orientation/mouth');

test('Final Kiro facing speech loop and held listener retain fallback and counter occlusion in BG/EN gameplay', {timeout:180000}, async t=>{
  if(!browserAvailable(t,chromium.executablePath()))return;
  const port=await new Promise(resolve=>{const probe=createServer();probe.listen(0,'127.0.0.1',()=>{const port=probe.address().port;probe.close(()=>resolve(port));});});
  const origin=`http://127.0.0.1:${port}`;
  const server=spawn(process.execPath,['tools/dev-server.mjs'],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
  const evidence='target/ludo-review/kiro-talking-polishing-final/browser';mkdirSync(evidence,{recursive:true});
  const report={languages:[],sourceFrameDurationMs:73,sourceDurationMs:4672,facingLoopDurationMs:3504,loopStartFrame:8,loopEndFrame:55,allFrameLoopHarness:'First-line reading window transiently extended to cover whole facing loop; second reply uses unchanged authored reading window.'};let browser;
  try{
    let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(origin)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
    browser=await chromium.launch({headless:true});
    for(const language of ['bg','en']){
      const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
      const page=await context.newPage(),errors=[],failedRequests=[],badResponses=[];
      page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      page.on('requestfailed',r=>failedRequests.push(r.url()));page.on('response',r=>{if(r.status()>=400)badResponses.push({url:r.url(),status:r.status()});});
      await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
      await page.goto(origin+'/?play=1&testHarness=1');await page.evaluate(()=>window.__comradeCandidateTest.ready);
      await page.evaluate(async language=>{
        const {game}=window.__comradeCandidateTest;game.setLanguage(language);await game.changeScene('scene.chapter1.mehana');
        game.protectCurrentAssetWorkingSet();await game.assets.preloadSceneAssets(game.currentScene.id);
        await game.assets.preloadCharacterSlots(game.player.id,game.bootstrapCharacterSlots());game.sceneIdleVariations.random=()=>0;game.sceneIdleVariations.reset();
        const layer=game.currentScene.foregroundLayers.find(l=>l.id==='layer.mehana.waiter_idle');window.__kiroLayer=layer;
        window.__speechView=()=>game.sceneNpcSpeech.presentation(game.currentScene.id,layer);
        window.__advance=ms=>{let remaining=ms;while(remaining>0){const step=Math.min(50,remaining);game.tick(game.lastTime+step);remaining-=step;}if(ms===0)game.tick(game.lastTime);return window.__speechView();};
        window.__counter=()=>Array.from(game.canvas.getContext('2d').getImageData(720,343,105,13).data);
        window.__face=()=>Array.from(game.canvas.getContext('2d').getImageData(748,223,48,53).data);
        window.__draws=()=>{const calls=[];const draw=game.renderer.ctx.drawImage.bind(game.renderer.ctx);const samples=game.renderer.drawSceneAnimationSamples.bind(game.renderer);game.renderer.ctx.drawImage=(...a)=>{calls.push(a[0]);draw(...a);};game.renderer.drawSceneAnimationSamples=(l,s,...rest)=>{calls.push(...s.map(v=>v.image));return samples(l,s,...rest);};game.renderer.drawSceneRasterLayer(game.currentScene,layer);game.renderer.ctx.drawImage=draw;game.renderer.drawSceneAnimationSamples=samples;return {static:calls.includes(game.assets.getSceneImage(game.currentScene.id,layer.asset)),idle:calls.includes(game.assets.getSceneImage(game.currentScene.id,layer.animation.asset))};};
        window.__listenerDraw=()=>{const samples=game.renderer.drawSceneAnimationSamples.bind(game.renderer);const calls=[];game.renderer.drawSceneAnimationSamples=(l,s,...rest)=>{calls.push(...s.map(v=>({asset:v.animation.asset,frame:v.frameIndex,weight:v.weight})));return true;};game.renderer.drawSceneRasterLayer(game.currentScene,layer);game.renderer.drawSceneAnimationSamples=samples;return calls;};
        window.__start=id=>{game.dialogue.start(id);game.renderUi();window.__advance(0);};window.__advance(0);
      },language);
      const counter=await page.evaluate(()=>window.__counter());await page.screenshot({path:evidence+'/'+language+'-idle.png'});
      await page.evaluate(()=>window.__start('dialogue.mehana_waiter'));
      const authoredFirstLineSeconds=await page.evaluate(()=>{const s=window.__comradeCandidateTest.game.npcDialogueSpeech;const original=s.visibleSeconds;s.visibleSeconds=Math.max(original,5);return original;});
      assert.equal((await page.evaluate(()=>window.__speechView())).phase,'speaking');
      let listenerFace;
      const frameIndices=[];
      for(let i=0;i<48;i++){
        const v=await page.evaluate(ms=>window.__advance(ms),i?73:0);assert.equal(v.phase,'speaking');assert.equal(Math.round(v.speechTime/73),i);
        const rendered=await page.evaluate(()=>window.__listenerDraw());assert.ok(rendered.filter(s=>s.asset==='mehanaWaiterTalkingPolishing').every(s=>s.frame>=8&&s.frame<=55));
        frameIndices.push(i+8);assert.deepEqual(await page.evaluate(()=>window.__counter()),counter);
        if(i>=5)assert.equal(v.idleWeight,0);
        await page.screenshot({path:evidence+'/'+language+'-frame-'+String(i).padStart(2,'0')+'.png'});
      }
      const boundary=await page.evaluate(()=>window.__advance(73));assert.equal(boundary.phase,'speaking');assert.equal(Math.round(boundary.speechTime),3504);assert.equal(boundary.idleWeight,0);
      listenerFace=await page.evaluate(()=>window.__face());
      await page.screenshot({path:evidence+'/'+language+'-loop-boundary.png'});
      const paused=await page.evaluate(()=>{window.__comradeCandidateTest.game.paused=true;return window.__advance(0);});assert.deepEqual(await page.evaluate(()=>window.__advance(10000)),paused);
      await page.evaluate(()=>{const {game}=window.__comradeCandidateTest;game.paused=false;game.menuOpen=true;});assert.deepEqual(await page.evaluate(()=>window.__advance(10000)),paused);
      await page.evaluate(()=>{const {game}=window.__comradeCandidateTest;game.menuOpen=false;});
      let continuationFrames=0;
      while(await page.evaluate(()=>{const s=window.__comradeCandidateTest.game.npcDialogueSpeech;return (s.visibleSeconds-s.elapsed)*1000>73;})){
        assert.ok(continuationFrames<300);
        const v=await page.evaluate(()=>window.__advance(73));assert.equal(v.phase,'speaking');assert.equal(v.idleWeight,0);
        await page.screenshot({path:evidence+'/'+language+'-continued-'+String(continuationFrames).padStart(3,'0')+'.png'});continuationFrames++;
      }
      await page.evaluate(()=>{const {game}=window.__comradeCandidateTest;const remaining=(game.npcDialogueSpeech.visibleSeconds-game.npcDialogueSpeech.elapsed)*1000;window.__advance(Math.max(0,remaining-.1));});
      await page.screenshot({path:evidence+'/'+language+'-before-line-end.png'});
      const endFace=await page.evaluate(()=>window.__face());await page.evaluate(()=>window.__advance(.2));
      assert.equal((await page.evaluate(()=>window.__speechView())).phase,'listening');
      assert.deepEqual(await page.evaluate(()=>window.__face()),endFace);
      const stoppedTime=(await page.evaluate(()=>window.__speechView())).speechTime;
      for(let i=0;i<7;i++){if(i)await page.evaluate(()=>window.__advance(50));assert.equal((await page.evaluate(()=>window.__speechView())).speechTime,stoppedTime);await page.screenshot({path:evidence+'/'+language+'-settle-'+String(i).padStart(2,'0')+'.png'});}
      assert.ok(await page.evaluate(()=>Boolean(window.__comradeCandidateTest.game.dialogue.current)));
      assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.sceneIdleVariationPresentation(window.__comradeCandidateTest.game.currentScene,window.__kiroLayer)),null);
      assert.deepEqual(await page.evaluate(()=>window.__listenerDraw()),[{asset:'mehanaWaiterListeningFinal',frame:0,weight:1}]);
      sameFace(await page.evaluate(()=>window.__face()),listenerFace);
      await page.screenshot({path:evidence+'/'+language+'-choices-listening.png'});
      const held=await page.evaluate(()=>window.__face());await page.evaluate(()=>window.__advance(5000));assert.deepEqual(await page.evaluate(()=>window.__face()),held);
      const listeningPause=await page.evaluate(()=>{window.__comradeCandidateTest.game.menuOpen=true;return window.__advance(0);});assert.deepEqual(await page.evaluate(()=>window.__advance(10000)),listeningPause);await page.evaluate(()=>{window.__comradeCandidateTest.game.menuOpen=false;});
      // Exercise supported speaker overrides on transient test-only nodes, not
      // authored dialogue or save effects. Actual subsequent speech uses people.
      for(const npcId of ['character.bai_mitko','npc.tony_fridge']){
        await page.evaluate(npcId=>{const {game}=window.__comradeCandidateTest;game.content.dialogues['dialogue.mehana_waiter'].nodes.__gazeTest={npcId,lineKey:'dialogue.waiter.people',choicesFrom:'start'};game.dialogue.enterNode('__gazeTest');game.renderUi();window.__advance(0);},npcId);
        assert.equal((await page.evaluate(()=>window.__speechView())).phase,'listening');sameFace(await page.evaluate(()=>window.__face()),listenerFace);
        await page.evaluate(()=>window.__advance(500));sameFace(await page.evaluate(()=>window.__face()),listenerFace);
      }
      await page.evaluate(()=>{const {game}=window.__comradeCandidateTest;delete game.content.dialogues['dialogue.mehana_waiter'].nodes.__gazeTest;game.dialogue.enterNode('people');game.renderUi();window.__advance(0);});
      assert.equal((await page.evaluate(()=>window.__speechView())).phase,'speaking');assert.equal((await page.evaluate(()=>window.__speechView())).idleWeight,0);
      await page.evaluate(()=>window.__advance(672));await page.screenshot({path:evidence+'/'+language+'-next-kiro-speech.png'});
      await page.evaluate(()=>window.__advance(10000));assert.equal((await page.evaluate(()=>window.__speechView())).phase,'listening');
      await page.evaluate(()=>{const {game}=window.__comradeCandidateTest;game.dialogue.close();game.renderUi();window.__advance(0);});assert.equal((await page.evaluate(()=>window.__speechView())).phase,'returning');
      for(let i=0;i<9;i++){if(i)await page.evaluate(()=>window.__advance(45));await page.screenshot({path:evidence+'/'+language+'-close-'+String(i).padStart(2,'0')+'.png'});}
      assert.equal((await page.evaluate(()=>window.__speechView())).phase,'idle');await page.screenshot({path:evidence+'/'+language+'-conversation-closed.png'});
      await page.evaluate(()=>window.__start('dialogue.tony_fridge'));await page.evaluate(()=>window.__advance(360));assert.equal((await page.evaluate(()=>window.__speechView())).phase,'idle');
      const fallback=await page.evaluate(()=>{
        const {game}=window.__comradeCandidateTest;game.dialogue.close();game.sceneNpcSpeech.reset();
        const layer=window.__kiroLayer;const path=game.assets.getSceneAssetPath(game.currentScene.id,layer.speechAnimation.asset);
        const image=game.assets.images.get(path);image.dataset.loaded='false';window.__start('dialogue.mehana_waiter');
        const missing=window.__speechView();window.__advance(360);const used=window.__listenerDraw();image.dataset.loaded='true';const late=window.__advance(500);
        const listeningImage=game.assets.getSceneImage(game.currentScene.id,layer.speechAnimation.listeningPose.asset);listeningImage.dataset.loaded='false';const atlasFallback=window.__listenerDraw();
        image.dataset.loaded='false';window.__advance(0);const allMissing=window.__speechView(),noFacing=window.__draws();
        image.dataset.loaded='true';listeningImage.dataset.loaded='true';window.__advance(0);return{missing,late,used,atlasFallback,allMissing,noFacing};
      });assert.equal(fallback.missing.phase,'listening');assert.equal(fallback.late.phase,'listening');assert.deepEqual(fallback.used,[{asset:'mehanaWaiterListeningFinal',frame:0,weight:1}]);assert.deepEqual(fallback.atlasFallback,[{asset:'mehanaWaiterTalkingPolishing',frame:8,weight:1}]);assert.equal(fallback.allMissing.phase,'idle');assert.ok(fallback.noFacing.static);
      await page.evaluate(()=>{const {game}=window.__comradeCandidateTest;game.dialogue.enterNode('people');game.renderUi();window.__advance(0);});assert.equal((await page.evaluate(()=>window.__speechView())).phase,'speaking');
      await page.evaluate(()=>window.__advance(500));
      await page.evaluate(async()=>{const {game}=window.__comradeCandidateTest;await game.changeScene('scene.chapter1.village_square');});
      assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.sceneNpcSpeech.entries.size),0);
      assert.deepEqual(errors,[]);assert.deepEqual(failedRequests,[]);assert.deepEqual(badResponses,[]);
      report.languages.push({language,authoredFirstLineSeconds,frameIndices,continuationFrames,checks:{ownLine:true,easedInitialEntry:true,lineEndCompositePixelContinuous:true,settleUsesFrozenSpeechFrame:true,choicesClosedMouthListening:true,renderedFaceMatchesFrame8:true,mouthStoppedPixelsStable:true,playerAndOtherSpeakerInKiroConversation:true,nextKiroSpeech:true,loopBoundaryFacing:true,trueCloseReturnsIdle:true,unrelatedConversationIdle:true,pauseMenuFreeze:true,counterOcclusion:true,missingSpeechHoldsListener:true,missingStillUsesExactAtlasFrame:true,allFacingArtMissingStaticLimitation:true,noLateReplay:true,sceneExitReset:true},errors,failedRequests,badResponses});await context.close();
    }
    writeFileSync(evidence+'/browser-review.json',JSON.stringify(report,null,2)+'\n');
  }finally{await browser?.close();if(server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}}
});
