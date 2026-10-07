import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import {assetManifest} from '../src/content/art/assetManifest.js';
import {chapter1} from '../src/content/chapter1/index.js';
const baseline=JSON.parse(readFileSync('test/fixtures/mehana-redesign-tony-baseline.json'));
test('mehana redesign preserves the approved Tony animation layer with owner-requested registration including every animation hook',()=>{
 assert.equal(baseline.approvedBaseline,'c4eb300673b5eb9aee77b3d9c247ceafbb22b7e4');
 const layers=JSON.parse(readFileSync('assets_src/chapter1/scenes/mehana/layers.json'));
 assert.deepEqual(layers.layers.find(l=>l.id===baseline.tony.id),{...baseline.tony,left:877,top:296,height:320});
});
test('mehana full-canvas foregrounds preserve real transparency and room resolution',async()=>{
 const keys=['background','tableGroupLeft','tableGroupRight','mehanaRearChairs','mehanaCounterFront','mehanaCellarHatch'];
 for(const key of keys){const path=assetManifest.scenes['scene.chapter1.mehana'][key],im=sharp(path),meta=await im.metadata();assert.deepEqual([meta.width,meta.height],[1280,720]);if(key!=='background'){const {data,info}=await im.ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(data[3],0);assert.ok(Array.from(data.filter((_,i)=>i%info.channels===3)).some(a=>a>0),key);}}
});
test('new furniture depth retains conditional oil, water, newspaper, both contest glasses and cellar semantics',()=>{
 const scene=chapter1.scenes.find(s=>s.id==='scene.chapter1.mehana');const layer=id=>scene.foregroundLayers.find(l=>l.id==='layer.mehana.'+id);
 assert.equal(layer('kaliakra_oil').hiddenWhenState,'hasSunflowerOil');assert.equal(layer('water_jug').hiddenWhenState,'hasGlassOfWater');assert.equal(layer('newspaper_left_table').asset,'todayNewspaper');
 for(const id of ['mitko_competition_glass','tony_competition_glass']){assert.equal(layer(id).visibleWhenFlag,'tonyChallengeStarted');assert.equal(layer(id).hiddenWhenState,'tonyVote');}
 assert.equal(scene.interactables.find(i=>i.id==='hotspot.mehana.cellar_hatch').useRules[0].reject,true);
 assert.equal(scene.interactables.find(i=>i.id==='hotspot.mehana.cellar_hatch').requirements.disabled,true);
 assert.equal(JSON.parse(readFileSync('assets_src/chapter1/scenes/mehana/layers.json')).layers.find(l=>l.id==='layer.mehana.cellar_hatch_preserved').enabled,false);
 assert.equal(scene.interactables.find(i=>i.id==='hotspot.mehana.ballot_box').requirements.disabled,true);
 assert.ok(layer('counter_front').zIndex<layer('waiter_idle').zIndex);assert.ok(layer('table_group_right').zIndex<layer('tony_fridge_seated').zIndex);
});
test('the room omits counter interiors only where its always-enabled foreground restores full coverage',async()=>{
 const map=assetManifest.scenes['scene.chapter1.mehana'];
 const room=await sharp(map.background).ensureAlpha().raw().toBuffer();
 const counter=await sharp(map.mehanaCounterFront).ensureAlpha().raw().toBuffer();
 let holes=0;
 for(let i=3;i<room.length;i+=4){if(room[i]===0){holes++;assert.equal(counter[i],255,'every room hole must be covered fully by the counter');}if(counter[i]===255)assert.equal(room[i],0,'counter interiors must be separated from the room');}
 assert.ok(holes>30000,'counter must be an independent asset, not a duplicated background decoration');
 const source=JSON.parse(readFileSync('assets_src/chapter1/scenes/mehana/layers.json')).layers.find(l=>l.id==='layer.mehana.counter_front');
 assert.equal(source.enabled,true);assert.equal(source.visibleWhenFlag,undefined);assert.equal(source.hiddenWhenState,undefined);
});

test('static chairs and floor retain every approved painting RGB pixel outside counter holes',async()=>{
 const original=await sharp('assets_src/chapter1/scenes/mehana/redesign-v1/accepted-room-v13.png').resize(1280,720,{fit:'fill'}).ensureAlpha().raw().toBuffer();
 const room=await sharp(assetManifest.scenes['scene.chapter1.mehana'].background).ensureAlpha().raw().toBuffer();
 for(let i=0;i<room.length;i+=4)if(room[i+3]!==0)assert.deepEqual(room.subarray(i,i+3),original.subarray(i,i+3));
});

test('owner-requested bartender registration and static fallback survive the quiet polishing preview',async()=>{
 const scene=chapter1.scenes.find(s=>s.id==='scene.chapter1.mehana');const layer=scene.foregroundLayers.find(l=>l.id==='layer.mehana.waiter_idle');
 assert.deepEqual([layer.left,layer.top,layer.height],[727,222,265]);
 assert.equal(layer.asset,'mehanaWaiterIdle');assert.equal(layer.animation.quietOnly,true);assert.equal(layer.animation.npcId,'npc.mehana_waiter');
 assert.equal(layer.animation.frameCount,36);assert.equal(layer.animation.frameDurationMs,133);assert.equal(layer.animation.loop,true);
 assert.equal(scene.npcs.find(n=>n.id==='npc.mehana_waiter').dialogueId,'dialogue.mehana_waiter');
 const {createHash}=await import('node:crypto');assert.equal(createHash('sha256').update(readFileSync('assets/chapter1/characters/mehana_waiter/idle-v1.png')).digest('hex'),'c1c3ec8e93ab0bfc3e842c80746470bc5aaab149f4be0ab62badcda17bd54c26');
});
test('entire approved rear-edge strip is clean opaque counter in front of the bartender',async()=>{
 const map=assetManifest.scenes['scene.chapter1.mehana'];const counter=await sharp(map.mehanaCounterFront).ensureAlpha().raw().toBuffer();
 const clean=await sharp('assets_src/chapter1/scenes/mehana/redesign-v1/accepted-room-v13.png').resize(1280,720,{fit:'fill'}).ensureAlpha().raw().toBuffer();
 for(let y=343;y<356;y++)for(let x=720;x<825;x++){const i=(y*1280+x)*4;assert.equal(counter[i+3],255);assert.deepEqual(counter.subarray(i,i+3),clean.subarray(i,i+3));}
});
