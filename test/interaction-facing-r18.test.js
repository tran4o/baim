import test from 'node:test';import assert from 'node:assert/strict';
import { interactionSideFacing, canFaceStoppedInteraction, hasVerticalRest } from '../src/engine/InteractionFacing.js';
import { Game } from '../src/engine/Game.js';
import { readFileSync } from 'node:fs';import {PNG} from 'pngjs';

const make=()=>{const g=Object.create(Game.prototype);g.player={position:{x:350,y:480},facing:'north',animation:'idle',lastHorizontalFacing:'east',idleHoldFrame:{slot:'external_walk_north_loop'},idleVariant:{slot:'old'},directionalStopFrame:{facing:'north'},arrivalTurn:{phase:'turn'}};return g;};
test('stopped target-facing uses horizontal target position even for high objects, with a stable vertical tie',()=>{
 const p={position:{x:350,y:480},facing:'north',lastHorizontalFacing:'west'};
 assert.equal(interactionSideFacing(p,{x:244,y:195}),'west');assert.equal(interactionSideFacing(p,{x:950,y:100}),'east');
 assert.equal(interactionSideFacing(p,{x:350,y:10}),'west');assert.equal(interactionSideFacing({...p,lastHorizontalFacing:null,facing:'east'},{x:350,y:800}),'east');
});
test('new target clears incompatible held rear/front rest but allows subsequent idle variation to persist',()=>{
 const g=make();g.faceInteractionPoint({x:244,y:195});assert.equal(g.player.facing,'west');assert.equal(g.player.lastHorizontalFacing,'west');
 for(const key of ['idleHoldFrame','idleVariant','directionalStopFrame','arrivalTurn'])assert.equal(g.player[key],null,key);
 const variant={slot:'accepted-side-idle'};g.player.idleVariant=variant;g.resolveStoppedInteractionFacing();assert.equal(g.player.idleVariant,variant);
});
test('travelling, the complete accepted stop, and authored action animations retain priority',()=>{
 for(const animation of ['walk','action']){const g=make();g.player.animation=animation;const before=g.player.idleHoldFrame;g.faceInteractionPoint({x:244,y:195});assert.equal(g.player.facing,'north');assert.equal(g.player.idleHoldFrame,before);assert.equal(canFaceStoppedInteraction(g.player),false);g.player.animation='idle';g.resolveStoppedInteractionFacing();assert.equal(g.player.facing,'west');}
 const g=make();g.player.actionSequence={};g.faceInteractionPoint({x:244,y:195});assert.equal(g.player.facing,'north');
 g.player.actionSequence=null;g.sceneAction={active:true};g.resolveStoppedInteractionFacing();assert.equal(g.player.facing,'north');
});
test('stale front/back hold is cleared even if logical facing was already side-facing',()=>{
 const g=make();g.player.facing='west';g.player.interactionFacingPoint={x:244,y:195};assert.ok(hasVerticalRest(g.player));g.resolveStoppedInteractionFacing();assert.equal(g.player.idleHoldFrame,null);
});
test('a completed or cancelled stop without an object cannot leave a vertical rest pose',()=>{
 const g=make();g.player.arrivalTurn=null;g.player.lastHorizontalFacing='west';g.resolveStoppedInteractionFacing();assert.equal(g.player.facing,'west');assert.equal(g.player.idleHoldFrame,null);
 const moving=make();moving.player.animation='walk';moving.resolveStoppedInteractionFacing();assert.equal(moving.player.interactionFacingPoint,undefined);assert.equal(moving.player.facing,'north');
});
test('dining cleanup removes attributed background wedge and preserves real bottle, cup, cloth and chairs',()=>{
 const p=PNG.sync.read(readFileSync('assets/chapter1/scenes/apartment/occlusion-r18/dining.png')),alpha=(x,y)=>p.data[(y*p.width+x)*4+3];
 assert.equal(alpha(342,341),0);assert.equal(alpha(338,354),0);
 for(const xy of [[351,338],[355,380],[389,339],[480,370],[400,420],[204,381],[222,472],[617,430]])assert.ok(alpha(...xy)>0,JSON.stringify(xy));
 assert.ok(alpha(251,530)>0,'previous rectangular hole now contains the real chair blanket');
  for(const xy of [[400,600],[397,550],[407,610]])assert.equal(alpha(...xy),0,'No carpet column '+xy);
  for(const xy of [[361,600],[487,590],[433,570]])assert.ok(alpha(...xy)>0,'Real wooden leg '+xy);
});
