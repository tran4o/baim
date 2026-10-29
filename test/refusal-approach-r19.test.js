import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from '../src/engine/Game.js';
import {chapter1} from '../src/content/chapter1/index.js';
import {planRefusalApproach,refusalTargetPoint} from '../src/engine/RefusalApproach.js';
import {cursorTargetSupportsAction as supports} from '../src/engine/ActionCursor.js';
import {findWalkPath,isWalkable,walkPathDistance} from '../src/engine/SceneGeometry.js';
import {stripRefusalApproachR19} from './helpers/refusal-approach-r19-preservation.js';
import {fountainUseRules} from '../src/content/chapter1/fountain.js';
import {applyEffects} from '../src/engine/EffectSystem.js';
import {wardrobePhotoPuzzle,wardrobeCloseup} from '../src/content/chapter1/wardrobe.js';

const apartment=chapter1.scenes.find(s=>s.id==='scene.chapter1.apartment');
const chest=wardrobePhotoPuzzle;
test('far chest refusal shortens the existing safe floor route; near/opposite side never retreats',()=>{
 const from={x:270,y:490},anchor={x:990,y:525},hit={x:1170,y:455};
 const p=planRefusalApproach(apartment,from,anchor,hit,400);
 assert.equal(p.reason,'shortened-normal-route');assert.ok(p.point.x>from.x);assert.ok(p.point.x<anchor.x);
 assert.ok(Math.abs(walkPathDistance(from,p.path)+p.gap-walkPathDistance(from,findWalkPath(apartment,from,anchor)))<0.001);
 let previous=from;for(const point of p.path){for(let i=0;i<=100;i++)assert.ok(isWalkable(apartment,{x:previous.x+(point.x-previous.x)*i/100,y:previous.y+(point.y-previous.y)*i/100}));previous=point;}
 for(const start of [{x:1055,y:525},{x:990,y:525}]){const near=planRefusalApproach(apartment,start,anchor,hit,400);assert.deepEqual(near.point,start);assert.equal(near.path.length,0);}
 const right=planRefusalApproach(apartment,{x:1090,y:540},anchor,hit,100);
 assert.equal(right.path.length,0,'never walk left away from actual chest to reach a legacy authored anchor');
});
test('high window click measures floor proximity; gap follows character scale',()=>{
 const hit={x:244,y:195},anchor={x:384.7220636737793,y:479.939745646501};
 const near=planRefusalApproach(apartment,{x:270,y:490},anchor,hit,400);assert.equal(near.path.length,0);
 const far=planRefusalApproach(apartment,{x:1000,y:515},anchor,hit,400);assert.equal(far.reason,'shortened-normal-route');assert.ok(far.point.x>anchor.x);
 const smaller=planRefusalApproach(apartment,{x:1000,y:515},anchor,hit,200);assert.equal(far.gap,smaller.gap*2);
});
test('geometry fallback uses active polygon ahead of stale rectangle',()=>{
 const t={rect:{x:0,y:0,w:10,h:10},polygon:[{x:100,y:100},{x:200,y:100},{x:200,y:200},{x:100,y:200}]};
 assert.deepEqual(refusalTargetPoint(t),{x:150,y:150});assert.deepEqual(refusalTargetPoint(t,{x:175,y:125}),{x:175,y:125});
 assert.ok(refusalTargetPoint(apartment.interactables.find(t=>t.objectCloseup)).x>800);
});
function fixture(){const g=Object.create(Game.prototype),owned=new Set();
 Object.assign(g,{state:{flags:{},chapter1Completed:false},inventory:{has:id=>owned.has(id)},content:{items:{}},selectedVerb:'talk',inventoryUseItemId:null,
 player:{position:{x:500,y:500},animation:'idle',facing:'east'},t:(key)=>key,
 effectContext(){return {state:this.state,inventory:this.inventory};},targetAvailable:()=>true,
 setStatusMessage(message){this.message=message;},setNpcSpeechMessage(target,message){this.message=message;},renderUi(){},
 applyContentEffect(rule){applyEffects(rule.effects,this.effectContext());this.message=rule.messageKey;return true;}});
 return {g,owned};}
test('same cursor query covers both existing puzzle verbs and legacy photo recovery without effects',()=>{
 const {g}=fixture();for(const verb of ['use','take'])assert.equal(supports(g,chest,verb),true);
 g.state.flags.photoCupboardSolved=true;for(const verb of ['use','take'])assert.equal(supports(g,chest,verb),true);
 g.state.flags.childPhotoRecovered=true;for(const verb of ['use','take'])assert.equal(supports(g,chest,verb),false);
 assert.equal(g.state.photoPuzzle,undefined);
});
test('refusal arrival rechecks availability, retains authored rejection, and cannot execute newly available success',()=>{
 const {g}=fixture(),target={id:'guard',kind:'npc',talkRules:[{requirements:{flags:['ready']},effects:[{type:'setFlag',key:'bad'}],messageKey:'success'},
 {reject:true,messageKey:'not_ready'}]};
 g.refuseTargetAction(target);assert.equal(g.message,'not_ready');assert.equal(g.player.interactionDebug.availabilityAtDispatch,false);assert.equal(g.state.flags.bad,undefined);
 g.state.flags.ready=true;g.refuseTargetAction(target);assert.equal(g.message,'msg.need_talk');assert.equal(g.player.interactionDebug.availabilityAtDispatch,true);assert.equal(g.state.flags.bad,undefined);
});
test('invalid item response uses the existing rejecting rule without consuming an unrelated item',()=>{
 const {g,owned}=fixture();owned.add('oil');g.inventoryUseItemId='oil';g.content.items.oil={nameKey:'oil'};
 g.refuseTargetAction({id:'wall',itemUseRules:[{itemId:'oil',reject:true,messageKey:'wrong'}]});
 assert.equal(g.message,'wrong');assert.ok(owned.has('oil'));assert.equal(g.inventoryUseItemId,null);
});
test('real fountain rejections preserve diagnosis, attempted valve and subsequent oil clue',()=>{
 const {g}=fixture();g.selectedVerb='use';const t={id:'fountain',useRules:fountainUseRules};
 assert.equal(supports(g,t),false);g.refuseTargetAction(t);assert.equal(g.message,'fountain.use.jammed');assert.equal(g.state.flags.fountainDiagnosed,true);assert.equal(g.state.flags.fountainValveTried,true);
 g.refuseTargetAction(t);assert.equal(g.message,'fountain.use.hint');assert.equal(g.state.flags.fountainOilClue,true);
 g.state.flags.fountainValveOiled=true;g.refuseTargetAction(t);assert.equal(g.message,'msg.no_use');assert.equal(g.state.flags.fountainRepaired,undefined,'newly available success cannot run from refusal-only trip');
});
test('solved cupboard legacy recovery is valid and dispatches its original earned-photo effect',()=>{
 const {g,owned}=fixture();g.state.flags.photoCupboardSolved=true;g.selectedVerb='take';
 g.inventory.add=id=>owned.add(id);g.content.items['item.mitko_child_photo']={};
 g.currentScene=apartment;g.objectCloseup={definition:wardrobeCloseup,sceneId:apartment.id};
 assert.equal(supports(g,chest),true);g.useTarget(chest);assert.ok(owned.has('item.mitko_child_photo'));assert.equal(g.state.flags.childPhotoRecovered,true);assert.equal(g.message,'photoquest.photo_found');
});
test('incremental inverse restores exact r18 and rejects unknown changes',()=>{
 for(const f of ['src/engine/Game.js','src/engine/ActionCursor.js']){
  const source=readFileSync(f,'utf8'),before=readFileSync('../extraFixes/apartment-two-photo-20261024/refusal-approach-r19/source-before/'+f,'utf8').replaceAll('\r\n','\n');
  assert.equal(stripRefusalApproachR19(f,source,true),before);assert.throws(()=>stripRefusalApproachR19(f,source+'\n// unknown',true));
 }
});
