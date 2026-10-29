import test from 'node:test';
import assert from 'node:assert/strict';
import { apartmentWindowActions as actions, apartmentWindowPresentation as config } from '../src/content/chapter1/apartmentWindow.generated.js';
import { interactionLayerPresentation, scenePosePlacement } from '../src/engine/InteractionPresentation.js';
import { Game } from '../src/engine/Game.js';
import { scenes } from '../src/content/chapter1/scenes.js';
import { isWalkable, findWalkPath } from '../src/engine/SceneGeometry.js';
import { readFileSync } from 'node:fs';
import { stripApartmentWindowR17, restoreApartmentWindowR17Snapshot } from './helpers/apartment-window-r17-preservation.js';

test('window uses approved forward actor ranges for both directions, independently of mechanical direction', () => {
  assert.deepEqual(actions.open.animationFrame, actions.close.animationFrame);
  const f = actions.open.animationFrame;
  assert.deepEqual(f.frameRects.map(r => r.sourceFrameIndex), [...Array.from({length:17},(_,i)=>i), ...Array.from({length:33},(_,i)=>31+i)]);
  assert.ok(Math.abs(f.fps * 0.026 - 1) < 1e-12); assert.equal(f.completeAfterMs, 1300);
  for (const action of Object.values(actions)) {
    assert.equal(action.reverseAnimation, undefined);
    assert.equal(action.animationFrame.frameCount, 50);
  }
});
test('rigid leaf follows actor clock, hides far-side grip on closing, and restores saved endpoints', () => {
  const scene={interactionPresentation:config},p={animation:'action',animator:{frameIndex:16},actionSequence:{sequence:actions.open}};
  assert.equal(interactionLayerPresentation(scene,p,{}).frame,0);
  p.animator.frameIndex=32; assert.equal(interactionLayerPresentation(scene,p,{}).frame,22);
  assert.equal(interactionLayerPresentation(scene,p,{}).behindActor,true);
  p.actionSequence.sequence=actions.close; p.animator.frameIndex=0;
  assert.equal(interactionLayerPresentation(scene,p,{}).behindActor,false);
  assert.equal(interactionLayerPresentation(scene,p,{}).frame,22);
  p.animation='idle';p.actionSequence=null;
  assert.equal(interactionLayerPresentation(scene,p,{apartmentWindowOpen:true}).frame,22);
  assert.equal(interactionLayerPresentation(scene,p,{}).frame,0);
  assert.equal(interactionLayerPresentation({},p,{}),null);
});
test('complete final source frame before applying the endpoint flag', () => {
  let completed=0;
  const g={player:{animation:'action',actionSequence:{sequence:actions.open},actionAnimation:actions.open.animationFrame,animator:{frameIndex:49,elapsed:1.28,isFinished:()=>true}},completeInteractionActionSequence:()=>completed++};
  Game.prototype.updateActionSequence.call(g);assert.equal(completed,0);
  g.player.animator.elapsed=1.3;Game.prototype.updateActionSequence.call(g);assert.equal(completed,1);
});
test('native game action resolver accepts the explicit registered frame without modifying global action families', () => {
  const g={player:{facing:'west'},randomAnimationFrame:()=>{throw Error('Should use explicit approved frame');}};
  const frame=Game.prototype.actionAnimationForSequence.call(g,actions.close);
  assert.equal(frame.slot,'external_apartment_window_r17');assert.equal(frame.reverseFrames,undefined);assert.equal(frame.flipX,false);
});
test('both approach anchors and the connecting route remain inside apartment walk mask', () => {
  const scene=scenes.find(s=>s.id==='scene.chapter1.apartment');
  for(const a of Object.values(actions))assert.ok(isWalkable(scene,a.approach));
  const route=findWalkPath(scene,actions.open.approach,actions.close.approach);assert.ok(route.length);
  for(const point of route)assert.ok(isWalkable(scene,point));
  const p=scene.characterPlacement;
  const placement=scenePosePlacement(scene,{id:p.characterId,facing:'west'},{frameWidth:399,frameHeight:599},true);
  assert.equal(placement.w,318);assert.equal(placement.h,478);
  assert.equal(scenePosePlacement(scene,{id:p.characterId,facing:'north'},{frameWidth:399,frameHeight:599},false),null);
  assert.equal(scenePosePlacement({}, {id:p.characterId,facing:'west'}, {}, false),null);
});

test('new incremental inverse preserves the exact prior local source and rejects unknown edits',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/apartment-window-r17-deltas.json',import.meta.url)));
 for(const [path,r]of Object.entries(f.records)){
  const current=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.equal(stripApartmentWindowR17(path,current,true),r.before);
  assert.throws(()=>stripApartmentWindowR17(path,current+'\n// unbound',true));
 }
 assert.equal(restoreApartmentWindowR17Snapshot('scenes',scenes).find(s=>s.id==='scene.chapter1.apartment').interactionPresentation,undefined);
});
