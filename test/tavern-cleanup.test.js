import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {chapter1} from '../src/content/chapter1/index.js';
import {isWalkable,findWalkPath,nearestReachableWalkablePoint} from '../src/engine/SceneGeometry.js';
import {requirementsMet,applyEffects} from '../src/engine/EffectSystem.js';
import {InventorySystem} from '../src/engine/InventorySystem.js';
import {SaveSystem} from '../src/engine/SaveSystem.js';
import {Game} from '../src/engine/Game.js';
const scene=chapter1.scenes.find(s=>s.id==='scene.chapter1.mehana');
const water=chapter1.dialogues.find(d=>d.id==='dialogue.mehana_waiter').nodes.start.choices.find(c=>c.textKey==='dialogue.waiter.choice.water');

test('tavern blocked furniture and bar cannot be entered; all floor routes avoid blocked cells',()=>{
 const blocked=[{x:430,y:530},{x:850,y:570},{x:770,y:440},{x:930,y:425},{x:530,y:435},{x:1060,y:550}];
 for(const point of blocked)assert.equal(isWalkable(scene,point),false,JSON.stringify(point));
 const destinations=[{x:120,y:535},{x:120,y:680},{x:400,y:680},{x:590,y:680},{x:610,y:540}];
 for(const from of destinations)for(const to of destinations){
  assert.equal(isWalkable(scene,from),true);
  const path=findWalkPath(scene,from,to);assert.ok(path.length,'connected aisles');
  let previous=from;for(const end of path){const n=Math.max(1,Math.ceil(Math.hypot(end.x-previous.x,end.y-previous.y)));for(let i=0;i<=n;i++)assert.equal(isWalkable(scene,{x:previous.x+(end.x-previous.x)*i/n,y:previous.y+(end.y-previous.y)*i/n}),true,'path never cuts through furniture');previous=end;}
 }
 for(const point of blocked)assert.equal(isWalkable(scene,nearestReachableWalkablePoint(scene,scene.playerStart,point)),true);
 const enter=chapter1.scenes.find(s=>s.id==='scene.chapter1.village_square').exits.find(e=>e.id==='exit.square.to_mehana');
 assert.equal(isWalkable(scene,enter.targetPosition),true);assert.equal(isWalkable(scene,scene.playerStart),true);
 const approach=scene.npcs.find(n=>n.id==='npc.mehana_waiter').interactionApproach;
 assert.deepEqual(approach,{x:650,y:550});assert.equal(isWalkable(scene,approach),true);
 for(const point of [{x:700,y:580},{x:850,y:550},{x:650,y:650}])assert.equal(isWalkable(scene,point),false,'furniture centres remain blocked');
});

test('removed props and obsolete chair overlays cannot render or intercept input',()=>{
 for(const suffix of ['rear_chairs','table_group_left','table_group_right','kaliakra_oil','water_jug','newspaper_left_table'])assert.ok(!scene.foregroundLayers.some(l=>l.id==='layer.mehana.'+suffix));
 assert.equal(scene.interactables.some(t=>t.id==='hotspot.mehana.water_jug'),false);
 for(const suffix of ['oil','newspaper'])assert.equal(requirementsMet(scene.interactables.find(t=>t.id==='hotspot.mehana.'+suffix).requirements),false);
});

test('NPC occluders retain exact approved pixels only around Kiro and Tony, with no chair or floor masks over player routes',async()=>{
 for(const name of ['tony-table','kiro-counter']){
 const spec=JSON.parse(readFileSync('assets_src/chapter1/scenes/mehana/'+name+'-occluder-v1.json'));
 const original=await sharp(spec.source).ensureAlpha().raw().toBuffer();
 const {data,info}=await sharp(spec.output).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {left,top,width,height}=spec.rect;let retained=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*4;
  if(x>=left&&x<left+width&&y>=top&&y<top+height){assert.deepEqual(data.subarray(i,i+4),original.subarray(i,i+4));if(data[i+3])retained++;}
  else assert.equal(data[i+3],0,'no invisible actor-cutting pixels outside Tony');
 }
 assert.ok(retained>(name==='tony-table'?30000:15000));assert.equal(data[(380*info.width+550)*4+3],0,'marked old chair back cannot occlude Mitko');
 }
});

test('Kiro no longer offers obsolete water and old held/dropped jug saves migrate without affecting intoxication',()=>{
 assert.equal(water,undefined);assert.equal(scene.interactables.some(t=>t.id==='hotspot.mehana.water_jug'),false);
 for(const chapter1Completed of [false,true]){
 const raw={currentSceneId:scene.id,chapter1Completed,inventory:['item.glass_of_water','item.fountain_water_bottle'],droppedItems:[{itemId:'item.glass_of_water'}],hasGlassOfWater:true,rakiaGlasses:5,flags:{hasGlassOfWater:true},inventoryUseItemId:'item.glass_of_water',selectedInventoryItemId:'item.glass_of_water',inspectedItemId:'item.glass_of_water'};
 const saved=new SaveSystem({getItem:()=>JSON.stringify(raw)}).load();
 assert.deepEqual(saved.inventory,['item.fountain_water_bottle']);assert.deepEqual(saved.droppedItems,[]);assert.equal(saved.rakiaGlasses,5);
 for(const key of ['hasGlassOfWater','inventoryUseItemId','selectedInventoryItemId','inspectedItemId'])assert.equal(saved[key],undefined);
 assert.equal(saved.flags.hasGlassOfWater,undefined);
 }
});

test('fixed Kiro runtime preserves all36 frames/timing and originals, with padded registration and clear frame boundaries',async()=>{
 const source='assets_src/characters/mehana_waiter/spitting-fixed-owner-export-c01/';
 const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
 assert.equal(sha(source+'original-export.zip'),'f09a943c2d56b78fa73d1478fad0c76190797ffa6756d3d4b2599a8603799125');
 const frames=Object.values(JSON.parse(readFileSync(source+'sprite--9px-frames-36-rows-6-cols-6.json')).frames);
 assert.equal(frames.length,36);assert.equal(frames.reduce((sum,f)=>sum+f.duration,0),4500);
 const animation=scene.foregroundLayers.find(l=>l.id==='layer.mehana.waiter_idle').idleVariation.animation;
 assert.equal(animation.frameCount*animation.frameDurationMs,4500);assert.deepEqual(animation.registrationBounds,{x:46,y:102,w:170,h:512});
 const file='assets/chapter1/characters/mehana_waiter/kiro-spitting-fixed-owner-export-c01.webp';
 assert.equal(sha(file),'c59c1aab94611c79419be23f62880066a48f0b8086d8b3a5fb17c432d9cebf73');
 const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,1572);assert.equal(info.height,3684);
 for(let i=0;i<36;i++){
  const x=i%6*262,y=Math.floor(i/6)*614;let opaque=0;
  for(let yy=0;yy<614;yy++)for(let xx=0;xx<262;xx++){const alpha=data[((y+yy)*info.width+x+xx)*4+3];if(alpha>8){opaque++;assert.ok(xx>0&&xx<261&&yy>0&&yy<613,'no opaque pixel touches frame boundary');}}
  assert.ok(opaque>10000);
 }
 assert.equal(sha('assets/chapter1/characters/mehana_waiter/kiro-sneaky-glass-swap-web-c02.webp'),'6bf18a736158d6c3e21d39d25fc3844877cb0fb9b53024a962809ed426670ffc');
});
