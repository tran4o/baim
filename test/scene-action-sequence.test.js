import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneActionSequence } from '../src/engine/SceneActionSequence.js';
import { Game } from '../src/engine/Game.js';
import { kiroOilSequence, kiroOilAssets } from '../src/content/art/kiroOilHandover.generated.js';
import { oilRefillRule } from '../src/content/chapter1/fountain.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const definition={sceneId:'room',layerId:'actor',durationMs:100,frames:[{asset:'a',durationMs:40},{asset:'b',durationMs:60}]};
test('scene performance preserves variable timing, pause, completion and covered reset',()=>{
 const c=new SceneActionSequence();assert.equal(c.start('other',definition),false);assert.ok(c.start('room',definition));
 assert.equal(c.start('room',definition),false);c.update('room',39);assert.equal(c.presentation('room','actor').asset,'a');
 c.update('room',60,{paused:true});assert.equal(c.state.elapsedMs,39);
 c.update('room',1);assert.equal(c.presentation('room','actor').asset,'b');
 c.update('room',60);assert.equal(c.state.phase,'received');assert.equal(c.presentation('room','actor'),null);
 c.update('room',1000);assert.equal(c.state.elapsedMs,100);c.reset();assert.equal(c.active,false);
});
test('scene change, cancellation and missing/late source cannot replay transient motion',()=>{
 const c=new SceneActionSequence();c.start('room',definition);c.update('other',10);assert.equal(c.active,false);
 c.start('room',definition);c.update('room',10,{canceled:true});assert.equal(c.active,false);
 c.start('room',definition,()=>false);assert.equal(c.state.phase,'received');c.update('room',10,{available:()=>true});assert.equal(c.state.phase,'received');
 c.reset();c.start('room',definition);c.update('room',10,{available:()=>false});assert.equal(c.state.phase,'received');
});
function game(available=true){
 const g=Object.create(Game.prototype),owned=new Set();Object.assign(g,{sceneAction:new SceneActionSequence(),currentScene:{id:kiroOilSequence.sceneId},state:{flags:{},chapter1Completed:false},player:{},inventory:{has:id=>owned.has(id),add:id=>owned.add(id)},assets:{getItemImage(){},getSceneImage(){return available},isLoaded:image=>image},hideSpeechBubble(){},renderUi(){},protectCurrentAssetWorkingSet(){},save(){}});return g;
}
test('oil is granted after motion once, with duplicate clicks blocked and close resetting actor',()=>{
 const g=game();assert.ok(g.startSceneAction({...oilRefillRule,sceneSequence:kiroOilSequence.id}));assert.equal(g.inventory.has('item.sunflower_oil'),false);
 assert.equal(g.startSceneAction({...oilRefillRule,sceneSequence:kiroOilSequence.id}),false);
 g.updateSceneAction(7);assert.equal(g.inventory.has('item.sunflower_oil'),false);g.updateSceneAction(.371);
 assert.equal(g.inventory.has('item.sunflower_oil'),true);assert.equal(g.state.hasSunflowerOil,true);
 assert.equal(g.state.flags.fountainOilClue,true);assert.equal(g.sceneActionEffect,null);
 assert.equal(g.sceneAction.presentation(kiroOilSequence.sceneId,kiroOilSequence.layerId),null);g.closeReceivedItem();assert.equal(g.sceneAction.active,false);
 assert.equal(g.startSceneAction({...oilRefillRule,sceneSequence:kiroOilSequence.id}),false);
});
test('missing source uses one immediate received screen; cancellation never grants oil',()=>{
 const fallback=game(false);fallback.startSceneAction({...oilRefillRule,sceneSequence:kiroOilSequence.id});assert.equal(fallback.inventory.has('item.sunflower_oil'),true);assert.equal(fallback.sceneAction.state.phase,'received');
 const canceled=game();canceled.startSceneAction({...oilRefillRule,sceneSequence:kiroOilSequence.id});canceled.sceneTransitionPending=true;canceled.updateSceneAction(8);assert.equal(canceled.inventory.has('item.sunflower_oil'),false);assert.equal(canceled.sceneAction.active,false);assert.equal(canceled.sceneActionEffect,null);
});
test('all approved sequence poses retain source hashes, timing and discoverable preload aliases',()=>{
 const recipe=JSON.parse(readFileSync('assets_src/characters/mehana_waiter/oil-handover-web-c01/recipe.json'));
 assert.equal(kiroOilSequence.frames.length,154);assert.equal(kiroOilSequence.frames.reduce((n,f)=>n+f.durationMs,0),7371);
 for(const source of recipe.sourceFiles)assert.equal(createHash('sha256').update(readFileSync('assets_src/characters/mehana_waiter/oil-handover-web-c01/'+source.file)).digest('hex'),source.sha256);
 for(const f of kiroOilSequence.frames)assert.ok(kiroOilAssets[f.asset]);
});
