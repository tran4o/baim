import test from 'node:test';
import assert from 'node:assert/strict';
import { scenes } from '../src/content/chapter1/scenes.js';
import { Game } from '../src/engine/Game.js';
import { isWalkable, findWalkPath, findTargetAt } from '../src/engine/SceneGeometry.js';
import { stripActionCursors, restoreActionCursorsSnapshot } from './helpers/action-cursors-preservation.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('new cursor/entrance inverse restores the exact canonical predecessor and rejects unbound source and data', () => {
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/action-cursors-deltas.json',import.meta.url)));
  const sha=b=>createHash('sha256').update(b).digest('hex');
  for(const [path,record] of Object.entries(fixture.records)) {
    const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
    assert.equal(sha(stripActionCursors(path,source)),record.beforeSHA256);
    assert.throws(()=>stripActionCursors(path,source+'\n'),/exact action cursor inverse/);
  }
  assert.equal(sha(JSON.stringify(restoreActionCursorsSnapshot('scenes',scenes))),fixture.snapshots.scenes.beforeSHA256);
  const changed=structuredClone(scenes);changed[0].titleKey='unbound';
  assert.throws(()=>restoreActionCursorsSnapshot('scenes',changed),/exact scene fix action cursor snapshot/);
});

test('every walking exit has a reachable floor threshold and a walkable arrival', () => {
  let count = 0;
  for (const scene of scenes) for (const exit of scene.exits) {
    if (scene.playerMode === 'closeup') continue;
    count++;
    assert.ok(exit.entryApproach, exit.id);
    assert.ok(isWalkable(scene, exit.entryApproach), exit.id);
    const destination = scenes.find(s => s.id === exit.targetSceneId);
    assert.ok(isWalkable(destination, exit.targetPosition), exit.id + ' arrival');
    const starts = [scene.playerStart, ...scene.exits.map(t => t.entryApproach)].filter(Boolean);
    for (const start of starts) {
      const path = findWalkPath(scene, start, exit.entryApproach);
      assert.ok(path.length, exit.id);
      for (let i = 1; i < path.length; i++) {
        const a = path[i-1], b = path[i], n = Math.ceil(Math.hypot(b.x-a.x,b.y-a.y));
        for(let j=0;j<=n;j++) { const p={x:a.x+(b.x-a.x)*j/(n||1),y:a.y+(b.y-a.y)*j/(n||1)}; assert.ok(isWalkable(scene,p),exit.id+' path floor '+JSON.stringify({start,a,b,p})); }
      }
    }
  }
  assert.equal(count, 10);
});

test('apartment building accepts clicks independently of its ground threshold and rear entry', () => {
  const scene = scenes.find(s => s.id.endsWith('village_square'));
  const exit = scene.exits.find(t => t.id.endsWith('to_apartment'));
  for (const point of [{x:450,y:150},{x:390,y:130},{x:550,y:230}]) assert.equal(findTargetAt(scene,point)?.id,exit.id);
  for (const point of [{x:455,y:340},{x:460,y:445},{x:345,y:150},{x:610,y:150}]) assert.notEqual(findTargetAt(scene,point)?.id,exit.id);
  assert.equal(exit.entryFacing,'north');
  assert.deepEqual(exit.entryApproach,{x:460,y:445});
  assert.equal(isWalkable(scene,{x:400,y:450}),false);
});

test('entrance click queues transition until the actual threshold, and retargeting cancels it', () => {
  const game = Object.create(Game.prototype);
  game.currentScene = scenes.find(s => s.id.endsWith('village_square'));
  game.state = {flags:{}}; game.inventory = {has:()=>false}; game.selectedVerb = 'talk';
  game.player = {position:{x:1000,y:620},animation:'idle'};
  game.clearStatusMessage=()=>{};
  game.walkToPoint=(p,_,options)=>{game.player.target=p;game.options=options;return true;};
  let transitioned=false; game.performTargetAction=()=>{transitioned=true;};
  const exit=game.currentScene.exits.find(t=>t.id.endsWith('to_apartment'));
  game.handleTarget(exit);
  assert.equal(transitioned,false); assert.equal(game.player.pendingInteraction.target.id,exit.id);
  assert.equal(game.options.arrivalFacing,'north');
  game.resolvePendingInteraction(); assert.equal(transitioned,false);
  game.player.target=null; game.player.position={...exit.entryApproach}; game.resolvePendingInteraction();
  assert.equal(transitioned,true); assert.equal(game.player.facing,'north');
  transitioned=false; game.player.position={x:1000,y:620}; game.handleTarget(exit);
  game.player.target=null; game.resolvePendingInteraction(); assert.equal(transitioned,false);
});

test('View cancels an unfinished journey without changing feet or running approach actions', () => {
  const game=Object.create(Game.prototype), p={x:600,y:550};
  game.player={position:{...p},target:{x:1000,y:550},walkPath:[],animation:'walk',facing:'east'};
  game.selectedVerb='look';game.lookTarget=()=>{};
  game.handleTarget({kind:'hotspot',rect:{x:300,y:350,w:40,h:40}}, {x:320,y:370});
  assert.deepEqual(game.player.position,p);assert.equal(game.player.target,null);assert.equal(game.player.pendingInteraction,null);
});
