import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chapter1 } from '../src/content/chapter1/index.js';
import { strings } from '../src/content/localization/index.js';
import { photoQuestBg, photoQuestEn } from '../src/content/localization/chapter1PhotoQuest.js';
import { adultPhotoReward, photoReward, pepaMusicRule, pepaPosterRule, pepaDiplomaRule, diplomaTakeRule } from '../src/content/chapter1/photoQuest.js';
import { initialPuzzle, validPuzzle, movePuzzle, puzzleSolved, puzzleHint } from '../src/engine/SlidingBlockPuzzle.js';
import { DEFAULT_SAVE } from '../src/engine/ids.js';
import { SaveSystem } from '../src/engine/SaveSystem.js';
import { InventorySystem } from '../src/engine/InventorySystem.js';
import { applyEffects, requirementsMet } from '../src/engine/EffectSystem.js';
import { findTargetAt, isWalkable, findWalkPath } from '../src/engine/SceneGeometry.js';
import { stripPhotoQuest, restorePhotoQuestSnapshot } from './helpers/photo-quest-preservation.js';
import { assetManifest } from '../src/content/art/assetManifest.js';
import { BEGINNER_PHOTO_PUZZLE as EASY_PHOTO_PUZZLE, initialPhotoPuzzle } from '../src/content/chapter1/photoPuzzleBeginner.js';
function context(state=structuredClone(DEFAULT_SAVE)) {return {state,inventory:new InventorySystem({},state)};}
function use(rule,ctx) { assert.ok(requirementsMet(rule.requirements,ctx));assert.equal(applyEffects(rule.effects,ctx),true); }
function reload(state) {return new SaveSystem({getItem:()=>JSON.stringify(state)}).load();}
test('preserved medium puzzle has its exact six-slide solution and old completion is retained on easy migration',()=>{
  let state=initialPuzzle(); assert.ok(validPuzzle(state)); assert.equal(movePuzzle(state,'blue',0,1),null);
  assert.equal(movePuzzle(state,'yellow2',1,0),null); assert.equal(movePuzzle(state,'blue',1,1),null);
  let n=0; while(!puzzleSolved(state)&&n<10) {const h=puzzleHint(state);assert.ok(h);state=movePuzzle(state,h.id,h.dx,h.dy);n++;}
  assert.equal(n,6);assert.ok(puzzleSolved(state));assert.equal(puzzleHint(state),null);
  const save=structuredClone(DEFAULT_SAVE);save.photoPuzzle=state;
  assert.deepEqual(reload(save).photoPuzzleMediumPreserved,state);
  assert.ok(puzzleSolved(reload(save).photoPuzzle,EASY_PHOTO_PUZZLE));
  save.photoPuzzle.positions.blue.x=99;assert.deepEqual(reload(save).photoPuzzle,initialPhotoPuzzle());
});
test('new quest preserves reusable photo, gates music and original diploma, and issues each reward once',()=>{
  const ctx=context();assert.equal(requirementsMet(pepaDiplomaRule.requirements,ctx),false);
  use(photoReward,ctx);assert.equal(requirementsMet(photoReward.requirements,ctx),false);
  assert.equal(ctx.inventory.has('item.mitko_child_photo'),true);
  use(adultPhotoReward,ctx);
  assert.equal(requirementsMet(pepaPosterRule.requirements,ctx),false);
  ctx.inventory.add('item.accordion');use(pepaMusicRule,ctx);
  assert.equal(requirementsMet(pepaMusicRule.requirements,ctx),false);
  use(pepaPosterRule,ctx);assert.equal(ctx.inventory.has('item.mitko_photo'),true);
  assert.equal(ctx.inventory.has('item.fake_diploma'),false);
  assert.equal(requirementsMet(diplomaTakeRule.requirements,ctx),false);
  const finish=chapter1.dialogues.find(d=>d.id==='dialogue.tony_fridge').nodes.start.choices.find(c=>c.next==='contest_result').effect;
  ctx.state.swappedOwnRakiaWithWater=true;use(finish,ctx);assert.equal(ctx.state.flags.tonyPassedOut,true);
  use(diplomaTakeRule,ctx);use(pepaDiplomaRule,ctx);
  assert.equal(ctx.inventory.has('item.tony_diploma'),false);assert.equal(ctx.inventory.has('item.mitko_photo'),true);
  assert.equal(ctx.inventory.has('item.fake_diploma'),true);assert.equal(ctx.state.suspicion,14);
  for(const rule of [pepaPosterRule,pepaDiplomaRule,diplomaTakeRule])assert.equal(requirementsMet(rule.requirements,ctx),false);
  const restored=context(reload(ctx.state)); assert.equal(restored.state.flags.pepaMusicPlayed,true); assert.equal(restored.state.flags.tonyPassedOut,true);
});
test('dropped photograph cannot be scanned remotely; old earned credentials are grandfathered without invented favors',()=>{
  const ctx=context();ctx.state.flags.pepaMusicPlayed=true;
  ctx.state.droppedItems=[{itemId:'item.mitko_photo',sceneId:'scene.chapter1.apartment',x:900,y:550}];
  assert.equal(requirementsMet(pepaPosterRule.requirements,ctx),false);
  const old=structuredClone(DEFAULT_SAVE);delete old.photoQuestVersion;old.hasFakeDiploma=true;old.inventory=['item.fake_diploma'];
  old.tonyVote=true;old.flags.tonyChallengeResolved=true;
  const restored=reload(old);assert.equal(restored.flags.legacyPhotoCredentials,true);assert.equal(restored.flags.tonyPassedOut,true);
  assert.equal(restored.flags.pepaMusicPlayed,undefined);assert.equal(restored.flags.photoCupboardSolved,undefined);
  assert.deepEqual(restored.inventory,['item.fake_diploma']);
  assert.equal(reload(structuredClone(DEFAULT_SAVE)).flags.legacyPhotoCredentials,undefined);
});
test('new authored objects survive generated geometry and diploma wins overlap only while present',()=>{
  const apartment=chapter1.scenes.find(s=>s.id==='scene.chapter1.apartment');
  assert.equal(apartment.interactables.some(t=>t.id==='hotspot.apartment.photo_cupboard'),false);
  const cupboard=apartment.interactables.find(t=>t.objectCloseup);assert.ok(cupboard.objectCloseup.items.some(i=>i.target.puzzleId==='photo_cupboard'));
  assert.ok(isWalkable(apartment,cupboard.interactionApproach)); assert.ok(findWalkPath(apartment,apartment.playerStart,cupboard.interactionApproach).length);
  const tavern=chapter1.scenes.find(s=>s.id==='scene.chapter1.mehana');
  assert.equal(findTargetAt(tavern,{x:1000,y:490}).id,'hotspot.mehana.tony_diploma');
  assert.notEqual(findTargetAt(tavern,{x:970,y:475},t=>t.id!=='hotspot.mehana.tony_diploma')?.id,'hotspot.mehana.tony_diploma');
});
test('Blender model contains all ten independent selectable pieces; localization keys match',()=>{
  const b=readFileSync('assets/chapter1/puzzles/photo-cupboard-c01.glb');assert.equal(b.toString('ascii',0,4),'glTF');
  const gltf=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
  assert.equal(gltf.nodes.filter(n=>n.extras?.pieceId).length,10);assert.ok(gltf.meshes.length>20);
  assert.deepEqual(Object.keys(photoQuestBg).sort(),Object.keys(photoQuestEn).sort());
  for(const lang of ['bg','en'])for(const key of Object.keys(photoQuestEn))assert.ok(strings[lang][key],`${lang}:${key}`);
});
test('new exact quest inverse restores PR75 without moving historical hashes and rejects unbound changes',()=>{
  const f=JSON.parse(readFileSync('test/fixtures/photo-quest-deltas.json'));
  assert.equal(f.baseline,'975fff594177c7af48167406c11878d41d8d3d06');
  for(const [path,r] of Object.entries(f.records)) {
    const bytes=readFileSync(path);assert.equal(stripPhotoQuest(path,bytes),r.before);
    assert.throws(()=>stripPhotoQuest(path,Buffer.concat([bytes,Buffer.from('unbound')])),/exact scene fix/);
  }
  assert.deepEqual(restorePhotoQuestSnapshot('scenes',chapter1.scenes),f.snapshots.scenes.before);
  assert.deepEqual(restorePhotoQuestSnapshot('manifest',assetManifest),f.snapshots.manifest.before);
  const bad=structuredClone(chapter1.scenes);bad[0].titleKey+='unbound';
  assert.throws(()=>restorePhotoQuestSnapshot('scenes',bad),/exact scene fix/);
});
