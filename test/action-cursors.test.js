import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ActionCursor, cursorTargetSupportsAction as supports, cursorInteractionBlocked, cursorFrameAt, CURSOR_ART, NEUTRAL_CURSOR_ART } from '../src/engine/ActionCursor.js';
import { Game } from '../src/engine/Game.js';
import { chapter1 } from '../src/content/chapter1/index.js';
import { requirementsMet } from '../src/engine/EffectSystem.js';

function fixture() {
  const owned = new Set(), state = { flags: {} };
  const game = { state, inventory: { has: id => owned.has(id) }, content: { items: {} },
    effectContext: () => ({ state, inventory: game.inventory }),
    targetAvailable: target => !target.hiddenWhenItemOwned || !owned.has(target.hiddenWhenItemOwned),
    itemTargetRuleMatches: Game.prototype.itemTargetRuleMatches };
  return { game, owned, state };
}
test('each selected action animates only when it meaningfully applies', () => {
  const { game } = fixture(), target = { id: 'statue', nameKey: 'statue', lookKey: 'statue.look' };
  assert.deepEqual(['look', 'talk', 'use', 'take'].map(v => supports(game, target, v)), [true, false, false, false]);
  assert.equal(supports(game, { dialogueId: 'talk' }, 'talk'), true);
  assert.equal(supports(game, { takeItemId: 'cup' }, 'take'), true);
  assert.equal(supports(game, { useRules: [{ effects: [] }] }, 'use'), true);
  assert.equal(supports(game, null), false);
});
test('inventory compatibility respects explicit rejection and does not execute effects', () => {
  const { game, state, owned } = fixture(); game.inventoryUseItemId = 'oil'; owned.add('oil');
  game.content.items.oil = { targetUseRules: [{ targetIds: ['hinge'], effects: [{type:'removeItem',itemId:'oil'}] }] };
  const before = JSON.stringify(state);
  assert.equal(supports(game, { id: 'hinge' }, 'use'), true);
  assert.equal(supports(game, { id: 'wall', nameKey: 'wall' }, 'use'), false);
  assert.equal(supports(game, { id: 'hinge', itemUseRules: [{itemId:'oil', reject:true}] }, 'use'), false);
  assert.equal(JSON.stringify(state), before); assert.equal(owned.has('oil'), true);
});
test('unavailable and collected hidden objects never animate', () => {
  const { game, owned } = fixture(), target = { id: 'cup', hiddenWhenItemOwned: 'cup' };
  assert.equal(supports(game, {...target,takeItemId:'cup'}, 'take'), true); owned.add('cup'); assert.equal(supports(game, target, 'look'), false);
});
test('guarded Take follows current state, rejects owned items, and never mutates a quest', () => {
  const { game, state, owned }=fixture();
  const diploma=chapter1.scenes.flatMap(s=>s.interactables).find(t=>t.id==='hotspot.mehana.tony_diploma');
  assert.equal(supports(game,diploma,'take'),false);
  const success=diploma.takeRules.find(r=>!r.reject);
  for(const key of success.requirements?.flags||[])state.flags[key]=true;
  Object.assign(state,success.requirements?.state||{});
  const before=JSON.stringify(state);assert.ok(requirementsMet(success.requirements,game.effectContext()));
  assert.equal(supports(game,diploma,'take'),true);assert.equal(JSON.stringify(state),before);
  owned.add(diploma.takeItemId);assert.equal(supports(game,diploma,'take'),false);
});
test('action requirements, rejected talk/look rules, solved puzzles and exits stay still when inapplicable', () => {
  const {game,state}=fixture(),target={actions:{use:[{requirements:{flags:['ready']},animation:'turn'}]},talkRules:[{reject:true}]};
  assert.equal(supports(game,target,'use'),false);state.flags.ready=true;assert.equal(supports(game,target,'use'),true);
  assert.equal(supports(game,target,'talk'),false);assert.equal(supports(game,{nameKey:'x',lookRules:[{reject:true}]},'look'),false);
  assert.equal(supports(game,{puzzleId:'photo_cupboard'},'use'),true);state.flags.photoCupboardSolved=true;assert.equal(supports(game,{puzzleId:'photo_cupboard'},'use'),false);
  const exit={kind:'exit',accessRequirements:{flags:['open']}};assert.equal(supports(game,exit,'use'),false);state.flags.open=true;
  assert.equal(supports(game,exit,'use'),true);assert.equal(supports(game,exit,'talk'),false);assert.equal(supports(game,exit,'take'),false);
});
test('presentation switches between C, still Talk on a statue and animated Talk on a speaker without altering the selected verb', () => {
  const {game}=fixture(),canvas={},ui={},cursor=Object.create(ActionCursor.prototype);let under=canvas,target=null;
  Object.assign(cursor,{canvas,pointer:{x:100,y:100},surface:{contains:()=>true},document:{hidden:false,elementFromPoint:()=>under},overlay:{style:{},dataset:{}},ctx:{clearRect(){},drawImage(){}},images:Object.fromEntries(['neutral','look','talk','use','take'].map(v=>[v,{complete:true,naturalWidth:v==='neutral'?96:768}]))});
  canvas.style={};Object.assign(game,{selectedVerb:'talk',renderer:{screenToWorld:()=>({x:100,y:100})},sceneTargetAt:()=>target});
  cursor.update(game,100);assert.equal(cursor.overlay.dataset.verb,'neutral');assert.equal(cursor.overlay.dataset.frame,'0');
  target={id:'statue',nameKey:'statue'};cursor.update(game,200);cursor.update(game,400);assert.equal(cursor.overlay.dataset.verb,'talk');assert.equal(cursor.overlay.dataset.active,'false');assert.equal(cursor.overlay.dataset.frame,'0');
  target={id:'speaker',talkKey:'hi'};cursor.update(game,500);cursor.update(game,600);assert.equal(cursor.overlay.dataset.active,'true');assert.equal(cursor.overlay.dataset.frame,'2');
  game.sceneTransitionPending=true;cursor.update(game,700);assert.equal(cursor.overlay.dataset.verb,'neutral');assert.equal(cursor.overlay.style.display,'block');
  game.sceneTransitionPending=false;under=ui;cursor.update(game,800);assert.equal(cursor.overlay.dataset.verb,'neutral');assert.equal(game.selectedVerb,'talk');
  under=canvas;target={id:'door',kind:'exit',nameKey:'door'};
  for(const verb of ['look','talk','use','take']) {
    game.selectedVerb=verb;cursor.update(game,900);cursor.update(game,1100);
    assert.equal(cursor.overlay.dataset.verb,'neutral');assert.equal(cursor.overlay.dataset.active,'false');assert.equal(cursor.overlay.dataset.frame,'0');assert.equal(game.selectedVerb,verb);
  }
  game.inventoryUseItemId='oil';cursor.update(game,1200);assert.equal(cursor.overlay.dataset.verb,'neutral');assert.equal(cursor.overlay.dataset.active,'false');
});
test('neutral runtime frame preserves the chosen C source and its precise hotspot', () => {
  const meta=JSON.parse(readFileSync(new URL('../assets_src/ui/action-cursors/neutral-r11.json',import.meta.url))),hash=b=>createHash('sha256').update(b).digest('hex');
  assert.equal(meta.sourceSHA256,'79d65d567d27586d13e8f3257e944fab3a14f629a2237c797f7d9db25cf6d379');
  assert.equal(hash(readFileSync(new URL('../assets_src/ui/action-cursors/neutral-original.svg',import.meta.url))),meta.sourceSHA256);
  assert.equal(hash(readFileSync(new URL('../assets/ui/action-cursors/neutral.png',import.meta.url))),meta.atlasSHA256);
  assert.deepEqual(NEUTRAL_CURSOR_ART,{id:'N-C',hotspot:[4,3]});
});
test('interaction blockers freeze cursor motion during modals, actions, editor and transitions', () => {
  for (const change of [{ menuOpen: true }, { paused: true }, { puzzleOpen: true }, { inspectedItemId: 'bottle' }, { sceneAction: { active: true } },
    { dialogue: { current: {} } }, { sceneTransitionPending: true }, { player: { actionSequence: {} } }, { player: { animation: 'action' } }, { editMode: true }]) assert.equal(cursorInteractionBlocked(change), true);
  assert.equal(cursorInteractionBlocked({}), false);
});
test('still frame never advances; motion wraps at approved R06 cadence', () => {
  assert.equal(cursorFrameAt(false, 10000), 0); assert.equal(cursorFrameAt(true, 49), 0); assert.equal(cursorFrameAt(true, 50), 1);
  assert.equal(cursorFrameAt(true, 2399), 47); assert.equal(cursorFrameAt(true, 2400), 0);
});
test('runtime package binds the accepted originals including the very first TAKE-A', () => {
  const manifest = JSON.parse(readFileSync(new URL('../assets_src/ui/action-cursors/motion-r06.json', import.meta.url)));
  assert.equal(manifest.cursors.find(c => c.verb === 'take').originalSHA256, '5b8d64c1a31560b11bbaa8c4ce5e2767dbd9b5bd6b69947cb961045c5157b96e');
  for (const cursor of manifest.cursors) {
    const svg = readFileSync(new URL(`../assets_src/ui/action-cursors/${cursor.verb}-original.svg`, import.meta.url));
    const atlas = readFileSync(new URL(`../assets/ui/action-cursors/${cursor.verb}.png`, import.meta.url));
    const hash = b => createHash('sha256').update(b).digest('hex');
    assert.equal(hash(svg), cursor.originalSHA256); assert.equal(hash(atlas), cursor.atlasSHA256);
    assert.equal(cursor.id, CURSOR_ART[cursor.verb].id);
  }
});
