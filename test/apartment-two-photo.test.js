import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SAVE} from '../src/engine/ids.js';
import {SaveSystem} from '../src/engine/SaveSystem.js';
import {InventorySystem} from '../src/engine/InventorySystem.js';
import {requirementsMet,applyEffects} from '../src/engine/EffectSystem.js';
import {adultPhotoReward,photoReward,childPhotoRecovery,pepaPosterRule,pepaDiplomaRule} from '../src/content/chapter1/photoQuest.js';
import {initialPuzzle,movePuzzle} from '../src/engine/SlidingBlockPuzzle.js';
import {chapter1} from '../src/content/chapter1/index.js';
import {assetManifest} from '../src/content/art/assetManifest.js';
import {imageAssetPaths} from '../src/engine/AssetLoader.js';
import {isWalkable,findWalkPath,findTargetAt} from '../src/engine/SceneGeometry.js';
import {sceneRegisteredFrame} from '../src/engine/Renderer.js';
import {characterDefinitions} from '../src/content/art/characters.js';
import {initialPhotoPuzzle} from '../src/content/chapter1/photoPuzzleBeginner.js';
const ctx=()=>{const state=structuredClone(DEFAULT_SAVE);return {state,inventory:new InventorySystem({},state)};};
const reload=s=>new SaveSystem({getItem:()=>JSON.stringify(s)}).load();
const use=(r,c)=>{assert.ok(requirementsMet(r.requirements,c));assert.ok(applyEffects(r.effects,c));};
test('AD current geometry preserves reachable entry, photo, cupboard and window approaches',()=>{
 const a=chapter1.scenes.find(s=>s.id==='scene.chapter1.apartment');
 const exit=a.exits.find(t=>t.id==='exit.apartment.to_square');assert.deepEqual(exit.entryApproach,{x:990,y:510});
 const points=[exit.entryApproach,a.interactables.find(t=>t.id==='window').actions.use.approach,...a.interactables.filter(t=>['hotspot.apartment.adult_photo','hotspot.apartment.wardrobe'].includes(t.id)).map(t=>t.interactionApproach)];
 for(const p of points){assert.ok(isWalkable(a,p),JSON.stringify(p));assert.ok(findWalkPath(a,a.playerStart,p).length,JSON.stringify(p));}
 assert.equal(findTargetAt(a,{x:480,y:170})?.id,'hotspot.apartment.adult_photo');
 assert.notEqual(findTargetAt(a,{x:1200,y:500})?.id,'hotspot.apartment.photo_cupboard');
 assert.equal(findTargetAt(a,{x:850,y:250})?.id,'hotspot.apartment.wardrobe');
 const paths=imageAssetPaths(assetManifest.items['item.mitko_child_photo']);assert.ok(paths.includes(assetManifest.items['item.mitko_child_photo'].icon));
 assert.ok(imageAssetPaths(assetManifest.items['item.fake_diploma']).includes(assetManifest.items['item.fake_diploma'].childIcon));
});
test('apartment routes remain in the marked corridor with no floor under solid furniture',()=>{
 const a=chapter1.scenes.find(s=>s.id==='scene.chapter1.apartment');
 const points=[a.playerStart,{x:265,y:490},{x:290,y:480},{x:600,y:490},{x:740,y:520},{x:990,y:525},a.exits[0].entryApproach];
 for(const p of [{x:100,y:490},{x:400,y:650},{x:850,y:420},{x:1160,y:525},{x:500,y:400}])assert.equal(isWalkable(a,p),false,JSON.stringify(p));
 for(const from of points)for(const to of points){
  const path=findWalkPath(a,from,to);assert.ok(path.length,JSON.stringify({from,to}));
  let start=from;for(const end of path){const distance=Math.hypot(end.x-start.x,end.y-start.y);for(let i=0;i<=Math.ceil(distance);i++){
   const t=i/Math.max(1,Math.ceil(distance)),p={x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t};
   assert.ok(isWalkable(a,p),JSON.stringify({from,to,p}));
  }start=end;}
 }
});
test('window and speech use fixed source registration only in the apartment',()=>{
 const d=characterDefinitions['npc.bai_mitko'];
 for(const slot of ['external_opens_window','external_talk_east_long_1','external_talk_west_short_1']){
  const original={slot,scale:1.116,offsetY:-48.036,frameCount:10,fps:12,frameRects:[{x:0,y:0}],offsets:[{x:3,y:0}]};
  const before=structuredClone(original),f=sceneRegisteredFrame(original,d,'scene.chapter1.apartment');
  assert.equal(f.registration.baselineY,slot==='external_opens_window'?578:510);assert.equal(f.scale,1);
  if(slot==='external_opens_window')assert.equal(f.offsetY,0);
  assert.equal(f.frameCount,10);assert.equal(f.fps,12);assert.equal(f.frameRects,original.frameRects);assert.equal(f.offsets,original.offsets);
  assert.deepEqual(original,before);assert.equal(sceneRegisteredFrame(original,d,'scene.chapter1.village_square'),original);
 }
 const walk={slot:'external_walk_east_start'};assert.equal(sceneRegisteredFrame(walk,d,'scene.chapter1.apartment'),walk);
});
test('registered native window replaces static window overlays with state endpoints',()=>{
 const a=chapter1.scenes.find(s=>s.id==='scene.chapter1.apartment');
 const closed=a.foregroundLayers.find(l=>l.id==='layer.apartment.window_closed'),opened=a.foregroundLayers.find(l=>l.id==='layer.apartment.window_open');
 assert.equal(closed,undefined);assert.equal(opened,undefined);
 assert.equal(a.interactionPresentation.flag,'apartmentWindowOpen');
 assert.equal(a.interactionPresentation.closedFrame,0);assert.equal(a.interactionPresentation.openFrame,22);
 const open=a.interactables.find(t=>t.id==='window').actions.use,close=a.interactables.find(t=>t.id==='window.open').actions.use;
 assert.equal(open.flipX,false);assert.equal(open.facing,'west');assert.ok(isWalkable(a,open.approach));assert.ok(isWalkable(a,close.approach));
 assert.equal(close.reverseAnimation,undefined);assert.equal(close.windowPresentation.behindActor,false);
});
test('removed accordion/papers have no invisible pickup and their old items stay defined',()=>{
 const a=chapter1.scenes.find(s=>s.id==='scene.chapter1.apartment');
 assert.equal(a.interactables.some(t=>t.id==='hotspot.apartment.accordion'),false);
 assert.equal(a.foregroundLayers.some(l=>l.id==='layer.apartment.accordion_on_chair'),false);
 assert.ok(chapter1.items.some(i=>i.id==='item.accordion'));
 assert.equal(a.interactables.some(t=>t.id==='hotspot.apartment.unpaid_bills'),false);
 assert.equal(a.foregroundLayers.some(l=>l.id==='layer.apartment.bills_on_table'),false);
 assert.ok(chapter1.items.some(i=>i.id==='item.unpaid_bills'));
});
test('adult photo is independent of puzzle and cannot satisfy child diploma recipe',()=>{
 const c=ctx();use(adultPhotoReward,c);c.state.flags.pepaMusicPlayed=true;
 assert.ok(requirementsMet(pepaPosterRule.requirements,c));assert.equal(c.state.flags.photoCupboardSolved,undefined);
 c.inventory.add('item.tony_diploma');assert.equal(requirementsMet(pepaDiplomaRule.requirements,c),false);
 use(pepaPosterRule,c);use(photoReward,c);use(pepaDiplomaRule,c);
 assert.ok(c.inventory.has('item.mitko_photo'));assert.ok(c.inventory.has('item.mitko_child_photo'));
 assert.equal(c.inventory.has('item.tony_diploma'),false);assert.equal(c.state.flags.childhoodDiplomaEdition,true);
});
test('child photo cannot satisfy poster recipe and rewards do not duplicate',()=>{
 const c=ctx();c.state.flags.pepaMusicPlayed=true;use(photoReward,c);
 assert.equal(requirementsMet(pepaPosterRule.requirements,c),false);
 assert.equal(requirementsMet(photoReward.requirements,c),false);
 assert.equal(requirementsMet(childPhotoRecovery.requirements,c),false);
 c.inventory.remove('item.mitko_child_photo');c.state.droppedItems=[{itemId:'item.mitko_child_photo',sceneId:'scene.chapter1.apartment',x:900,y:600}];
 const s=reload(c.state);assert.equal(s.inventory.includes('item.mitko_child_photo'),false);assert.equal(s.droppedItems.length,1);assert.equal(s.flags.childPhotoRecovered,true);
});
test('municipal stamp remains visible on the childhood edition without changing legacy icons',()=>{
 const item=chapter1.items.find(i=>i.id==='item.fake_diploma'),c=ctx();
 const slot=()=>item.iconRules.find(r=>requirementsMet(r.requirements,c))?.slot;
 c.state.flags.childhoodDiplomaEdition=true;assert.equal(slot(),'childIcon');
 c.state.flags.mayorDiplomaStamped=true;assert.equal(slot(),'stampedIcon');
 assert.ok(imageAssetPaths(assetManifest.items[item.id]).includes(assetManifest.items[item.id].stampedIcon));
 delete c.state.flags.childhoodDiplomaEdition;assert.equal(slot(),'stampedIcon');
});
test('solved v2 cupboard grants child recovery once without moving adult dropped photo',()=>{
 const s=structuredClone(DEFAULT_SAVE);s.photoQuestVersion=2;s.flags.photoCupboardSolved=true;
 s.droppedItems=[{itemId:'item.mitko_photo',sceneId:'scene.chapter1.apartment',x:900,y:600}];
 const restored=reload(s),c={state:restored,inventory:new InventorySystem({},restored)};
 assert.equal(restored.flags.adultPhotoTaken,true);assert.equal(restored.droppedItems.length,1);
 use(childPhotoRecovery,c);assert.equal(requirementsMet(childPhotoRecovery.requirements,c),false);
 assert.equal(reload(restored).inventory.filter(i=>i==='item.mitko_child_photo').length,1);
});
test('partial v2 medium puzzle is archived exactly while earned diploma/poster/registration/ending remain unchanged',()=>{
 for(const completed of [false,true]){
 const s=structuredClone(DEFAULT_SAVE);s.photoQuestVersion=2;s.photoPuzzle=movePuzzle(initialPuzzle(),'yellow1',0,-1);
 s.inventory=['item.fake_diploma'];s.hasFakeDiploma=true;s.flags.pepaDiplomaAltered=true;s.flags.campaignPosted=true;s.flags.candidateRegistrationStamped=true;s.chapter1Completed=completed;
 const r=reload(s);assert.deepEqual(r.photoPuzzleMediumPreserved,s.photoPuzzle);assert.deepEqual(r.photoPuzzle,initialPhotoPuzzle());assert.deepEqual(r.inventory,s.inventory);
 assert.equal(r.flags.childhoodDiplomaEdition,undefined);assert.equal(r.flags.pepaMusicPlayed,undefined);
 assert.equal(r.flags.campaignPosted,true);assert.equal(r.flags.candidateRegistrationStamped,true);assert.equal(r.chapter1Completed,completed);
 }
});
test('only explicit Toni acceptance starts challenge; water works without accordion or music',()=>{
 const d=chapter1.dialogues.find(d=>d.id==='dialogue.tony_fridge');
 const accept=d.nodes.challenge.choices.find(c=>c.next==='challenge_accepted');const c=ctx();use(accept.effect,c);assert.equal(c.state.flags.tonyChallengeStarted,true);
 const tavern=chapter1.scenes.find(s=>s.id==='scene.chapter1.mehana');const t=tavern.npcs.find(n=>n.id==='npc.tony_fridge');
 assert.equal(t.itemUseRules.some(r=>r.itemId==='item.accordion'),false);
 const glass=tavern.interactables.find(t=>t.id==='hotspot.mehana.bai_mitko_rakia_glass');
 const water=glass.itemUseRules.find(r=>r.itemId==='item.fountain_water_bottle');
 const fresh=ctx();fresh.inventory.add('item.fountain_water_bottle');assert.equal(requirementsMet(water.requirements,fresh),false);
 c.inventory.add('item.fountain_water_bottle');assert.ok(requirementsMet(water.requirements,c));
 use(water,c);assert.equal(c.state.swappedOwnRakiaWithWater,true);assert.equal(c.state.flags.tonyDistracted,undefined);assert.equal(c.state.flags.pepaMusicPlayed,undefined);
});
