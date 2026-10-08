import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SceneIdleVariations, sceneIdleVariationsBlocked } from '../src/engine/SceneIdleVariations.js';
import { Game } from '../src/engine/Game.js';
import { Renderer, sceneLayerAnimationFrame } from '../src/engine/Renderer.js';
import { chapter1 } from '../src/content/chapter1/index.js';
import { assetManifest } from '../src/content/art/assetManifest.js';
const scene = chapter1.scenes.find(s => s.id === 'scene.chapter1.mehana');
const layer = scene.foregroundLayers.find(l => l.id === 'layer.mehana.waiter_idle');
const config = layer.idleVariation;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const view = controller => controller.presentation(scene.id, layer);

function fixture(random = () => 0) {
  const controller = new SceneIdleVariations(random);
  const update = (ms, options) => controller.update(scene, ms, options);
  update(0);
  return { controller, update };
}

test('Kiro samples bounded quiet intervals with controllable RNG, without render-time random calls', () => {
  for (const [rng, expected] of [[0,25000],[0.5,37500],[1,50000]]) {
    let calls = 0;
    const {controller, update} = fixture(() => { calls++; return rng; });
    assert.equal(view(controller).remainingMs, expected);
    for (let i=0;i<20;i++) assert.equal(view(controller).phase,'idle');
    assert.equal(calls,1);
    update(expected-1); assert.equal(view(controller).phase,'idle');
    update(1); assert.equal(view(controller).phase,'playing');
    assert.equal(view(controller).elapsed,0); assert.equal(calls,1);
  }
});

test('Kiro plays once, returns to polishing frame zero, and restarts a full fresh interval', () => {
  let calls=0;const {controller,update}=fixture(()=>{calls++;return calls===1?0:0.5;});
  update(25000);
  for(let i=0;i<36;i++) {
    assert.equal(sceneLayerAnimationFrame(view(controller).animation,view(controller).elapsed),i);
    update(131);
  }
  assert.equal(view(controller).phase,'idle');assert.equal(view(controller).idleTime,0);
  assert.equal(view(controller).remainingMs,37500);assert.equal(calls,2);
  update(37499);assert.equal(view(controller).phase,'idle');
  update(1);assert.equal(view(controller).phase,'playing');
});

test('Menu/pause time counts neither toward the quiet interval nor toward an active variation', () => {
  const {controller,update}=fixture();update(15000);
  const before=view(controller);update(100000,{paused:true});assert.deepEqual(view(controller),before);
  update(10000);update(131);const active=view(controller);
  update(100000,{paused:true});assert.deepEqual(view(controller),active);
  update(131);assert.equal(view(controller).elapsed,262);
});

test('Conversation takes priority on a due tick, cancels a playing occurrence, and never resumes it', () => {
  const {controller,update}=fixture();update(24999);update(1,{blocked:true});
  assert.equal(view(controller),null);update(100000,{blocked:true});assert.equal(view(controller),null);
  update(0);assert.equal(view(controller).remainingMs,25000);update(25000);update(500);
  update(0,{blocked:true,paused:true});assert.equal(view(controller),null);
  update(0);assert.equal(view(controller).phase,'idle');assert.equal(view(controller).idleTime,0);
  update(24999);assert.equal(view(controller).phase,'idle');
});

test('Scene departure and hidden/removed NPCs discard active and pending playback', () => {
  const {controller,update}=fixture();update(25000);
  controller.update({id:'other.scene',foregroundLayers:[],npcs:[]},50000);
  assert.equal(view(controller),null);update(0);assert.equal(view(controller).remainingMs,25000);
  update(25000);update(0,{visible:()=>false});assert.equal(view(controller),null);
  update(0);assert.equal(view(controller).remainingMs,25000);
  controller.update({...scene,npcs:[]},25000);assert.equal(view(controller),null);
});

test('Missing art consumes the due occurrence; late loading cannot replay it or a canceled occurrence', () => {
  const {controller,update}=fixture();
  update(25000,{available:a=>a!==config.animation});assert.equal(view(controller).phase,'idle');
  assert.equal(view(controller).remainingMs,25000);update(1);assert.equal(view(controller).phase,'idle');
  update(24999);assert.equal(view(controller).phase,'playing');
  update(1,{available:a=>a!==config.animation});assert.equal(view(controller).phase,'idle');
  update(1);assert.equal(view(controller).phase,'idle');assert.equal(view(controller).remainingMs,24999);
  update(0,{blocked:true});update(0);assert.equal(view(controller).remainingMs,25000);
});

test('No quiet accrual until the approved polishing asset is loaded; negative time never advances playback', () => {
  const {controller,update}=fixture();const before=view(controller);
  update(50000,{available:a=>a!==layer.animation});assert.deepEqual(view(controller),before);
  update(-50);assert.deepEqual(view(controller),before);
});

test('All conversations, speech, transitions and competing actions block the variation; menus freeze instead', () => {
  for(const patch of [{dialogue:{current:{id:'unrelated.dialogue'}}},{speechBubble:{}},{pendingSpeechBubble:{}},
    {npcSpeechBubble:{}},{player:{speaking:true}},{player:{actionSequence:{}}},{player:{animation:'action'}},
    {sceneTransitionPending:true},{editMode:true},{devHome:true},{animLab:true},{simpleAnimTest:true},{state:{chapter1Completed:true}}]) {
    assert.equal(sceneIdleVariationsBlocked(patch),true,JSON.stringify(patch));
  }
  assert.equal(sceneIdleVariationsBlocked({menuOpen:true}),false);
  assert.equal(sceneIdleVariationsBlocked({paused:true}),false);
  assert.equal(sceneIdleVariationsBlocked({player:{animation:'walk'}}),false);
});

test('The real Game hook cancels any dialogue and Renderer reads state without advancing clocks or RNG', () => {
  let calls=0;const scheduler=new SceneIdleVariations(()=>{calls++;return 0;});
  const images={};for(const a of [layer.animation,config.animation])images[a.asset]={};
  const game={currentScene:scene,sceneIdleVariations:scheduler,assets:{getSceneImage:(id,key)=>images[key],isLoaded:image=>Boolean(image)},
    renderer:{sceneLayerVisible:()=>true},player:{},state:{},dialogue:{},lastTime:0};
  game.sceneIdleVariationPresentation=(s,l)=>Game.prototype.sceneIdleVariationPresentation.call(game,s,l);
  Game.prototype.updateSceneIdleVariations.call(game,25);
  assert.equal(view(scheduler).phase,'playing');
  const renderer=Object.create(Renderer.prototype);renderer.game=game;renderer.ctx={drawImage(){}};
  renderer.drawSceneAnimationSamples=()=>true;
  const before=view(scheduler);for(let i=0;i<10;i++)renderer.drawSceneIdleVariation(scene,layer);
  assert.deepEqual(view(scheduler),before);assert.equal(calls,1);
  game.dialogue.current={id:'dialogue.tony_fridge'};
  assert.equal(game.sceneIdleVariationPresentation(scene,layer),null);
  Game.prototype.updateSceneIdleVariations.call(game,0);
  assert.equal(view(scheduler),null);
});

test('Candidate geometry, original timing, source hashes and every fixed approved baseline file are preserved', () => {
  const baseline=JSON.parse(readFileSync('test/fixtures/kiro-sneaky-glass-swap-approved-baseline.json'));
  assert.equal(baseline.approvedBaseline,'5484767bab0126b0a0504dd2efd97bf208735b07');
  for(const [path,expected] of Object.entries(baseline.files)) assert.equal(sha(readFileSync(path)),expected,path);
  const root='assets_src/characters/mehana_waiter/external_animation_v1/';
  const pilot=JSON.parse(readFileSync(root+'animation-pilot.json'));
  assert.equal(sha(JSON.stringify(pilot.animations.kiro_polishing_idle_web_c01)),baseline.polishingRecordSha256);
  assert.equal(pilot.animations.kiro_sneaky_glass_swap_web_c01.status,'rejected');
  assert.equal(pilot.animations.kiro_sneaky_glass_swap_web_c01.use,false);
  const candidate=pilot.animations.kiro_sneaky_glass_swap_web_c02;
  assert.ok(['runtime_review','runtime_approved'].includes(candidate.status));
  assert.equal(sha(readFileSync(root+candidate.source.storedFilename)),candidate.source.sourceZipSha256);
  assert.equal(sha(readFileSync(root+candidate.source.metadataFile)),candidate.source.metadataSha256);
  assert.equal(sha(readFileSync(candidate.import.runtime.asset)),candidate.import.derivedOutputHashes[candidate.import.runtime.asset]);
  assert.equal(assetManifest.scenes[scene.id].mehanaWaiterSneakyGlassSwap,candidate.import.runtime.asset);
  assert.deepEqual([layer.left,layer.top,layer.height,layer.zIndex],[727,222,265,50]);
  assert.deepEqual([config.intervalMinMs,config.intervalMaxMs],[25000,50000]);
  assert.equal(config.animation.loop,false);assert.equal(config.animation.frameCount*config.animation.frameDurationMs,4716);
  assert.deepEqual(config.animation.contentBounds,{x:0,y:0,w:170,h:512});
  for(const s of chapter1.scenes.filter(s=>s.id!==scene.id))assert.ok(s.foregroundLayers.every(l=>!l.idleVariation));
});
