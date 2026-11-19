import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {browserAvailable} from './helpers/browser-availability.js';
import {observeImageDecode} from './helpers/image-decode-diagnostics.js';

test('tavern floor, Kiro recovery and fixed spit render in BG/EN through normal generated assets', {timeout:180000},async t=>{
 if(!browserAvailable(t,chromium.executablePath()))return;
 const port=await new Promise(resolve=>{const probe=createServer();probe.listen(0,'127.0.0.1',()=>{const p=probe.address().port;probe.close(()=>resolve(p));});});
 const origin='http://127.0.0.1:'+port;
 const server=spawn(process.execPath,['tools/dev-server.mjs'],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
 const root=process.env.BAIM_TAVERN_REVIEW_DIR||'target/tavern-cleanup-review';mkdirSync(root,{recursive:true});
 const report={nativeDurationMs:4500,sampleMs:125,sourceAssetOverrides:false,languages:[],decodeDiagnostics:[]};let browser;const observers=[];
 try{
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(origin)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}assert.equal(ready,true);
  browser=await chromium.launch({headless:true});
  for(const language of ['bg','en']){
   const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'}),page=await context.newPage(),errors=[],failed=[],captures=[];
   page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>failed.push(r.url()));page.on('response',r=>{if(r.status()>=400)failed.push(r.url()+':'+r.status());});
   await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
   await page.goto(origin+'/?play=1&testHarness=1');await page.evaluate(()=>window.__comradeCandidateTest.ready);
   const advance=ms=>page.evaluate(ms=>{const g=window.__comradeCandidateTest.game;let left=ms;do{const step=Math.min(50,left);g.tick(g.lastTime+step);left-=step;}while(left>0);},ms);
   const shot=async(name,delayMs=125)=>{await advance(0);const file=`${root}/${language}-${String(captures.length).padStart(3,'0')}-${name}.png`;await page.screenshot({path:file});captures.push({path:file,delayMs,name});};
   const binding=await page.evaluate(async language=>{
    const g=window.__comradeCandidateTest.game;g.setLanguage(language);await g.changeScene('scene.chapter1.mehana');await g.assets.preloadSceneAssets(g.currentScene.id);await g.assets.preloadCharacterSlots(g.player.id,g.bootstrapCharacterSlots());g.protectCurrentAssetWorkingSet();
    const m=await(await fetch('/target/runtime-assets/manifest.json',{cache:'no-store'})).json(),path=g.assets.getSceneAssetPath(g.currentScene.id,'mehanaWaiterSneakyGlassSwap'),im=g.assets.getSceneImage(g.currentScene.id,'mehanaWaiterSneakyGlassSwap');
    // Preload already awaits the loader's decode. Inspect and draw that exact
    // protected game image rather than requesting a second asynchronous decode.
    const requireReady=(key,image)=>{if(!g.assets.isLoaded(image)||!image.complete||!image.naturalWidth||!image.naturalHeight)throw Error('Game image is not ready: '+JSON.stringify({key,path:g.assets.getSceneAssetPath(g.currentScene.id,key),status:g.assets.getImageStatus(image),src:image?.getAttribute('src'),width:image?.naturalWidth,height:image?.naturalHeight,protected:g.assets.protectedPaths.has(g.assets.getSceneAssetPath(g.currentScene.id,key))}));};
    requireReady('mehanaWaiterSneakyGlassSwap',im);
    const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;canvas.getContext('2d').drawImage(im,0,0,2,2);const pixels=Array.from(canvas.getContext('2d').getImageData(0,0,2,2).data);
    const occluders=[];for(const key of ['mehanaCounterFront','leftTablePlayerOccluder','rightTablePlayerOccluder']){const img=g.assets.getSceneImage(g.currentScene.id,key);requireReady(key,img);const c=document.createElement('canvas');c.width=1280;c.height=720;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);occluders.push({key,path:g.assets.getSceneAssetPath(g.currentScene.id,key),width:img.naturalWidth,height:img.naturalHeight,aisleAlpha:[[550,380],[620,480],[620,650]].map(([x,y])=>ctx.getImageData(x,y,1,1).data[3])});}
    return {version:m.version,loadedVersion:g.assets.runtimeVersion,path,width:im.naturalWidth,height:im.naturalHeight,pixels,occluders,sceneAssetKeys:Object.keys(g.assets.manifest.scenes[g.currentScene.id])};
   },language);
   assert.equal(binding.version,binding.loadedVersion);assert.match(binding.path,/kiro-spitting-fixed-owner-export-c01\.[a-f0-9]{12}\.webp/);assert.deepEqual([binding.width,binding.height],[1572,3684]);assert.ok(binding.pixels.some((value,index)=>index%4===3&&value>0),'decoded atlas draws visible alpha');
   for(const key of ['mehanaRearChairs','tableGroupLeft','tableGroupRight','kaliakraOil','waterJug','todayNewspaper'])assert.ok(!binding.sceneAssetKeys.includes(key));
   assert.ok(binding.sceneAssetKeys.includes('tonyTableOccluder'));
   for(const mask of binding.occluders){assert.deepEqual([mask.width,mask.height],[1280,720]);assert.deepEqual(mask.aisleAlpha,[0,0,0]);assert.match(mask.path,/(kiro-counter-occluder|(?:left|right)-table-player-occluder)-v1\.[a-f0-9]{12}\.png/);}
   await shot('entry-clear-chairs-props',1000);
   // Actual ground click into the central aisle; every traversed feet position is checked.
   await page.locator('#game').click({position:{x:610,y:550}});
   let settled=false;for(let i=0;i<200;i++){
    await advance(100);const result=await page.evaluate(async()=>{const g=window.__comradeCandidateTest.game,{isWalkable}=await import('/src/engine/SceneGeometry.js');return {walkable:isWalkable(g.currentScene,g.player.position),moving:!!g.player.target};});assert.equal(result.walkable,true,'moving feet stay on visible floor');
    if(!result.moving){settled=true;break;}
   }assert.equal(settled,true);await shot('central-aisle-clear-chairs',1000);
   const feet=await page.evaluate(()=>({...window.__comradeCandidateTest.game.player.position}));assert.ok(feet.x>=580&&feet.x<=620&&feet.y>=510);
   const quietInterval=await page.evaluate(()=>{const g=window.__comradeCandidateTest.game;g.sceneIdleVariations.random=()=>0;g.sceneIdleVariations.reset();g.player.idleVariantTimer=1e9;return g.currentScene.foregroundLayers.find(l=>l.id==='layer.mehana.waiter_idle').idleVariation.intervalMinMs;});await advance(0);await advance(quietInterval+0.001);
   for(let i=0;i<36;i++){
    if(i)await advance(125);
    const sample=await page.evaluate(()=>{const g=window.__comradeCandidateTest.game,l=g.currentScene.foregroundLayers.find(l=>l.id==='layer.mehana.waiter_idle'),s=g.sceneIdleVariationPresentation(g.currentScene,l);return {phase:s.phase,frame:Math.floor(s.elapsed/125)};});
    assert.equal(sample.phase,'playing');assert.equal(sample.frame,i,'all36 native frames remain in order');await shot('spit-'+String(i).padStart(2,'0'));
   }
   await advance(125.001);await shot('return-polishing',700);
   const phase=await page.evaluate(()=>{const g=window.__comradeCandidateTest.game,l=g.currentScene.foregroundLayers.find(l=>l.id==='layer.mehana.waiter_idle');return g.sceneIdleVariationPresentation(g.currentScene,l).phase;});assert.equal(phase,'idle');
   // Existing actual bottle journey separately verifies acquisition, self-use refusal and Tony swap.
   const talkLabel=await page.evaluate(()=>window.__comradeCandidateTest.game.t('verb.talk'));
   await page.getByRole('button',{name:talkLabel,exact:true}).click();
   const talkPoint=await page.evaluate(async()=>{const g=window.__comradeCandidateTest.game,{findTargetAt}=await import('/src/engine/SceneGeometry.js');for(let y=230;y<340;y+=4)for(let x=730;x<815;x+=4)if(findTargetAt(g.currentScene,{x,y},t=>g.targetAvailable(t))?.id==='npc.mehana_waiter')return {x,y};throw Error('Kiro has no exposed hit target');});
   await page.locator('#game').click({position:talkPoint});
   for(let i=0;i<100;i++){
    await advance(100);const approach=await page.evaluate(async()=>{const g=window.__comradeCandidateTest.game,{isWalkable}=await import('/src/engine/SceneGeometry.js');return {walkable:isWalkable(g.currentScene,g.player.position),dialogue:g.dialogue.current?.id};});assert.equal(approach.walkable,true);
    if(approach.dialogue==='dialogue.mehana_waiter')break;
   }
   assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.dialogue.current?.id),'dialogue.mehana_waiter');
   assert.deepEqual(await page.evaluate(()=>({...window.__comradeCandidateTest.game.player.position})),{x:650,y:550});
   assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.content.items['item.glass_of_water']),undefined);
   await shot('kiro-dialogue-no-obsolete-water',1000);
   const farewell=await page.evaluate(()=>window.__comradeCandidateTest.game.t('dialogue.waiter.choice.leave'));
   await page.locator('.dialogue-choice-list').getByRole('button',{name:farewell,exact:true}).click();
   assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.dialogue.current),null);
   // Actual Talk Tony click must walk behind the right table before opening dialogue.
   const tonyPoint=await page.evaluate(async()=>{const g=window.__comradeCandidateTest.game,{findTargetAt}=await import('/src/engine/SceneGeometry.js');for(let y=305;y<440;y+=4)for(let x=880;x<1060;x+=4)if(findTargetAt(g.currentScene,{x,y},t=>g.targetAvailable(t))?.id==='npc.tony_fridge')return {x,y};throw Error('Tony has no exposed hit target');});
   await page.locator('#game').click({position:tonyPoint});
   for(let i=0;i<100;i++){
    await advance(100);const approach=await page.evaluate(async()=>{const g=window.__comradeCandidateTest.game,{isWalkable}=await import('/src/engine/SceneGeometry.js');return {walkable:isWalkable(g.currentScene,g.player.position),dialogue:g.dialogue.current?.id};});assert.equal(approach.walkable,true);
    if(approach.dialogue==='dialogue.tony_fridge')break;
   }
   assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.dialogue.current?.id),'dialogue.tony_fridge');
   assert.deepEqual(await page.evaluate(()=>({...window.__comradeCandidateTest.game.player.position})),{x:740,y:580});await shot('tony-behind-table',1000);
   await page.reload();await page.evaluate(()=>window.__comradeCandidateTest.ready);await advance(0);
   assert.equal(await page.evaluate(()=>window.__comradeCandidateTest.game.inventory.has('item.glass_of_water')),false);
   await page.evaluate(async()=>{const g=window.__comradeCandidateTest.game;await g.changeScene('scene.chapter1.village_square');await g.changeScene('scene.chapter1.mehana');});await advance(0);await shot('scene-reentry',1000);
   // Fresh normal owner URL, same earned save, no testHarness and no forced source assets.
   // The harness has finished. Release its decoded atlases before booting another game;
   // keep the context so the normal page still uses the exact earned save.
   await page.waitForLoadState('networkidle');await page.close();assert.equal(page.isClosed(),true);
   const normal=await context.newPage();const normalFailures=[];normal.on('pageerror',e=>normalFailures.push(String(e)));normal.on('requestfailed',r=>normalFailures.push(r.url()));normal.on('response',r=>{if(r.status()>=400)normalFailures.push(r.url());});
   const diagnostic=observeImageDecode(normal,{origin,language,browserVersion:browser.version()});observers.push(diagnostic);
   await diagnostic.installLifecycle();
   const diagnosticRecord={language,network:null,browser:null};report.decodeDiagnostics.push(diagnosticRecord);diagnostic.mark('normal-navigation');
   await normal.goto(origin+'/?play=1');await normal.waitForLoadState('networkidle');
   // Network quiet does not mean asynchronous startup decodes/first rendering finished.
   // Observe actual normal-game paint, without a harness, forced draw, sleep or decode retry.
   await normal.waitForFunction(()=>{const c=document.querySelector('#game');return c?.width>600&&c.height>350&&c.getContext('2d').getImageData(600,350,1,1).data[3]>0;});
   diagnostic.mark('networkidle-before-independent-decode');
   let normalBinding;
   try{normalBinding=await normal.evaluate(async()=>{
    const evidence={stage:'independent-manifest-fetch',documentReady:document.readyState,visibility:document.visibilityState,userAgent:navigator.userAgent,harnessPresent:!!window.__comradeCandidateTest,load:performance.getEntriesByType('navigation').map(r=>({domContentLoadedEventEnd:r.domContentLoadedEventEnd,loadEventEnd:r.loadEventEnd})),preloadHookAvailable:!!window.__comradeCandidateAnimationFit?.game};window.__baimIndependentDecodeDiagnostic=evidence;let im;
    try{
     const m=await(await fetch('/target/runtime-assets/manifest.json',{cache:'no-store'})).json(),url=m.manifest.scenes['scene.chapter1.mehana'].mehanaWaiterSneakyGlassSwap;
     evidence.manifestVersion=m.version;evidence.manifestPath=url;evidence.stage='independent-image-decode';
     im=new Image();im.src='/'+url;evidence.resolvedURL=im.src;await im.decode();const c=document.createElement('canvas');c.width=2;c.height=2;c.getContext('2d').drawImage(im,0,0,2,2);evidence.stage='independent-image-decoded-and-drawn';
     return {version:m.version,url,width:im.naturalWidth,height:im.naturalHeight,pixels:Array.from(c.getContext('2d').getImageData(0,0,2,2).data),harnessAbsent:!window.__comradeCandidateTest,requested:performance.getEntriesByType('resource').filter(r=>r.name.includes('kiro-spitting-fixed-owner-export-c01')).map(r=>r.name)};
    }catch(error){evidence.error={name:error.name,message:error.message};if(im){try{const c=document.createElement('canvas');c.width=2;c.height=2;c.getContext('2d').drawImage(im,0,0,2,2);evidence.afterFailureDraw={pixels:Array.from(c.getContext('2d').getImageData(0,0,2,2).data)};}catch(drawError){evidence.afterFailureDraw={error:{name:drawError.name,message:drawError.message}};}}throw error;}
    finally{evidence.image=im?{src:im.src,currentSrc:im.currentSrc,complete:im.complete,width:im.naturalWidth,height:im.naturalHeight}:null;evidence.resources=performance.getEntriesByType('resource').filter(r=>r.name.includes('kiro-spitting-fixed-owner-export-c01')||r.name.endsWith('/target/runtime-assets/manifest.json')).map(r=>({url:r.name,initiatorType:r.initiatorType,startTime:r.startTime,responseEnd:r.responseEnd,duration:r.duration,transferSize:r.transferSize,encodedBodySize:r.encodedBodySize,decodedBodySize:r.decodedBodySize,responseStatus:r.responseStatus}));evidence.heap=performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize,jsHeapSizeLimit:performance.memory.jsHeapSizeLimit}:null;}
   });}finally{try{diagnosticRecord.browser=await normal.evaluate(()=>window.__baimIndependentDecodeDiagnostic||null);}catch(error){diagnosticRecord.snapshotError=String(error.message);}diagnosticRecord.network=diagnostic.snapshot();writeFileSync(root+'/decode-diagnostics.json',JSON.stringify(report.decodeDiagnostics,null,2)+'\n');}
   assert.equal(normalBinding.harnessAbsent,true);assert.equal(normalBinding.version,binding.version);assert.deepEqual([normalBinding.width,normalBinding.height],[1572,3684]);assert.ok(normalBinding.requested.length>0);assert.deepEqual(normalBinding.pixels,binding.pixels);
   await normal.screenshot({path:`${root}/${language}-normal-owner-url.png`});assert.deepEqual(normalFailures,[]);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
   report.languages.push({language,binding,normalBinding,captures,feet,errors,failed,normalFailures});await context.close();
  }
  writeFileSync(root+'/review.json',JSON.stringify(report,null,2)+'\n');
 }catch(error){writeFileSync(root+'/failure.json',JSON.stringify({error:{name:error.name,message:error.message,stack:error.stack},report},null,2)+'\n');throw error;
 }finally{await browser?.close();for(let i=0;i<observers.length;i++){await observers[i].flush();report.decodeDiagnostics[i].network=observers[i].snapshot();observers[i].detach();}writeFileSync(root+'/decode-diagnostics.json',JSON.stringify(report.decodeDiagnostics,null,2)+'\n');if(server.exitCode===null){server.kill();await new Promise(resolve=>server.once('exit',resolve));}}
});
