import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Game} from '../src/engine/Game.js';import {DEFAULT_SAVE} from '../src/engine/ids.js';
import {InventorySystem} from '../src/engine/InventorySystem.js';import {SaveSystem} from '../src/engine/SaveSystem.js';
import {chapter1} from '../src/content/chapter1/index.js';import {wardrobeAccordion,wardrobeCloseup} from '../src/content/chapter1/wardrobe.js';
import {pepaItemRules,pepaMusicRule,pepaPosterRule,pepaDiplomaRule} from '../src/content/chapter1/photoQuest.js';
import {firstMatchingRule,requirementsMet,applyEffects} from '../src/engine/EffectSystem.js';
import {cursorTargetSupportsAction,cursorInteractionBlocked} from '../src/engine/ActionCursor.js';
import {isWalkable,findWalkPath} from '../src/engine/SceneGeometry.js';import {stripWardrobeQuestR20} from './helpers/wardrobe-quest-r20-preservation.js';
const apartment=chapter1.scenes.find(s=>s.id==='scene.chapter1.apartment'),wardrobe=apartment.interactables.find(t=>t.id==='hotspot.apartment.wardrobe');
function fixture(saved){const g=Object.create(Game.prototype);g.state=saved||structuredClone(DEFAULT_SAVE);g.inventory=new InventorySystem(Object.fromEntries(chapter1.items.map(i=>[i.id,i])),g.state);
 Object.assign(g,{currentScene:apartment,content:{items:Object.fromEntries(chapter1.items.map(i=>[i.id,i]))},player:{position:{...wardrobe.interactionApproach},animation:'idle'},selectedVerb:'use',
  hideSpeechBubble(){this.speechBubble=null;},renderUi(){},t:key=>key,setStatusMessage(key){this.message=key;},effectContext(){return {state:this.state,inventory:this.inventory};},save(){this.saved=JSON.stringify(this.state);}});return g;}
test('wardrobe has reachable Use close-up while old room accordion stays absent',()=>{
 const g=fixture();assert.equal(cursorTargetSupportsAction(g,wardrobe),true);assert.equal(cursorTargetSupportsAction(g,wardrobe,'take'),false);
 assert.ok(isWalkable(apartment,wardrobe.interactionApproach));assert.ok(findWalkPath(apartment,apartment.playerStart,wardrobe.interactionApproach).length);
 assert.equal(apartment.interactables.some(t=>t.id===wardrobeAccordion.id),false);assert.equal(wardrobeCloseup.backgroundAsset,'wardrobeInteriorC04A');assert.equal(wardrobeCloseup.propMode,'wardrobe-puzzle-and-accordion-r08-context');
});
test('modal collects once through normal Take and survives close/reopen/save/load without duplicates',()=>{
 let g=fixture();assert.equal(g.takeObjectCloseupItem('item.accordion'),false);assert.equal(g.openObjectCloseup(wardrobe),true);assert.equal(cursorInteractionBlocked(g),true);
 assert.equal(g.takeObjectCloseupItem('item.accordion'),true);assert.equal(g.state.hasAccordion,true);assert.equal(g.takeObjectCloseupItem('item.accordion'),false);assert.equal(g.state.inventory.filter(i=>i==='item.accordion').length,1);
 g.closeObjectCloseup();assert.equal(g.objectCloseup,null);g.openObjectCloseup(wardrobe);assert.equal(g.objectCloseupItemAvailable(wardrobeAccordion),false);
 const save=new SaveSystem({getItem:()=>g.saved});g=fixture(save.load());g.openObjectCloseup(wardrobe);assert.equal(g.takeObjectCloseupItem('item.accordion'),false);assert.equal(g.state.inventory.filter(i=>i==='item.accordion').length,1);
});
test('dropped accordion stays at its saved location and cannot respawn in wardrobe',()=>{
 for(const sceneId of ['scene.chapter1.apartment','scene.chapter1.village_square']){const g=fixture();g.state.flags.hasAccordion=true;g.state.droppedItems=[{itemId:'item.accordion',sceneId,position:{x:700,y:520}}];g.openObjectCloseup(wardrobe);assert.equal(g.takeObjectCloseupItem('item.accordion'),false);assert.equal(g.state.droppedItems.length,1);assert.equal(g.inventory.has('item.accordion'),false);}
});
test('stale cross-scene pickup and world commands behind modal have no effect',()=>{
 const g=fixture();g.openObjectCloseup(wardrobe);g.currentScene={id:'another'};assert.equal(g.takeObjectCloseupItem('item.accordion'),false);g.sceneTargetAt=()=>{throw Error('world hit test must not run behind modal');};g.handleWorldClick({x:500,y:500});assert.equal(g.inventory.has('item.accordion'),false);
});
test('Toni water route works without music/accordion, preserves bottle replacement and ignores old distraction flags',()=>{
 const tavern=chapter1.scenes.find(s=>s.id==='scene.chapter1.mehana'),glass=tavern.interactables.find(t=>t.id==='hotspot.mehana.bai_mitko_rakia_glass');
 for(const flags of [{},{tonyDistracted:true},{tonyCaughtWaterAttempt:true}]){const g=fixture();g.state.flags={...flags,tonyChallengeStarted:true};g.inventory.add('item.fountain_water_bottle');const rule=firstMatchingRule(glass.itemUseRules.filter(r=>r.itemId==='item.fountain_water_bottle'),g.effectContext());assert.ok(rule&&!rule.reject);assert.ok(applyEffects(rule.effects,g.effectContext()));assert.ok(g.inventory.has('item.empty_rakia_bottle'));assert.equal(g.inventory.has('item.fountain_water_bottle'),false);assert.equal(g.state.swappedOwnRakiaWithWater,true);assert.equal(g.state.flags.pepaMusicPlayed,undefined);assert.equal(g.inventory.has('item.accordion'),false);}
});
test('Pepa refuses either product before music, then still requires correct photos and original diploma',()=>{
 const g=fixture(),ctx=g.effectContext();for(const itemId of ['item.mitko_photo','item.mitko_child_photo','item.tony_diploma']){g.inventory.add(itemId);const r=firstMatchingRule(pepaItemRules.filter(r=>r.itemId===itemId),ctx);assert.equal(r.reject,true);assert.equal(r.messageKey,'photoquest.music_first');}
 assert.equal(requirementsMet(pepaMusicRule.requirements,ctx),false);g.inventory.add('item.accordion');assert.equal(requirementsMet(pepaMusicRule.requirements,ctx),true);applyEffects(pepaMusicRule.effects,ctx);assert.equal(g.state.flags.pepaMusicPlayed,true);
 assert.ok(requirementsMet(pepaPosterRule.requirements,ctx));assert.ok(requirementsMet(pepaDiplomaRule.requirements,ctx));g.inventory.remove('item.mitko_photo');assert.equal(requirementsMet(pepaPosterRule.requirements,ctx),false);assert.ok(requirementsMet(pepaDiplomaRule.requirements,ctx));g.inventory.remove('item.mitko_child_photo');g.inventory.add('item.mitko_photo');assert.equal(requirementsMet(pepaDiplomaRule.requirements,ctx),false);assert.ok(requirementsMet(pepaPosterRule.requirements,ctx));
});
test('r20 source inverses preserve accepted r19 and reject unbound changes',()=>{
 const f=JSON.parse(readFileSync('test/fixtures/wardrobe-quest-r20-deltas.json'));for(const[path,r]of Object.entries(f.records)){const s=readFileSync(path,'utf8');assert.equal(stripWardrobeQuestR20(path,s,true),r.before);assert.throws(()=>stripWardrobeQuestR20(path,s+'\n// tamper',true));}
});
