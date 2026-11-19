import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/Game.js';
import { effectiveTargetVerb, cursorTargetSupportsAction } from '../src/engine/ActionCursor.js';
import { chapter1 } from '../src/content/chapter1/index.js';
import { SaveSystem } from '../src/engine/SaveSystem.js';
import { DEFAULT_SAVE } from '../src/engine/ids.js';

function fixture(){
 const owned=new Set(['item.empty_rakia_bottle']);
 const g=Object.assign(Object.create(Game.prototype),{state:{flags:{}},inventory:{has:id=>owned.has(id)},content:{items:Object.fromEntries(chapter1.items.map(i=>[i.id,i]))},player:{facing:'west',lastHorizontalFacing:'west',idleVariant:{slot:'settled'},idleHoldFrame:{slot:'held'},idleVariantQueue:['next'],directionalStopFrame:{slot:'stop'}},targetAvailable:()=>true,t:k=>k,renderUi(){},setStatusMessage(m){this.message=m;},setNpcSpeechMessage(t,m){this.message=m;}});
 return {g,owned};
}
test('only real dialogue targets offer Speak automatically; window/fountain refusals stay static',()=>{
 const {g}=fixture();g.selectedVerb='use';
 const kiosk=chapter1.scenes.flatMap(s=>s.interactables).find(t=>t.id==='hotspot.square.kiosk');
 assert.equal(effectiveTargetVerb(g,kiosk),'talk');
 for(const target of [{talkKey:'refusal',nameKey:'window'},{plainUseAvailable:false,actions:{use:{animation:'fake'}},talkKey:'refusal'}]){
  assert.equal(effectiveTargetVerb(g,target),'use');assert.equal(cursorTargetSupportsAction(g,target,'talk'),false);
 }
 assert.equal(cursorTargetSupportsAction(g,{plainUseAvailable:false,actions:{use:{animation:'fake'}}},'use'),false);
 g.inventoryUseItemId='item.empty_rakia_bottle';assert.equal(effectiveTargetVerb(g,kiosk),'use');
});
test('same-facing target memory preserves settled pose and queue; turning clears it',()=>{
 const {g}=fixture(),before={...g.player};g.faceInteractionSide('west');
 assert.equal(g.player.idleVariant,before.idleVariant);assert.equal(g.player.idleHoldFrame,before.idleHoldFrame);
 assert.equal(g.player.directionalStopFrame,before.directionalStopFrame);assert.equal(g.player.idleVariantQueue,before.idleVariantQueue);
 g.faceInteractionSide('east');assert.equal(g.player.idleVariant,null);assert.equal(g.player.idleHoldFrame,null);
});
test('invalid target/item/self uses keep the cursor armed and never apply rejection effects',()=>{
 const {g}=fixture();g.inventoryUseItemId='item.empty_rakia_bottle';
 g.applyContentEffect=()=>{throw Error('invalid use applied effects');};
 assert.equal(g.useInventoryItemOnTarget(g.inventoryUseItemId,{id:'wall',nameKey:'wall',itemUseRules:[{itemId:g.inventoryUseItemId,reject:true,effects:[{type:'setFlag',key:'bad'}],messageKey:'funny'}]}),false);
 assert.equal(g.useInventoryItemOnItem(g.inventoryUseItemId,g.inventoryUseItemId),false);
 assert.equal(g.useInventoryItemOnSelf(g.inventoryUseItemId),false);
 assert.equal(g.inventoryUseItemId,'item.empty_rakia_bottle');assert.deepEqual(g.state.flags,{});
});
test('a valid operation that fails its final guard keeps its owned item armed',()=>{
 const {g}=fixture();g.inventoryUseItemId='item.empty_rakia_bottle';g.applyContentEffect=()=>false;
 assert.equal(g.useInventoryItemOnTarget(g.inventoryUseItemId,{id:'fountain',itemUseRules:[{itemId:g.inventoryUseItemId,effects:[{type:'setFlag',key:'filled'}]}]}),false);
 assert.equal(g.inventoryUseItemId,'item.empty_rakia_bottle');
});

test('legacy oiled fountain becomes repaired without support rewards and needs no plain Use',()=>{
 const state={...structuredClone(DEFAULT_SAVE),inventory:['item.empty_rakia_bottle'],flags:{reusableBottleMigrated:true,fountainValveOiled:true,fountainRepaired:false}};
 const loaded=new SaveSystem({getItem:()=>JSON.stringify(state)}).load();
 assert.equal(loaded.flags.fountainRepaired,true);assert.equal(loaded.babaStoyankaVote,state.babaStoyankaVote);
 assert.equal(loaded.tonyVote,state.tonyVote);assert.equal(loaded.influence,state.influence);
 assert.deepEqual(loaded.inventory,state.inventory);
 const {g}=fixture();g.state=loaded;
 const fountain=chapter1.scenes.flatMap(s=>s.interactables).find(t=>t.id==='hotspot.square.fountain');
 assert.equal(cursorTargetSupportsAction(g,fountain,'use'),false);
 g.inventoryUseItemId='item.empty_rakia_bottle';assert.equal(cursorTargetSupportsAction(g,fountain,'use'),true);
 const again=new SaveSystem({getItem:()=>JSON.stringify(loaded)}).load();assert.deepEqual(again,loaded);
});
