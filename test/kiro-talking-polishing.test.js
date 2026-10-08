import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SceneNpcSpeech} from '../src/engine/SceneNpcSpeech.js';
import {Game} from '../src/engine/Game.js';
import {Renderer,sceneLayerAnimationFrame} from '../src/engine/Renderer.js';
import {chapter1} from '../src/content/chapter1/index.js';
import {assetManifest} from '../src/content/art/assetManifest.js';
import {sceneLayerGeometry} from '../src/content/chapter1/sceneLayers.generated.js';
import sharp from 'sharp';
const scene=chapter1.scenes.find(s=>s.id==='scene.chapter1.mehana');
const layer=scene.foregroundLayers.find(l=>l.id==='layer.mehana.waiter_idle');
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture() {
  const controller=new SceneNpcSpeech();let line=null,loaded=true,engaged=false;
  const update=(ms=0,options={})=>controller.update(scene,ms,{speech:()=>line,conversation:()=>engaged,available:a=>a!==layer.speechAnimation||loaded,...options});
  return {controller,update,line:elapsed=>{engaged=true;line={token:{},elapsed};return line;},stop:()=>{line=null;},close:()=>{line=null;engaged=false;},missing:()=>{loaded=false;},loaded:()=>{loaded=true;},view:()=>controller.presentation(scene.id,layer)};
}
test('Kiro loops toward listener, holds a closed mouth during choices, and idles only after conversation closes',()=>{
  const f=fixture();f.update();assert.equal(f.view().phase,'idle');
  const line=f.line(0);f.update();assert.equal(f.view().phase,'speaking');assert.equal(f.view().speechWeight,0);
  assert.equal(f.view().idleWeight,1);
  line.elapsed=360;f.update(360);assert.equal(f.view().speechWeight,1);
  const a=layer.speechAnimation,count=a.loopEndFrame-a.loopStartFrame+1;
  for(let i=0;i<count*2;i++){line.elapsed=i*a.frameDurationMs;f.update(a.frameDurationMs);assert.deepEqual(Renderer.prototype.sceneNpcSpeechFrames(a,f.view().speechTime),[{frameIndex:a.loopStartFrame+i%count,weight:1}]);assert.equal(f.view().idleWeight,0);}
  const lastTime=f.view().speechTime;f.stop();f.update();assert.equal(f.view().phase,'listening');assert.equal(f.view().speechWeight,1);
  f.update(140);assert.equal(f.view().speechTime,lastTime);assert.equal(f.view().speechWeight,.5);
  f.update(140);assert.equal(f.view().speechWeight,0);assert.equal(f.view().listeningWeight,1);
  const held=f.view();f.update(30000);assert.deepEqual(f.view(),held);
  f.line(0);f.update();assert.equal(f.view().phase,'speaking');assert.equal(f.view().transitionTime,0);
  assert.equal(f.view().idleWeight,0);f.close();f.update();assert.equal(f.view().phase,'returning');
  f.update(360);assert.equal(f.view().phase,'idle');
});
test('Missing or evicted speech art never starts late in the same line; a new line may start',()=>{
  const f=fixture();f.missing();const line=f.line(0);f.update();assert.equal(f.view().phase,'listening');
  f.loaded();line.elapsed=500;f.update(500);assert.equal(f.view().phase,'listening');
  f.line(0);f.update();assert.equal(f.view().phase,'speaking');f.update(140);
  f.missing();f.update(56);assert.equal(f.view().phase,'listening');f.loaded();f.update(56);assert.equal(f.view().phase,'listening');
});
test('Pause/menu freeze both speech and return; canceled, hidden and scene-departed playback cannot resume',()=>{
  const f=fixture();f.line(0);f.update();f.update(140);const active=f.view();f.update(50000,{paused:true});assert.deepEqual(f.view(),active);
  f.stop();f.update();const listener=f.view();f.update(50000,{paused:true});assert.deepEqual(f.view(),listener);
  f.close();f.update();f.update(50);const returning=f.view();f.update(50000,{paused:true});assert.deepEqual(f.view(),returning);
  f.line(0);f.update();f.update(0,{canceled:true});assert.equal(f.view().phase,'idle');f.update(100);assert.equal(f.view().phase,'listening');
  f.update(0,{visible:()=>false});assert.equal(f.view(),null);
  f.update();assert.equal(f.view().phase,'listening');
  f.controller.update({id:'another.scene',foregroundLayers:[],npcs:[]},0);assert.equal(f.view(),null);
});
test('Actual Game reading window admits only the matching NPC, expires without closing choices and freezes in menus',()=>{
  const controller=new SceneNpcSpeech();const session={id:'waiter',nodeId:'start'};
  let node={lineKey:'hello'};
  const game={dialogue:{current:session,getNode:()=>node},content:{dialogues:{waiter:{npcId:'npc.mehana_waiter'}}},
    currentScene:scene,sceneNpcSpeech:controller,renderer:{sceneLayerVisible:()=>true},state:{},player:{},
    effectContext:()=>({}),t:()=> 'Hello',speechBubbleVisibleSeconds:()=>2.5,
    assets:{getSceneImage:()=>({}),isLoaded:()=>true}};
  game.npcSpeechAnimationTime=id=>Game.prototype.npcSpeechAnimationTime.call(game,id);
  const update=seconds=>{Game.prototype.updateNpcDialogueSpeech.call(game,seconds);Game.prototype.updateSceneNpcSpeech.call(game,seconds);};
  update(0);assert.equal(controller.presentation(scene.id,layer).phase,'speaking');
  assert.equal(game.npcSpeechAnimationTime('npc.tony_fridge'),null);
  update(0.5);const time=game.npcSpeechAnimationTime('npc.mehana_waiter');game.menuOpen=true;update(50);assert.equal(game.npcSpeechAnimationTime('npc.mehana_waiter'),time);
  game.menuOpen=false;update(2.1);assert.equal(game.npcSpeechAnimationTime('npc.mehana_waiter'),null);assert.equal(controller.presentation(scene.id,layer).phase,'listening');
  update(.14);assert.equal(controller.presentation(scene.id,layer).phase,'listening');assert.equal(game.dialogue.current,session);
  session.nodeId='other';node={lineKey:'hello',npcId:'npc.tony_fridge'};update(0);assert.equal(controller.presentation(scene.id,layer).phase,'listening');
  session.nodeId='player';node={lineKey:'hello',npcId:'character.bai_mitko'};update(0);assert.equal(game.npcSpeechAnimationTime('npc.mehana_waiter'),null);
  session.nodeId='choices';node={choices:[]};update(0);assert.equal(game.npcSpeechAnimationTime('npc.mehana_waiter'),null);
  assert.equal(controller.presentation(scene.id,layer).phase,'listening');
  session.nodeId='kiro-again';node={lineKey:'hello'};update(0);assert.equal(controller.presentation(scene.id,layer).phase,'speaking');
  game.dialogue.current=null;node=null;update(0);update(.36);assert.equal(controller.presentation(scene.id,layer).phase,'idle');
});
test('Renderer preserves the anchor, prioritizes speech over swap and retains idle/static fallback',()=>{
  const f=fixture();const line=f.line(360);f.update();f.update(360);
  const images=Object.fromEntries([layer.asset,layer.animation.asset,layer.speechAnimation.asset,layer.speechAnimation.listeningPose.asset].map(key=>[key,{key}]));
  const loaded=new Set(Object.values(images)),calls=[];
  const game={sceneNpcSpeech:f.controller,assets:{getSceneImage:(_id,key)=>images[key],isLoaded:image=>loaded.has(image)}};
  const renderer=Object.assign(Object.create(Renderer.prototype),{game,ctx:{drawImage:(...a)=>calls.push(a)}});
  renderer.drawSceneRasterLayer(scene,layer);assert.equal(calls.at(-1)[0],images[layer.speechAnimation.asset]);
  assert.deepEqual(calls.at(-1).slice(5),[727,222,170*265/512,265]);
  const before=f.view();renderer.drawSceneRasterLayer(scene,layer);assert.deepEqual(f.view(),before);
  f.stop();f.update();f.update(280);renderer.drawSceneRasterLayer(scene,layer);assert.equal(calls.at(-1)[0],images[layer.speechAnimation.listeningPose.asset]);
  loaded.delete(images[layer.speechAnimation.listeningPose.asset]);renderer.drawSceneRasterLayer(scene,layer);assert.equal(calls.at(-1)[0],images[layer.speechAnimation.asset]);assert.deepEqual(calls.at(-1).slice(1,5),[0,512,170,512]);
  loaded.add(images[layer.speechAnimation.listeningPose.asset]);loaded.delete(images[layer.speechAnimation.asset]);renderer.drawSceneRasterLayer(scene,layer);assert.equal(calls.at(-1)[0],images[layer.speechAnimation.listeningPose.asset]);
  loaded.delete(images[layer.speechAnimation.listeningPose.asset]);renderer.drawSceneRasterLayer(scene,layer);assert.equal(calls.at(-1)[0],images[layer.animation.asset]);
  loaded.delete(images[layer.animation.asset]);renderer.drawSceneRasterLayer(scene,layer);assert.equal(calls.at(-1)[0],images[layer.asset]);
});
test('Interrupted blends preserve their exact composite and use eased, opacity-normalized fixed snapshots',()=>{
  const f=fixture();const line=f.line(0);f.update();line.elapsed=180;f.update(180);
  const before=f.view().samples;assert.equal(f.view().speechWeight,.5);assert.equal(f.view().idleWeight,.5);
  f.stop();f.update();assert.deepEqual(f.view().samples,before);
  f.update(140);const frozen=f.view().samples.find(s=>s.kind==='speech');assert.equal(frozen.time,180);
  const half=f.view().samples;f.line(0);f.update();assert.deepEqual(f.view().samples,half);
  for(const ms of [35,35,35,35]){f.update(ms);assert.ok(Math.abs(f.view().samples.reduce((n,s)=>n+s.weight,0)-1)<1e-10);}
});
test('Original PR50 baseline assets/content, prior Kiro records and layer geometry remain preserved',()=>{
  const baseline=JSON.parse(readFileSync('test/fixtures/kiro-talking-polishing-approved-baseline.json'));
  assert.equal(baseline.approvedBaseline,'47698763642003236f8a6cd4ec7994ece5a98e4e');
  const exceptions=new Set(['assets_src/chapter1/scenes/mehana/layers.json','assets_src/characters/mehana_waiter/external_animation_v1/animation-pilot.json','src/content/chapter1/sceneLayers.generated.js','src/content/art/assetManifest.js']);
  for(const [p,expected]of Object.entries(baseline.files))if(!exceptions.has(p))assert.equal(sha(readFileSync(p)),expected,p);
  const layers=JSON.parse(readFileSync('assets_src/chapter1/scenes/mehana/layers.json'));delete layers.layers.find(l=>l.id===layer.id).speechAnimation;assert.deepEqual(layers,baseline.layers);
  const pilot=JSON.parse(readFileSync('assets_src/characters/mehana_waiter/external_animation_v1/animation-pilot.json'));
  const c=pilot.animations.kiro_talking_polishing_web_final;delete pilot.animations.kiro_talking_polishing_web_final;delete pilot.animations.kiro_talking_polishing_web_c07;assert.deepEqual(pilot,baseline.pilot);
  const manifest=structuredClone(assetManifest);for(const key of ['mehanaWaiterTalkingPolishing','mehanaWaiterTalkingPolishingC07','mehanaWaiterListeningC07','mehanaWaiterListeningFinal'])delete manifest.scenes[scene.id][key];assert.deepEqual(manifest,baseline.manifest);
  const runtime=structuredClone(sceneLayerGeometry);delete runtime[scene.id].foregroundLayers.find(l=>l.id===layer.id).speechAnimation;assert.deepEqual(runtime,baseline.runtimeScenes);
  const input='assets_src/characters/mehana_waiter/external_animation_v1/';assert.equal(sha(readFileSync(input+c.source.storedFilename)),c.source.sourceZipSha256);
  assert.equal(sha(readFileSync(input+c.source.metadataFile)),c.source.metadataSha256);
  assert.equal(sha(readFileSync(c.import.runtime.asset)),c.import.derivedOutputHashes[c.import.runtime.asset]);
  assert.equal(layer.speechAnimation.frameCount*layer.speechAnimation.frameDurationMs,4672);
  assert.equal(sha(readFileSync('assets/chapter1/characters/mehana_waiter/kiro-talking-polishing-web-c07.webp')),'491804d07eb25221c3579b44b5f9d3d5673c598b27c87c38d821cc653168b91c');
  assert.equal(sha(readFileSync('assets/chapter1/characters/mehana_waiter/kiro-listening-c07-frame00-d01.png')),'284cb0ec753da8e2d69773f4a853124698ea43e22ee560a66c34a9064f11af10');
});
test('Final listening derivative is exactly source frame8 pixels, with truthful source/hash provenance',async()=>{
  const pilot=JSON.parse(readFileSync('assets_src/characters/mehana_waiter/external_animation_v1/animation-pilot.json'));
  const p=pilot.animations.kiro_talking_polishing_web_final.listeningPose;
  const crop=await sharp(p.runtimeParent.path).extract({left:0,top:512,width:170,height:512}).ensureAlpha().raw().toBuffer();
  const still=await sharp(p.output.path).ensureAlpha().raw().toBuffer();
  assert.deepEqual(still,crop);assert.equal(sha(still),p.extraction.pixelSha256);
  assert.equal(sha(readFileSync(p.output.path)),p.output.sha256);
  assert.equal(p.sourceFrameIndex,8);assert.equal(layer.speechAnimation.listeningFrameIndex,8);
});

test('Facing loop excludes downward intro/return on every reply and interpolates the wrap continuously',()=>{
  const a=layer.speechAnimation,sample=time=>Renderer.prototype.sceneNpcSpeechFrames(a,time);
  assert.deepEqual(sample(0),[{frameIndex:8,weight:1}]);
  assert.deepEqual(sample(47.5*73),[{frameIndex:55,weight:.5},{frameIndex:8,weight:.5}]);
  assert.deepEqual(sample(48*73),[{frameIndex:8,weight:1}]);
  for(let ms=0;ms<30000;ms+=17){const frames=sample(ms);assert.ok(frames.every(f=>f.frameIndex>=8&&f.frameIndex<=55));assert.ok(Math.abs(frames.reduce((n,f)=>n+f.weight,0)-1)<1e-9);}
});
