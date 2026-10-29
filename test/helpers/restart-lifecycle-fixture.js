// PR60 lifecycle fixture adapted from historical 5931bc0 audit helpers; see harness provenance.
// UI, media and browser storage are stubbed. These are logic reproductions, not gameplay tests.
import assert from 'node:assert/strict';
import {chapter1} from '../../src/content/chapter1/index.js';
import {Game} from '../../src/engine/Game.js';
import {DEFAULT_SAVE, VERBS} from '../../src/engine/ids.js';
import {InventorySystem} from '../../src/engine/InventorySystem.js';
import {QuestSystem} from '../../src/engine/QuestSystem.js';
import {DialogueSystem} from '../../src/engine/DialogueSystem.js';
import {SaveSystem} from '../../src/engine/SaveSystem.js';
import {SceneActionSequence} from '../../src/engine/SceneActionSequence.js';
import {requirementsMet, firstMatchingRule} from '../../src/engine/EffectSystem.js';
import {findTargetAt, isWalkable, findWalkPath, pointInPolygon} from '../../src/engine/SceneGeometry.js';
import {oilRefillRule} from '../../src/content/chapter1/fountain.js';
import {kiroOilSequence} from '../../src/content/art/kiroOilHandover.generated.js';
const index = a => Object.fromEntries(a.map(x => [x.id, x]));
const content = {...Object.fromEntries(['scenes','items','quests','dialogues'].map(k => [k,index(chapter1[k])])), endings:chapter1.endings};
const sid = s => 'scene.chapter1.'+s;
function game(overrides={}) {
  const g = Object.assign(Object.create(Game.prototype), {content,state:{...structuredClone(DEFAULT_SAVE),...overrides},
    player:{position:{x:1000,y:565},animation:'idle'},sceneAction:new SceneActionSequence(),
    walkSpeedMultiplier:1,sceneTransitionPending:false,selectedVerb:VERBS.LOOK,dialogueChoicePointerLock:null,menuOpen:false,paused:false,
    t:k=>k,renderUi(){},setStatusMessage(k){this.message=k;},setNpcSpeechMessage(_t,k){this.message=k;},
    hideSpeechBubble(){},protectCurrentAssetWorkingSet(){},scheduleAdjacentScenePrefetch(){},
    audio:{play(){},setAmbience(){},resetFootsteps(){},setVolume(){},setEnabled(){}},
    assets:{preloadSceneAssets:async()=>{},getItemImage(){},getSceneImage(){},isLoaded:()=>false},
    localization:{setLanguage(){}}});
  let raw;
  g.saveSystem=new SaveSystem({getItem:()=>raw,setItem:(_k,v)=>raw=v,removeItem(){raw=undefined;}});
  bindState(g); g.currentScene=g.sceneWithDroppedItems(content.scenes[g.state.currentSceneId]);
  g.dialogue=new DialogueSystem(content.dialogues,null,e=>g.applyDialogueEffect(e));
  return g;
}
function bindState(g){g.inventory=new InventorySystem(content.items,g.state);g.quests=new QuestSystem(content.quests,g.state);}
function reload(g){g.save();g.state=g.saveSystem.load();bindState(g);g.currentScene=g.sceneWithDroppedItems(content.scenes[g.state.currentSceneId]);g.dialogue.close();return g;}
function target(g,id){const t=[...g.currentScene.interactables,...g.currentScene.npcs,...g.currentScene.exits].find(t=>t.id===id);assert.ok(t,id);assert.ok(g.targetAvailable(t),'available '+id);return t;}
function choose(g,key){const n=g.dialogue.getNode();const source=n.choicesFrom?content.dialogues[g.dialogue.current.id].nodes[n.choicesFrom]:n;const c=source.choices.find(c=>c.textKey===key&&g.dialogueChoiceAvailable(c));assert.ok(c,'choice '+key);assert.equal(g.chooseDialogueChoice(c,{detail:0}),true);}
function talk(g,id){const t=target(g,id);g.selectedVerb=VERBS.TALK;g.performTargetAction(t);assert.ok(g.dialogue.current);}
async function leave(g,suffix){g.dialogue.close();const exit=target(g,suffix);assert.ok(requirementsMet(exit.accessRequirements,g.effectContext()));await g.changeScene(exit.targetSceneId,exit.targetPosition);}
async function go(g,name){await g.changeScene(sid(name));}
function use(g,id,item){const t=target(g,id);if(item) assert.notEqual(g.useInventoryItemOnTarget(item,t),false);else g.useTarget(t);}
async function papers(g,route='kiosk'){
  // Historical earned-credential fixture for restart/old-ending preservation.
  // New-game acquisition is independently exercised by photo-quest and native BG/EN tests.
  // Actual current wardrobe pickup; removed chair/table targets are not new-game inputs.
  assert.equal(g.openObjectCloseup(target(g,'hotspot.apartment.wardrobe')),true);
  assert.equal(g.takeObjectCloseupItem('item.accordion'),true);g.closeObjectCloseup();
  // Explicit legacy-save input for the historical recipe rejection below.
  g.inventory.add('item.unpaid_bills');
  await leave(g,'exit.apartment.to_square');
  if(route==='combine'){
    g.takeTarget(target(g,'hotspot.square.empty_envelope'));
    assert.equal(g.useInventoryItemOnItem('item.unpaid_bills','item.empty_envelope'),true);
    assert.equal(g.inventory.has('item.fake_diploma'),false,'obsolete recipe grants nothing');
  }else {g.useInventoryItemOnTarget('item.unpaid_bills',target(g,'hotspot.square.kiosk'));assert.equal(g.inventory.has('item.fake_diploma'),false,'kiosk bills grant nothing');}
  g.state.hasFakeDiploma=true;g.state.flags.legacyPhotoCredentials=true;g.inventory.add('item.fake_diploma');
  talk(g,'hotspot.square.kiosk');choose(g,'campaign.kiosk.choice.pamphlets');
  use(g,'hotspot.square.poster_board','item.campaign_pamphlets');
}
async function support(g,{baba,tony,watched=false}){
  if(!baba&&!tony)return;
  await leave(g,'exit.square.to_mehana');
  talk(g,'npc.mehana_waiter');choose(g,'fountain.kiro.choice.refill');
  assert.equal(g.sceneAction.state.phase,'received');g.closeReceivedItem();
  await leave(g,'exit.mehana.to_square');
  // PR60 accepts oil on the statue only and commits the repair at blackout.
  g.assets.isLoaded=()=>true;
  use(g,'hotspot.square.statue','item.sunflower_oil');g.updateSceneAction(.4);g.updateSceneAction(1);reload(g);
  use(g,'hotspot.square.fountain');reload(g);
  if(baba){talk(g,'npc.baba_stoyanka');choose(g,'fountain.baba.choice.report');}
  if(tony){
    use(g,'hotspot.square.fountain','item.empty_rakia_bottle');reload(g);
    await leave(g,'exit.square.to_mehana');talk(g,'npc.tony_fridge');
    choose(g,'dialogue.tony.choice.challenge');choose(g,'dialogue.tony.choice.accept');choose(g,'dialogue.tony.choice.prepare');
    if(watched)use(g,'hotspot.mehana.bai_mitko_rakia_glass','item.fountain_water_bottle');
    use(g,'npc.tony_fridge','item.accordion');
    use(g,'hotspot.mehana.bai_mitko_rakia_glass','item.fountain_water_bottle');reload(g);
    talk(g,'npc.tony_fridge');choose(g,'dialogue.tony.choice.finish_challenge');
    assert.equal(g.dialogue.current,null,'contest dialogue closes for blackout');
    g.updateSceneAction(.45);assert.equal(g.state.flags.tonyPassedOut,true);assert.equal(g.state.tonyVote,true);
    g.updateSceneAction(1.15);assert.equal(g.sceneAction.active,false);
    await leave(g,'exit.mehana.to_square');
  }
}
async function register(g,{stopAtMayor=false}={}){
  if(!g.inventory.has('item.suspicious_receipt')){
    talk(g,'npc.journalist');choose(g,'registration.ask_evidence');choose(g,'registration.leave');
    await leave(g,'exit.square.to_mehana');talk(g,'npc.mehana_waiter');choose(g,'registration.kiro_receipt');await leave(g,'exit.mehana.to_square');
  }
  use(g,'npc.journalist','item.suspicious_receipt');reload(g);
  await leave(g,'exit.square.to_municipality');use(g,'npc.municipality_clerk','item.fake_diploma');
  await leave(g,'exit.municipality.to_mayor_office');if(stopAtMayor)return;talk(g,'npc.mayor');
  for(const key of ['confront','listen','stay_candidate','watch_stamp','leave'])choose(g,'registration.'+key);
  reload(g);await leave(g,'exit.mayor_office.to_municipality');use(g,'npc.municipality_clerk','item.fake_diploma');reload(g);
}
async function box(g){
  await g.useTarget(target(g,'hotspot.municipality.archive_cabinet'));
  g.lookTarget(target(g,'hotspot.archive.handle'));use(g,'hotspot.archive.handle','item.accordion');
  g.takeTarget(target(g,'hotspot.archive.jar'));g.lookTarget(target(g,'hotspot.archive.ledger'));
  use(g,'hotspot.archive.ballot_box','item.pickle_jar');reload(g);
  g.takeTarget(target(g,'hotspot.archive.ballot_box'));reload(g);
  await leave(g,'exit.archive.to_municipality');await leave(g,'exit.municipality.to_square');
}
async function interview(g,answers=['heritage','counted','responsibility']){
  talk(g,'npc.journalist');choose(g,'dialogue.journalist.choice.begin');
  for(const [i,node] of ['roads','complaints','ballot_box'].entries())choose(g,`dialogue.journalist.${node}.choice.${answers[i]}`);
  choose(g,'dialogue.journalist.choice.leave');reload(g);
}
export {game,papers,register,box,interview,support,leave,use,reload,target,talk,choose,sid,content,Game,DialogueSystem,SaveSystem,DEFAULT_SAVE};
