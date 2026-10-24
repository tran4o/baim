import test from 'node:test';
import assert from 'node:assert/strict';
import {chapter1} from '../src/content/chapter1/index.js';
import {Game} from '../src/engine/Game.js';
import {planCharacterApproach} from '../src/engine/InteractionApproach.js';
import {characterDefinitions} from '../src/content/art/characters.js';
import {isWalkable,findWalkPath,findTargetAt} from '../src/engine/SceneGeometry.js';
import {SceneIdleVariations} from '../src/engine/SceneIdleVariations.js';
import {sceneZIndexForPoint} from '../src/engine/Renderer.js';
import sharp from 'sharp';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assetManifest} from '../src/content/art/assetManifest.js';
const square=chapter1.scenes.find(s=>s.id==='scene.chapter1.village_square');
const tavern=chapter1.scenes.find(s=>s.id==='scene.chapter1.mehana');
test('entry rest selects original centre-facing pocket pose before drawing, clearing stale idle state',()=>{
 for(const x of [100,640,1100])for(const old of ['north','south','east','west']){
  const g=Object.create(Game.prototype);g.currentScene=square;
  g.player={position:{x,y:540},facing:old,lastHorizontalFacing:old,walkPartsByFacing:characterDefinitions['npc.bai_mitko'].animations.walk.parts,idleVariant:{slot:'stale'},idleVariantQueue:[{}]};
  g.setSceneEntryRest();const expected=x===640?(old==='west'?'west':'east'):x<640?'east':'west';
  assert.equal(g.player.facing,expected);assert.equal(g.player.idleVariant,null);assert.deepEqual(g.player.idleVariantQueue,[]);
  const frame=g.player.walkPartsByFacing[expected].stop;assert.equal(g.player.idleHoldFrame.frame,frame);assert.equal(g.player.idleHoldFrame.frameIndex,frame.frameCount-1);
 }
});
test('tavern landing is floor-side of threshold and connects to both approved conversation stops',()=>{
 assert.deepEqual(tavern.playerStart,{x:150,y:585});assert.ok(isWalkable(tavern,tavern.playerStart));
 assert.deepEqual(square.exits.find(e=>e.id==='exit.square.to_mehana').targetPosition,tavern.playerStart);
 for(const to of [{x:650,y:550},{x:740,y:580},{x:400,y:680}])assert.ok(findWalkPath(tavern,tavern.playerStart,to).length);
 assert.equal(findTargetAt(tavern,{x:100,y:300})?.id,'exit.mehana.to_square');
});
test('fountain has a connected complete perimeter, while basin remains unwalkable',()=>{
 const route=[{x:350,y:550},{x:287.5,y:522.5},{x:665,y:470},{x:1042.5,y:522.5},{x:970,y:550},{x:750,y:610},{x:350,y:550}];
 for(let i=1;i<route.length;i++){
  assert.ok(isWalkable(square,route[i]));const path=findWalkPath(square,route[i-1],route[i]);assert.ok(path.length);
  let a=route[i-1];for(const b of path){const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)));for(let j=0;j<=n;j++)assert.ok(isWalkable(square,{x:a.x+(b.x-a.x)*j/n,y:a.y+(b.y-a.y)*j/n}));a=b;}
 }
 for(const p of [{x:650,y:485},{x:650,y:490},{x:500,y:510},{x:850,y:520},{x:650,y:550}])assert.equal(isWalkable(square,p),false);
 for(const y of [420,430,440,450,460])assert.equal(isWalkable(square,{x:650,y}),false,'rejected distant rear lane stays closed');
 for(const [from,to] of [[route[1],route[3]],[route[3],route[1]]]){
  const path=findWalkPath(square,from,to);assert.ok(path.some(p=>p.x>550&&p.x<800&&p.y<478),'rear crossing bends away at middle');
  assert.ok(path.some(p=>p.y>510),'rear crossing returns forward around the side');
  for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],n=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y));for(let j=0;j<=n;j++)assert.ok(isWalkable(square,{x:a.x+(b.x-a.x)*j/n,y:a.y+(b.y-a.y)*j/n}));}
 }
 assert.equal(isWalkable(square,{x:930,y:450}),false,'right edge cannot reopen the rejected distant lane');
 assert.equal(isWalkable(square,square.anchors.municipalityDoor),true,'municipality approach stays reachable');
 assert.ok(findWalkPath(square,{x:970,y:550},square.anchors.municipalityDoor).length);
 const municipality=chapter1.scenes.find(s=>s.id==='scene.chapter1.municipality');
 const returnPoint=municipality.exits.find(e=>e.id==='exit.municipality.to_square').targetPosition;
 assert.deepEqual(returnPoint,square.exits.find(e=>e.id==='exit.square.to_municipality').entryApproach);assert.ok(isWalkable(square,returnPoint));
 assert.ok(findWalkPath(square,returnPoint,{x:970,y:550}).length,'municipality return lands on connected ground, outside basin');
 const directRight=findWalkPath(square,returnPoint,{x:970,y:550});
 assert.ok(directRight.every(p=>p.x>=897.5),'right-side approach remains direct instead of detouring around the whole fountain');
 assert.ok(directRight.some(p=>p.x>1005),'right transition retains full gait clearance');
 for(const [from,to]of [[route[0],route[2]],[route[2],route[4]],[{x:350,y:490},{x:650,y:610}],[returnPoint,route[4]]]){
  let a=from;for(const b of findWalkPath(square,from,to)){
   if((a.y<516.5)!==(b.y<516.5)){
    const t=(516.5-a.y)/(b.y-a.y),x=a.x+(b.x-a.x)*t;
    assert.ok(x<325||x>1005,'depth order must change outside the fountain silhouette plus gait clearance: '+x);
   }a=b;
  }
 }
 const foreground=square.foregroundLayers.find(l=>l.asset==='fountainForeground');assert.ok(sceneZIndexForPoint(square,{x:650,y:485})>foreground.zIndex);assert.ok(sceneZIndexForPoint(square,{x:650,y:610})<foreground.zIndex);
});
test('removed pair leaves no invisible target, while Baba and fountain interactions remain',()=>{
 assert.equal(square.foregroundLayers.some(l=>l.id==='layer.square.old_men_chorus'),false);
 assert.equal(square.interactables.some(l=>l.id==='hotspot.square.old_men_bench'),false);
 assert.ok(square.npcs.some(n=>n.id==='npc.baba_stoyanka'));assert.ok(square.interactables.find(n=>n.id==='hotspot.square.statue').itemUseRules.length);
 assert.ok(square.interactables.find(n=>n.id==='hotspot.square.fountain').itemUseRules.length);
});
test('Baba uses connected pavement beside the preserved rear corridor',()=>{
 const target=square.npcs.find(n=>n.id==='npc.baba_stoyanka');
 const approach=planCharacterApproach(square,target,{x:300,y:540});
 assert.ok(approach);assert.deepEqual(approach.point,{x:442.5,y:477.5});
 assert.ok(approach.path.length);assert.ok(isWalkable(square,approach.point));
});
test('Kiro repeats only after a new bounded quiet interval and cancels an interrupted routine',()=>{
 const layer=tavern.foregroundLayers.find(l=>l.idleVariation),c=new SceneIdleVariations(()=>0),view=()=>c.presentation(tavern.id,layer);
 c.update(tavern,0);assert.equal(view().remainingMs,12000);c.update(tavern,11999);assert.equal(view().phase,'idle');c.update(tavern,1);assert.equal(view().phase,'playing');
 c.update(tavern,4500);assert.equal(view().phase,'idle');assert.equal(view().remainingMs,12000);
 c.update(tavern,12000);assert.equal(view().phase,'playing');c.update(tavern,0,{blocked:true});assert.equal(view(),null);c.update(tavern,0);assert.equal(view().remainingMs,12000);
});
test('owner Affinity combined basin/soldier/rifle export preserves exact pixels and depth roles',async()=>{
 const assets=assetManifest.scenes[square.id];
 const base=await sharp(assets.background).ensureAlpha().raw().toBuffer();
 const mask=await sharp(assets.fountainForeground).ensureAlpha().raw().toBuffer();
 assert.equal(createHash('sha256').update(readFileSync(assets.fountainForeground)).digest('hex'),'62c159985e2fde7e609f8a4886ec32764019b8d754e02c2083968b2a3e88e881');
 let opaque=0;for(let i=0;i<mask.length;i+=4)if(mask[i+3]>0){assert.deepEqual(mask.subarray(i,i+3),base.subarray(i,i+3));if(mask[i+3]===255)opaque++;}
 assert.ok(opaque>65000);assert.equal(mask[(440*1280+650)*4+3],255);assert.equal(mask[(610*1280+650)*4+3],0);
 const stone=square.foregroundLayers.find(l=>l.asset==='fountainForeground'),water=square.foregroundLayers.find(l=>l.asset==='fountainShallowWater');
 assert.deepEqual({left:stone.left,top:stone.top,z:stone.zIndex},{left:0,top:0,z:42});
 assert.ok(water.zIndex<stone.zIndex);assert.equal(water.visibleWhenFlag,'fountainRepaired');
 assert.ok(square.effects.every(e=>e.zIndex<stone.zIndex&&e.splashZIndex<stone.zIndex));
});
