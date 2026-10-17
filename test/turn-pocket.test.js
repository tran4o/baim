import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {mitkoTurnPocket as pilot} from '../src/content/art/mitkoTurnPocket.generated.js';
import {mitkoTurnPilot} from '../src/content/art/mitkoTurnPilot.generated.js';
import {characterDefinitions} from '../src/content/art/characters.js';
import {assetManifest} from '../src/content/art/assetManifest.js';
import {beginArrivalTurn,updateArrivalTurn} from '../src/engine/ArrivalTurn.js';
import {MovementSystem} from '../src/engine/MovementSystem.js';
import {stripTurnPocket,restoreTurnPocketSnapshot} from './helpers/turn-pocket-preservation.js';
const parts=characterDefinitions['npc.bai_mitko'].animations.walk.parts;
function player(){return{position:{x:900,y:565},speed:100,walkVisualHeight:300,facing:'south',lastLocomotionFacing:'south',animation:'walk',walkPart:'loop',walkPartsByFacing:parts,arrivalTurnPilots:[mitkoTurnPilot,pilot],arrivalTurnReadySlots:{[pilot.frame.slot]:true,[mitkoTurnPilot.frame.slot]:true},animator:{frameIndex:0,elapsed:0,isFinished(){return true;}}};}
test('c05 originals and complete source-native36-frame timing are bound',()=>{
 const dir='assets_src/characters/bai_mitko/turning_front_west_pocket_c05_20261017/',r=JSON.parse(readFileSync(dir+'provenance.json')),sha=b=>createHash('sha256').update(b).digest('hex');
 for(const[file,key]of [['original-export.zip','sprite-max-px-frames-36-rows-6-cols-6.zip'],['original-preview.gif','sprite-max-px-frames-36-rows-6-cols-6.gif'],['sheet.png','sprite-max-px-frames-36-rows-6-cols-6.png'],['sheet.json','sprite-max-px-frames-36-rows-6-cols-6.json']])assert.equal(sha(readFileSync(dir+file)),r.hashes[key]);
 assert.deepEqual(pilot.frame.frameRects.map(r=>r.sourceFrameIndex),Array.from({length:36},(_,i)=>i));assert.equal(pilot.frame.frameCount/pilot.frame.fps,2.736);assert.equal(pilot.frame.frameRects.every(r=>r.duration===76),true);
});
test('c05 is limited to accepted south/contact0→west and readiness is per slot',()=>{
 const p=player();assert.equal(beginArrivalTurn(p,'west'),true);assert.equal(p.arrivalTurn.pilot,pilot);
 for(const i of [1,2,8,15]){const q=player();q.animator.frameIndex=i;assert.equal(beginArrivalTurn(q,'west'),false);}
 const q=player();q.arrivalTurnReadySlots[pilot.frame.slot]=false;assert.equal(beginArrivalTurn(q,'west'),false);assert.equal(beginArrivalTurn(q,'east'),true);
 for(const patch of [{lastLocomotionFacing:'north'},{pendingInteraction:{}},{pendingFacingPoint:{}},{speaking:true},{actionAnimation:{}}])assert.equal(beginArrivalTurn(Object.assign(player(),patch),'west'),false);
});
test('continuous c05 plays full final76ms then holds same frame/registration with no old pocket source',()=>{
 const p=player();beginArrivalTurn(p,'west');const frame=p.directionalStopFrame;p.animator.elapsed=35*.076;
 assert.equal(updateArrivalTurn(p),true);assert.ok(p.arrivalTurn);p.animator.elapsed=2.736;updateArrivalTurn(p);
 assert.equal(p.arrivalTurn,null);assert.equal(p.animation,'idle');assert.equal(p.facing,'west');assert.equal(p.idleHoldFrame.frame,frame);assert.equal(p.idleHoldFrame.frameIndex,35);assert.equal(p.directionalStopFrame,null);assert.deepEqual(p.position,{x:900,y:565});
});
test('click before c05 hand entry resumes gait immediately; no-op retains active turn',()=>{
 const p=player();beginArrivalTurn(p,'west');p.animator.frameIndex=13;const state=p.arrivalTurn,m=new MovementSystem(p);assert.equal(m.walkTo({...p.position}),false);assert.equal(p.arrivalTurn,state);
 m.walkTo({x:950,y:565});assert.equal(p.arrivalTurn,null);assert.equal(p.walkPart,'loop');m.update(.05);assert.ok(p.position.x>900);
});
test('click during or after c05 hand entry reverses only same-source exposed portion at native timing',()=>{
 for(const index of [14,18,23,35]){const p=player();beginArrivalTurn(p,'west');p.animator.frameIndex=index;new MovementSystem(p).walkTo({x:950,y:565});
  assert.equal(p.arrivalTurn,null);assert.equal(p.walkPart,'start');assert.equal(p.locomotionStartFrame.slot,pilot.frame.slot);assert.equal(p.locomotionStartFrame.fps,pilot.frame.fps);assert.deepEqual(p.locomotionStartFrame.frameRects.map(r=>r.sourceFrameIndex),Array.from({length:index-12},(_,i)=>index-i));assert.equal(p.locomotionStartFrame.movementSpeedMultipliers.every(v=>v===0),true);
 }
});
test('priority/missing-art cancellation cannot queue a late c05 replay',()=>{
 const p=player();beginArrivalTurn(p,'west');p.actionAnimation={};updateArrivalTurn(p);assert.equal(p.arrivalTurn,null);
 const q=player();beginArrivalTurn(q,'west');q.arrivalTurnReadySlots[pilot.frame.slot]=false;updateArrivalTurn(q);assert.equal(q.arrivalTurn,null);assert.equal(q.facing,'west');assert.equal(q.idleHoldFrame.slot,parts.west.stop.slot);q.arrivalTurnReadySlots[pilot.frame.slot]=true;new MovementSystem(q).update(.02);assert.equal(q.arrivalTurn,null);
});
test('c05 inverse restores exact PR68 bytes including protected helper and rejects tampering',()=>{
 const f=JSON.parse(readFileSync('test/fixtures/turn-pocket-deltas.json'));for(const[p,r]of Object.entries(f.records)){const b=readFileSync(p);assert.equal(stripTurnPocket(p,b),r.before);assert.throws(()=>stripTurnPocket(p,Buffer.concat([b,Buffer.from('tamper')])),/c05 inverse/);}
 assert.deepEqual(restoreTurnPocketSnapshot('manifest',assetManifest),f.snapshots.manifest.before);const bad=structuredClone(assetManifest);bad.characters['npc.bai_mitko'].turn_front_west_pocket_c05+='tamper';assert.throws(()=>restoreTurnPocketSnapshot('manifest',bad),/c05 inverse/);
});
