import test from 'node:test';
import assert from 'node:assert/strict';
import { chapter1 } from '../src/content/chapter1/index.js';
import { DEFAULT_SAVE } from '../src/engine/ids.js';
import { Game } from '../src/engine/Game.js';
import { SceneActionSequence } from '../src/engine/SceneActionSequence.js';
import { InventorySystem } from '../src/engine/InventorySystem.js';
import { QuestSystem } from '../src/engine/QuestSystem.js';
import { SaveSystem } from '../src/engine/SaveSystem.js';
import { applyEffects, firstMatchingRule } from '../src/engine/EffectSystem.js';
import { fountainRepairSequence, fountainRefillRules, statueItemRules, fountainItemRules, fountainUseRules } from '../src/content/chapter1/fountain.js';
const oil='item.sunflower_oil',empty='item.empty_rakia_bottle',water='item.fountain_water_bottle';
const square=chapter1.scenes.find(s=>s.id==='scene.chapter1.village_square');
const statue=square.interactables.find(t=>t.id==='hotspot.square.statue');
const basin=square.interactables.find(t=>t.id==='hotspot.square.fountain');
const index=a=>Object.fromEntries(a.map(x=>[x.id,x]));
function game(overrides={}) {
 const state={...structuredClone(DEFAULT_SAVE),inventory:[oil],...overrides};
 const g=Object.assign(Object.create(Game.prototype),{state,currentScene:square,sceneAction:new SceneActionSequence(),
 inventory:new InventorySystem(index(chapter1.items),state),quests:new QuestSystem(index(chapter1.quests),state),
 content:{items:index(chapter1.items)},player:{},assets:{getSceneImage:(_,key)=>key,isLoaded:()=>true,getItemImage:()=>null},
 saves:0,renderUi(){},save(){this.saves++;},setStatusMessage(){},clearStatusMessage(){},t:k=>k,
 protectCurrentAssetWorkingSet(){},hideSpeechBubble(){},sceneMovementSpeed:()=>80});
 return g;
}
test('oil basin rejection and all wrong liquid uses leave inventory and quest state exact',()=>{
 for(const target of [statue,basin])for(const item of ['item.rakia','item.village_wine',water,...(target===basin?[oil]:[])]){
  const g=game({inventory:[item]}),before=structuredClone(g.state);
  g.useInventoryItemOnTarget(item,target);assert.deepEqual(g.state,before);assert.equal(g.sceneAction.active,false);
 }
});
test('statue repairs only at blackout, consumes contents once, and shared explicit refill works repeatedly',()=>{
 const g=game();assert.equal(g.useInventoryItemOnTarget(oil,statue),true);
 assert.equal(g.useInventoryItemOnTarget(oil,statue),false);g.updateSceneAction(.34);
 assert.deepEqual(g.state.inventory,[oil]);assert.ok(g.sceneAction.fadeOpacity(square.id)>.9);
 g.updateSceneAction(.02);assert.deepEqual(g.state.inventory,[empty]);assert.equal(g.state.flags.fountainRepaired,true);
 assert.equal(g.sceneAction.fadeOpacity(square.id),1);assert.equal(g.saves,1);
 g.updateSceneAction(1);assert.equal(g.sceneAction.active,false);assert.equal(g.saves,1);
 for(const target of [statue,basin,statue,basin]){
  const rule=target.itemUseRules.find(r=>r===fountainRefillRules[0]);assert.ok(rule,'same operation object');
  assert.equal(g.useInventoryItemOnTarget(empty,target),true);assert.deepEqual(g.state.inventory,[water]);
  assert.equal(g.useInventoryItemOnTarget(empty,target),false);assert.deepEqual(g.state.inventory,[water]);
  assert.equal(applyEffects([{type:'replaceItem',itemId:water,withItemId:empty}],g.effectContext()),true);
 }
});
test('empty before repair and ordinary Look/Use after repair never refill',()=>{
 for(const target of [statue,basin]){
  const g=game({inventory:[empty]}),before=structuredClone(g.state);
  g.useInventoryItemOnTarget(empty,target);assert.deepEqual(g.state,before);
  g.state.flags.fountainRepaired=true;const repaired=structuredClone(g.state);
  g.applyContentEffect(firstMatchingRule(fountainUseRules,g.effectContext()));assert.deepEqual(g.state,repaired);
 }
 assert.equal(statueItemRules[0],fountainItemRules[0]);
});
test('repaired statue rejects more oil/full bottles, stale pending source cancels without flags, and dropped bottles block replacement',()=>{
 for(const target of [statue,basin])for(const item of [oil,water]){
  const g=game({inventory:[item],flags:{fountainRepaired:true}}),before=structuredClone(g.state);
  g.useInventoryItemOnTarget(item,target);assert.deepEqual(g.state,before);assert.equal(g.sceneAction.active,false);
 }
 const stale=game();stale.useInventoryItemOnTarget(oil,statue);stale.inventory.remove(oil);
 const before=structuredClone(stale.state);assert.equal(stale.updateSceneAction(.4),false);assert.deepEqual(stale.state,before);
 const conflict=game({droppedItems:[{itemId:empty,sceneId:square.id,position:{x:300,y:600}}]});
 conflict.useInventoryItemOnTarget(oil,statue);const original=structuredClone(conflict.state);
 assert.equal(conflict.updateSceneAction(.4),false);assert.deepEqual(conflict.state,original);
 assert.equal(square.effects[0].freezeWhenPaused,true);
 const waterLayer=square.foregroundLayers.find(l=>l.asset==='fountainShallowWater');
 const foreground=square.foregroundLayers.find(l=>l.asset==='fountainForeground');
 assert.ok(foreground.zIndex>waterLayer.zIndex && waterLayer.zIndex>square.effects[0].zIndex
  && square.effects[0].zIndex>square.effects[0].splashZIndex);
 assert.ok(square.effects[0].occlusionPolygons.length,'rifle is masked independently of the inherited background patch');
 assert.deepEqual(statue.interactionApproach,{x:735,y:600});
 assert.deepEqual(basin.interactionApproach,statue.interactionApproach);
 assert.equal(square.effects[0].splash.droplets,7);
});
test('pause/menu freeze fade and scene/ending cancellation cannot replay or consume uncommitted oil',()=>{
 for(const pause of ['paused','menuOpen']){
  const g=game();g.useInventoryItemOnTarget(oil,statue);g[pause]=true;g.updateSceneAction(3);
  assert.equal(g.sceneAction.state.elapsedMs,0);assert.deepEqual(g.state.inventory,[oil]);
  g[pause]=false;g.updateSceneAction(.4);assert.deepEqual(g.state.inventory,[empty]);
 }
 for(const cancel of ['sceneTransitionPending','devHome','editMode','ending','scene']){
  const g=game();g.useInventoryItemOnTarget(oil,statue);g.updateSceneAction(.2);
  if(cancel==='scene')g.currentScene={id:'scene.chapter1.apartment'};
  else if(cancel==='ending')g.state.chapter1Completed=true;else g[cancel]=true;
  g.updateSceneAction(1);assert.equal(g.sceneAction.active,false);assert.deepEqual(g.state.inventory,[oil]);
  g.currentScene=square;g.updateSceneAction(1);assert.deepEqual(g.state.inventory,[oil]);
 }
});
test('missing/late art and replacement failure roll back all flags and preserve oil; recovery needs fresh use',()=>{
 const g=game();let loaded=false;g.assets.isLoaded=()=>loaded;
 assert.equal(g.useInventoryItemOnTarget(oil,statue),false);assert.deepEqual(g.state.inventory,[oil]);
 loaded=true;g.useInventoryItemOnTarget(oil,statue);loaded=false;g.updateSceneAction(.2);
 assert.equal(g.sceneAction.active,false);loaded=true;g.updateSceneAction(1);assert.equal(g.state.flags.fountainRepaired,undefined);
 g.useInventoryItemOnTarget(oil,statue);const before=structuredClone(g.state);g.inventory.replace=()=>false;
 assert.equal(g.updateSceneAction(.4),false);assert.deepEqual(g.state,before);
});
test('commit survives interruption/save/load without duplicate oil/fade; legacy repaired/filled states stay valid',()=>{
 const g=game();g.useInventoryItemOnTarget(oil,statue);g.updateSceneAction(.4);g.sceneTransitionPending=true;g.updateSceneAction(1);
 let raw;const save=new SaveSystem({getItem:()=>raw,setItem:(_,v)=>raw=v});save.save(g.state);const loaded=save.load();
 assert.equal(loaded.flags.fountainRepaired,true);assert.deepEqual(loaded.inventory,[empty]);
 for(const inv of [[empty],[water]]){
  const old=game({inventory:inv,flags:{fountainRepaired:true}});save.save(old.state);assert.deepEqual(save.load().inventory,inv);
 }
 const old=game({inventory:[empty],flags:{fountainValveOiled:true}});
 old.applyContentEffect(firstMatchingRule(fountainUseRules,old.effectContext()));assert.equal(old.state.flags.fountainRepaired,true);
 assert.deepEqual(old.state.inventory,[empty]);
 assert.equal(fountainRepairSequence.durationMs,850);
});
