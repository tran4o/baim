import test from 'node:test';
import assert from 'node:assert/strict';
import {chapter1} from '../src/content/chapter1/index.js';
import {DEFAULT_SAVE} from '../src/engine/ids.js';
import {InventorySystem} from '../src/engine/InventorySystem.js';
import {QuestSystem} from '../src/engine/QuestSystem.js';
import {SaveSystem} from '../src/engine/SaveSystem.js';
import {applyEffects,firstMatchingRule,requirementsMet} from '../src/engine/EffectSystem.js';
import {fountainItemRules,statueItemRules,fountainUseRules,oilRefillRule,babaSupportRule} from '../src/content/chapter1/fountain.js';
import {bottleItemIds} from '../src/content/chapter1/bottleSave.js';
const empty='item.empty_rakia_bottle',water='item.fountain_water_bottle',oil='item.sunflower_oil';
const index=arr=>Object.fromEntries(arr.map(x=>[x.id,x]));
function ctx(overrides={}){const state={...structuredClone(DEFAULT_SAVE),...overrides};return {state,inventory:new InventorySystem(index(chapter1.items),state),quests:new QuestSystem(index(chapter1.quests),state)};}
function reload(c){let raw;const save=new SaveSystem({getItem:()=>raw,setItem:(_,v)=>raw=v});save.save(c.state);return ctx(save.load());}
function apply(rule,c){if(!rule||!requirementsMet(rule.requirements,c))return false;applyEffects(rule.effects,c);return true;}
const fountain=(id,c)=>firstMatchingRule((id===oil?statueItemRules:fountainItemRules).filter(r=>r.itemId===id),c);
const mehana=chapter1.scenes.find(s=>s.id==='scene.chapter1.mehana');
const glass=mehana.interactables.find(x=>x.id==='hotspot.mehana.bai_mitko_rakia_glass');
const finish=chapter1.dialogues.find(d=>d.id==='dialogue.tony_fridge').nodes.start.choices.find(c=>c.textKey==='dialogue.tony.choice.finish_challenge');
const swap=(id,c)=>firstMatchingRule(glass.itemUseRules.filter(r=>r.itemId===id),c);
const bottleCount=c=>[...c.state.inventory,...c.state.droppedItems.map(r=>r.itemId)].filter(id=>bottleItemIds.includes(id)).length;

test('complete bottle chain survives every save; repeat fills/swaps cannot duplicate or farm rewards',()=>{
 let c=reload(ctx());assert.equal(bottleCount(c),0);apply(oilRefillRule,c);c=reload(c);assert.equal(bottleCount(c),1);
 apply(fountain(oil,c),c);c=reload(c);assert.deepEqual(c.state.inventory,[empty]);
 assert.equal(c.state.flags.fountainRepaired,true); // Repair now completes directly on the statue.
 apply(firstMatchingRule(fountainUseRules,c),c);c=reload(c);apply(fountain(empty,c),c);c=reload(c);assert.deepEqual(c.state.inventory,[water]);assert.equal(fountain(empty,c),null);
 c.state.flags.tonyChallengeStarted=true;const suspicion=c.state.suspicion;assert.equal(c.inventory.has('item.accordion'),false);apply(swap(water,c),c);assert.equal(c.state.suspicion,suspicion);assert.equal(c.state.flags.tonyDistracted,undefined);assert.equal(c.state.flags.pepaMusicPlayed,undefined);
 c=reload(c);assert.deepEqual(c.state.inventory,[empty]);assert.equal(c.state.swappedOwnRakiaWithWater,true);assert.equal(swap(water,c),null);
 apply(finish.effect,c);apply(babaSupportRule,c);const rewards=[c.state.influence,c.state.suspicion,c.state.publicMood];c=reload(c);
 assert.equal(requirementsMet(finish.requirements,c),false);assert.equal(requirementsMet(babaSupportRule.requirements,c),false);
 for(let i=0;i<4;i++){apply(fountain(empty,c),c);assert.equal(swap(water,c),null);c=reload(c);assert.equal(bottleCount(c),1);}
 assert.deepEqual([c.state.influence,c.state.suspicion,c.state.publicMood],rewards);assert.equal(c.state.tonyVote,true);assert.equal(c.state.babaStoyankaVote,true);
});

test('ordinary water glass cannot prepare contest; unrelated drinking/recovery remains available',()=>{
 const c=ctx({inventory:['item.glass_of_water'],flags:{tonyChallengeStarted:true,tonyDistracted:true},rakiaGlasses:4});
 assert.equal(swap('item.glass_of_water',c).reject,true);apply(swap('item.glass_of_water',c),c);assert.equal(c.state.swappedOwnRakiaWithWater,false);assert.equal(c.inventory.has('item.glass_of_water'),true);
 apply(chapter1.items.find(i=>i.id==='item.glass_of_water').selfUseRules[0],c);assert.equal(c.state.rakiaGlasses,3);
});

for(const overrides of [{hasSunflowerOil:true},{drankOilBeforeTonyChallenge:true},{flags:{fountainValveOiled:true}},{flags:{fountainRepaired:true}},{flags:{fountainRepaired:true},inventory:[oil]}]){
 test('legacy bottle recovery is idempotent: '+JSON.stringify(overrides),()=>{
  let c=reload(ctx(overrides));assert.deepEqual(c.state.inventory,[empty]);const snapshot=structuredClone(c.state);c=reload(c);assert.deepEqual(c.state,snapshot);assert.equal(bottleCount(c),1);
  if(!c.state.flags.fountainValveOiled&&!c.state.flags.fountainRepaired){assert.ok(apply(oilRefillRule,c));assert.deepEqual(c.state.inventory,[oil]);}
  else {assert.equal(requirementsMet(oilRefillRule.requirements,c),false);if(!c.state.flags.fountainRepaired)apply(firstMatchingRule(fountainUseRules,c),c);apply(fountain(empty,c),c);assert.deepEqual(c.state.inventory,[water]);}
 });
}
for(const id of bottleItemIds)test('dropped '+id+' remains recoverable, blocks Kiro, and survives reload',()=>{
 let c=reload(ctx({hasSunflowerOil:true,droppedItems:[{itemId:id,sceneId:'scene.chapter1.apartment',position:{x:800,y:550}}]}));
 assert.equal(c.state.inventory.length,0);assert.equal(c.state.droppedItems[0].itemId,id);assert.equal(bottleCount(c),1);assert.equal(requirementsMet(oilRefillRule.requirements,c),false);assert.deepEqual(reload(c).state,c.state);
});
test('conflicting legacy copies collapse safely; held water wins and rewards stay earned',()=>{
 const c=reload(ctx({inventory:[oil,water,empty,water],droppedItems:[{itemId:oil}],tonyVote:true,babaStoyankaVote:true,influence:40,completedQuests:['quest.chapter1.tony_vote','quest.chapter1.baba_vote']}));
 assert.deepEqual(c.state.inventory,[water]);assert.equal(c.state.droppedItems.length,0);assert.equal(c.state.influence,40);assert.equal(requirementsMet(finish.requirements,c),false);assert.equal(requirementsMet(babaSupportRule.requirements,c),false);
});
for(const endingId of ['ending.chapter1.loss','ending.chapter1.narrow_win','ending.chapter1.convincing_win'])test('finished '+endingId+' stays closed',()=>{
 const c=reload(ctx({chapter1Completed:true,endingId,flags:{fountainRepaired:true},activeQuests:[],expiredQuests:['quest.chapter1.baba_vote']}));assert.equal(bottleCount(c),0);assert.equal(requirementsMet(oilRefillRule.requirements,c),false);assert.equal(c.state.endingId,endingId);assert.deepEqual(c.state.activeQuests,[]);
});
test('atomic reusable replacement rejects stale source or owned/dropped destination before subsequent effects',()=>{
 for(const overrides of [{inventory:[]},{inventory:[oil,empty]},{inventory:[oil],droppedItems:[{itemId:empty}]}]){
 const c=ctx(overrides),before=structuredClone(c.state);applyEffects([{type:'replaceItem',itemId:oil,withItemId:empty},{type:'setFlag',key:'shouldNotRun'}],c);assert.deepEqual(c.state,before);
 }
});
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {stripBottleQuest} from './helpers/bottle-preservation.js';
import {stripSquareRedesign} from './helpers/square-redesign-preservation.js';
test('fixed PR53 art, motion, renderer and animation-state systems remain byte-exact',()=>{
 const fixture=JSON.parse(readFileSync('test/fixtures/mehana-bottle-art-baseline.json'));
 assert.equal(fixture.baseline,'31793384bef7e48d763416b13dabfcf76fc3652e');
 for(const [path,objectId]of Object.entries(fixture.originals)){
  const data=Buffer.from(stripSquareRedesign(path,readFileSync(path)));assert.equal(createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex'),objectId,path);
 }
 const deltas=JSON.parse(readFileSync('test/fixtures/mehana-bottle-reviewed-deltas.json'));
 for(const [path,record]of Object.entries(deltas.records))assert.equal(createHash('sha256').update(stripBottleQuest(path,readFileSync(path))).digest('hex'),record.beforeSHA256,path);
});
test('new empty/water GLBs and PNGs retain workshop provenance, geometry and embedded label',()=>{
 const provenance=JSON.parse(readFileSync('assets_src/chapter1/items/kiro-bottle-lifecycle.json'));
 for(const record of provenance.records){const data=readFileSync(record.path);assert.equal(createHash('sha256').update(data).digest('hex'),record.sha256);assert.equal(data.length,record.bytes);
 if(record.path.endsWith('.glb')){assert.equal(data.toString('ascii',0,4),'glTF');const gltf=JSON.parse(data.toString('utf8',20,20+data.readUInt32LE(12)));assert.equal(gltf.images.length,record.state==='water-c07'?2:1);assert.ok(gltf.images[0].bufferView>=0);assert.ok(!gltf.cameras?.length);assert.ok(!gltf.animations?.length);assert.ok(gltf.materials.some(m=>m.name.includes('paper')));}
 }
});

test('selected c07 water changes only liquid material and appended UV/texture; all bottle geometry and embedded label remain exact',()=>{
 const parse=p=>{const b=readFileSync(p),n=b.readUInt32LE(12);return {json:JSON.parse(b.toString('utf8',20,20+n)),binary:b.subarray(28+n,28+n+b.readUInt32LE(20+n))};};
 const original=parse('assets/chapter1/items/kiro-bottle/yellow-water-full-r08.glb'),current=parse('assets/chapter1/items/kiro-bottle/fountain-water-c07.glb');
 assert.ok(current.binary.subarray(0,original.binary.length).equals(original.binary),'original vertices, normals, triangle indices and label PNG bytes unchanged');
 const water=current.json.meshes.find(m=>m.name.includes('water')).primitives[0];
 assert.equal(water.attributes.TEXCOORD_0,original.json.accessors.length);
 const texture=current.json.materials[water.material].pbrMetallicRoughness.baseColorTexture;
 assert.equal(texture.index,original.json.textures.length);
 delete water.attributes.TEXCOORD_0;
 current.json.materials[water.material]=original.json.materials[water.material];
 for(const key of ['accessors','bufferViews','images','textures'])current.json[key]=current.json[key].slice(0,original.json[key].length);
 current.json.buffers=original.json.buffers;
 assert.deepEqual(current.json,original.json,'no hidden changes to meshes, transforms, cap, label, glass or fill level');
 const native=JSON.parse(readFileSync('assets_src/chapter1/items/kiro-water-c07/native-geometry-verification.json'));
 assert.equal(native.unchanged,true);assert.equal(native.source_sha256,'255b0ca0b57a8de6c0f0b6a69bcd395d687d14e8188a8b311b95881cf92f2750');
});
