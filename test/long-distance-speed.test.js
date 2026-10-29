import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {stripLongDistance} from './helpers/long-distance-preservation.js';
import {MovementSystem, plannedWalkSeconds, calibratedWalkTime, LONG_WALK_CRUISE_SECONDS, LONG_WALK_RATIO, walkRampTime} from '../src/engine/MovementSystem.js';
import {characterDefinitions} from '../src/content/art/characters.js';
import {scenes} from '../src/content/chapter1/scenes.js';
import {characterHeight} from '../src/engine/CharacterRenderMath.js';
import {findWalkPath, isWalkable, walkPathDistance} from '../src/engine/SceneGeometry.js';
const parts=characterDefinitions['npc.bai_mitko'].animations.walk.parts;
function player(){return {position:{x:100,y:500},speed:100,facing:'east',animation:'idle',walkPath:[]};}
const options={calibrateLongJourney:true};
test('newest preservation inverse restores fixed PR66 code/helper bytes and rejects any unknown candidate',()=>{
 const fixture=JSON.parse(readFileSync('test/fixtures/long-distance-deltas.json'));
 for(const [path,record]of Object.entries(fixture.records)){
  const source=readFileSync(path);assert.equal(stripLongDistance(path,source),record.before);
  assert.equal(createHash('sha256').update(record.before).digest('hex'),record.beforeSHA256);
  assert.throws(()=>stripLongDistance(path,Buffer.concat([source,Buffer.from('\n')])),/exact (long-distance|turning pilot) candidate|exact scene fix/);
 }
 const unrelated=Buffer.from('unchanged');assert.equal(stripLongDistance('unrelated',unrelated),unrelated);
});
test('whole logical reachable route selects once at the measured cruise-time boundary',()=>{
 for(const [distance,ratio] of [[239.99,1],[240,LONG_WALK_RATIO],[240.01,LONG_WALK_RATIO]]){
  const p=player(),m=new MovementSystem(p);m.walkTo({x:100+distance,y:500},null,null,options);
  assert.equal(p.walkJourneyRatio,ratio);p.walkTravelElapsed=.3;m.update(.1);
  assert.equal(p.walkJourneyRatio,ratio);
 }
 const p=player(),m=new MovementSystem(p);m.walkTo({x:120,y:500},null,[{x:100,y:650},{x:120,y:650},{x:120,y:500}],options);
 assert.equal(p.walkJourneyRatio,LONG_WALK_RATIO,'detour length, not straight click distance');
});
test('short/new commands preserve baseline, complete brisk cycles keep travel/playback in proportion',()=>{
 const p=player(),m=new MovementSystem(p);m.walkTo({x:500,y:500},null,null,options);
 for(let i=0;i<10;i++){const before=p.position.x;m.update(.02);assert.ok(Math.abs(p.position.x-before-100*.02*p.walkCadenceRatio)<1e-10);}
 const elapsed=p.walkTravelElapsed;m.walkTo({x:105,y:500},null,null,options);
 assert.equal(p.walkTravelElapsed,elapsed);assert.equal(p.walkJourneyRatio,LONG_WALK_RATIO);
 m.update(1);assert.deepEqual(p.position,{x:105,y:500});assert.equal(p.target,null);
 m.walkTo({x:110,y:500},null,null,options);assert.equal(p.walkJourneyRatio,1);assert.equal(p.walkTravelElapsed,0);
});
test('active short-to-long upgrade eases without resetting acceleration, replaying pockets or repeated-click ramp resets',()=>{
 const p=player(),m=new MovementSystem(p);m.walkTo({x:200,y:500},null,null,options);m.update(.1);
 const elapsed=p.walkTravelElapsed;m.walkTo({x:1000,y:500},null,null,options);assert.equal(p.walkTravelElapsed,elapsed);
 assert.equal(p.walkJourneyFromRatio,1);assert.equal(p.walkJourneyRatio,1.2);
 m.update(.1);const boost=p.walkJourneyElapsed;m.walkTo({x:1000,y:500},null,null,options);
  assert.equal(p.walkJourneyElapsed,boost);assert.equal(p.walkPart,'loop');m.update(.2);
  assert.ok(p.walkCadenceRatio>1&&p.walkCadenceRatio<1.2);m.update(.02);assert.equal(p.walkCadenceRatio,1.2);
});
test('combined ramps integrate equally at30/60/144fps including a mid-ramp upgrade',()=>{
 const totals=[];for(const dt of [1/30,1/60,1/144,.001]){
  const p={walkJourneyFromRatio:1,walkJourneyRatio:1.2,walkJourneyElapsed:0};let elapsed=.1,total=0;
  for(let t=0;t<.8-1e-10;){const step=Math.min(dt,.8-t);total+=calibratedWalkTime(p,elapsed,step);p.walkJourneyElapsed+=step;elapsed+=step;t+=step;}totals.push(total);
 }
 for(const total of totals)assert.ok(Math.abs(total-totals[0])<1e-10);
 assert.equal(calibratedWalkTime({},0,.2),walkRampTime(0,.2));
});
test('no-op/invalid command preserves the active route calibration and original acceleration',()=>{
 const p=player(),m=new MovementSystem(p);m.walkTo({x:1000,y:500},null,null,options);m.update(.1);
 const state={ratio:p.walkJourneyRatio,elapsed:p.walkTravelElapsed,boost:p.walkJourneyElapsed,target:p.target};
 assert.equal(m.walkTo({...p.position},null,null,options),false);
 assert.deepEqual({ratio:p.walkJourneyRatio,elapsed:p.walkTravelElapsed,boost:p.walkJourneyElapsed,target:p.target},state);
});
for(const [id,a,b]of [['apartment',{x:1000,y:515},{x:270,y:490}],['village_square',{x:1050,y:620},{x:380,y:620}],['mehana',{x:140,y:580},{x:690,y:580}]])for(const reverse of [false,true]){
 test(`${id} reverse=${reverse}: reachable route/perspective estimate and exact brisk arrival`,()=>{
  const scene=scenes.find(s=>s.id.endsWith('.'+id)),start=reverse?b:a,end=reverse?a:b;
  assert.ok(isWalkable(scene,start));assert.ok(isWalkable(scene,end));const path=findWalkPath(scene,start,end);assert.ok(path.length);
  const p={...player(),position:{...start},walkPartsByFacing:parts,speed:scene.movementSpeed*1.5625,animator:{frameIndex:4,isFinished:()=>true}};
  const heightAt=point=>characterHeight(characterDefinitions['npc.bai_mitko'],scene,point),seconds=plannedWalkSeconds(p,path,heightAt);
  assert.ok(seconds>LONG_WALK_CRUISE_SECONDS);assert.ok(walkPathDistance(start,path)>500);
  const m=new MovementSystem(p);m.walkTo(end,end,path,{...options,heightAt});p.walkPart='loop';
  for(let i=0;i<2000&&p.target;i++){p.walkVisualHeight=heightAt(p.position);m.update(.02);}
  assert.equal(p.target,null);assert.deepEqual(p.position,end);
 });
}
test('front/rear estimates use their accepted stride coefficient and local actor height',()=>{
 for(const facing of ['north','south']){
  const p={...player(),walkPartsByFacing:parts,walkVisualHeight:300,facing};const sign=facing==='north'?-1:1;
  const route=[{x:100,y:500+sign*300}];
  const seconds=plannedWalkSeconds(p,route,()=>300);
  assert.ok(Math.abs(seconds-1/parts[facing].loop.gaitSpeedPerVisualHeight)<1e-10);
  assert.ok(Math.abs(plannedWalkSeconds(p,route,()=>150)-2*seconds)<1e-10);
 }
});
