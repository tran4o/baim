import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chapter1 as currentChapter1} from '../src/content/chapter1/index.js';
import {restorePosterContestR39Snapshot} from './helpers/poster-contest-r39-preservation.js';
// Historical R23 table contract; R39 current behavior is covered separately.
const chapter1={...currentChapter1,scenes:restorePosterContestR39Snapshot('scenes',currentChapter1.scenes),dialogues:restorePosterContestR39Snapshot('dialogues',currentChapter1.dialogues)};
import {DEFAULT_SAVE} from '../src/engine/ids.js';
import {SaveSystem} from '../src/engine/SaveSystem.js';
import {requirementsMet,applyEffects} from '../src/engine/EffectSystem.js';
import {InventorySystem} from '../src/engine/InventorySystem.js';
import {findTargetAt} from '../src/engine/SceneGeometry.js';
import {diplomaTakeRule} from '../src/content/chapter1/photoQuest.js';
import {restoreToniTableSnapshot,stripToniTable} from './helpers/toni-table-preservation.js';
const scene=chapter1.scenes.find(s=>s.id==='scene.chapter1.mehana');
function ctx(state=structuredClone(DEFAULT_SAVE)){return {state,inventory:new InventorySystem({},state)};}
function visible(c){return scene.foregroundLayers.filter(l=>!l.requirements||requirementsMet(l.requirements,c)).filter(l=>!l.hiddenWhenFlag||!c.state.flags[l.hiddenWhenFlag]).map(l=>l.id);}
const id=s=>'layer.mehana.'+s;
test('pre-contest table and contest start have distinct bottles/glasses without duplicate old props',()=>{
 const c=ctx(),before=visible(c);assert.ok(before.includes(id('tony_rakia_half')));assert.ok(before.includes(id('tony_glass_half')));
 assert.ok(!before.includes(id('mitko_water_bottle')));assert.ok(!before.includes(id('mitko_glass_empty')));
 c.state.flags.tonyChallengeStarted=true;const started=visible(c);assert.ok(started.includes(id('mitko_water_bottle')));assert.ok(started.includes(id('mitko_glass_empty')));
 for(const suffix of ['mitko_competition_glass','tony_competition_glass'])assert.ok(!scene.foregroundLayers.some(l=>l.id===id(suffix)));
 const own=scene.interactables.find(t=>t.id==='hotspot.mehana.bai_mitko_rakia_glass');assert.equal(findTargetAt(scene,{x:875,y:440},t=>!t.requirements||requirementsMet(t.requirements,c))?.id,own.id);
});
test('own water transaction leaves Toni rakia untouched; aftermath and single pickup survive serialization',()=>{
 const c=ctx();c.state.flags.tonyChallengeStarted=true;c.state.flags.tonyDistracted=true;c.inventory.add('item.fountain_water_bottle');
 const own=scene.interactables.find(t=>t.id==='hotspot.mehana.bai_mitko_rakia_glass'),swap=own.itemUseRules.find(r=>r.effects?.some(e=>e.key==='swappedOwnRakiaWithWater'));
 assert.ok(requirementsMet(swap.requirements,c));assert.equal(applyEffects(swap.effects,c),true);assert.ok(visible(c).includes(id('tony_rakia_half')));assert.ok(visible(c).includes(id('mitko_glass_water')));
 const finish=chapter1.dialogues.find(d=>d.id==='dialogue.tony_fridge').nodes.start.choices.find(c=>c.next==='contest_result').effect;
 applyEffects(finish.effects,c);assert.equal(c.state.tonyVote,true);assert.equal(c.state.flags.tonyPassedOut,true);
 const end=visible(c);assert.ok(!end.some(l=>/tony_rakia|tony_glass|mitko_.*(bottle|glass)/.test(l)),'Kiro clears every contest bottle/glass');
 const paper=scene.foregroundLayers.find(l=>l.id===id('tony_diploma'));
 assert.deepEqual({x:paper.left,y:paper.top,w:paper.width,h:paper.height},{x:965,y:462,w:88,h:27});
 assert.ok(requirementsMet(diplomaTakeRule.requirements,c));applyEffects(diplomaTakeRule.effects,c);assert.equal(requirementsMet(diplomaTakeRule.requirements,c),false);
 const saved=new SaveSystem({getItem:()=>JSON.stringify(c.state)}).load(),re=ctx(saved);assert.deepEqual(visible(re),visible(c));assert.equal(saved.flags.tonyPassedOut,true);assert.equal(saved.flags.tonyDiplomaTaken,true);
});
test('legacy win keeps earned vote and sleeping prop continuity; printed full name replaces only holder name',()=>{
 const old=structuredClone(DEFAULT_SAVE);delete old.photoQuestVersion;old.tonyVote=true;old.flags.tonyChallengeResolved=true;old.flags.tonyChallengeStarted=true;old.swappedOwnRakiaWithWater=true;
 const saved=new SaveSystem({getItem:()=>JSON.stringify(old)}).load();assert.equal(saved.tonyVote,true);assert.ok(!visible(ctx(saved)).some(l=>/tony_rakia|tony_glass|mitko_.*(bottle|glass)/.test(l)));
 const svg=readFileSync('assets/chapter1/items/tony-diploma.svg','utf8');assert.ok(svg.includes('ТОНЧО КАРАБАНОВ'));assert.ok(!svg.includes('ТОНИ ХЛАДИЛНИКА'));
 assert.equal(chapter1.scenes.find(s=>s.id===scene.id).npcs.find(n=>n.id==='npc.tony_fridge').nameKey,'npc.tony_fridge.name');
});
test('new inverse restores exact predecessor without changing its immutable fixture and rejects unknown deltas',()=>{
 const fixture=JSON.parse(readFileSync('test/fixtures/toni-table-deltas.json'));
 for(const [p,r]of Object.entries(fixture.records)){const bytes=readFileSync(p);assert.equal(stripToniTable(p,bytes),r.before);assert.throws(()=>stripToniTable(p,Buffer.concat([bytes,Buffer.from('unbound')])),/exact scene fix/);}
 assert.deepEqual(restoreToniTableSnapshot('scenes',chapter1.scenes),fixture.snapshots.scenes.before);
});
