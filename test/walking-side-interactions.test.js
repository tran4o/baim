import test from "node:test";
import assert from "node:assert/strict";
import { MovementSystem, walkRampTime, walkSpeedRatio, requestWalkStop } from "../src/engine/MovementSystem.js";
import { planCharacterApproach, isCharacterInteraction, characterInteractionBounds } from "../src/engine/InteractionApproach.js";
import { scenes } from "../src/content/chapter1/scenes.js";
import { findWalkPath, isWalkable } from "../src/engine/SceneGeometry.js";
import { Game } from "../src/engine/Game.js";
import { characterDefinitions } from "../src/content/art/characters.js";
import { AnimationPlayer } from "../src/engine/AnimationPlayer.js";
import { characterHeight } from "../src/engine/CharacterRenderMath.js";

function player() { return { position: { x: 100, y: 500 }, speed: 100, facing: "east", animation: "idle", walkPath: [] }; }
function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
test("ramp is nonzero, smooth, monotonic and integrates independently of frame rate", () => {
  assert.equal(walkSpeedRatio(0), .35); assert.equal(walkSpeedRatio(.24), 1);
  for (let t = .01; t <= .3; t += .01) assert.ok(walkSpeedRatio(t) >= walkSpeedRatio(t-.01));
  for (const dt of [1/30,1/60,1/144,.001]) {
    let time=0, total=0; while(time<1-1e-10){ const step=Math.min(dt,1-time); total+=walkRampTime(time,step);time+=step; }
    assert.ok(Math.abs(total-.922)<1e-10);
  }
});
test("actual travel accelerates, retargets/reverses without resetting, and clamps exact arrival", () => {
  const p=player(), m=new MovementSystem(p); m.walkTo({x:1000,y:500});
  const speeds=[]; for(let i=0;i<20;i++){const x=p.position.x;m.update(.02);speeds.push((p.position.x-x)/.02);}
  assert.ok(speeds[0]>0&&speeds[0]<40);assert.ok(Math.abs(speeds.at(-1)-100)<1e-8);
  const elapsed=p.walkTravelElapsed;m.walkTo({x:50,y:500});assert.equal(p.walkTravelElapsed,elapsed);
  m.update(.02);assert.equal(p.walkCadenceRatio,1);
  m.walkTo({x:p.position.x-5,y:500});const destination={...p.target};m.update(.1);
  assert.deepEqual(p.position,destination);assert.equal(p.target,null);
  m.walkTo({x:1000,y:500});assert.equal(p.walkTravelElapsed,0);
});
test("short journeys finish during acceleration, no-op does not reset active motion, corners consume travel budget", () => {
  const p=player(),m=new MovementSystem(p);m.walkTo({x:105,y:500});m.update(.12);
  assert.deepEqual(p.position,{x:105,y:500});
  p.animation="idle";p.position={x:100,y:500};m.walkTo({x:300,y:510},null,[{x:110,y:500},{x:110,y:510},{x:300,y:510}]);
  p.walkTravelElapsed=.3;m.update(.25);assert.deepEqual(p.position,{x:115,y:510});
  const before={elapsed:p.walkTravelElapsed,target:p.target};assert.equal(m.walkTo({...p.position}),false);
  assert.equal(p.walkTravelElapsed,before.elapsed);assert.equal(p.target,before.target);
  requestWalkStop(p);assert.equal(p.walkTravelElapsed,0);
});
for(const scene of scenes) for(const target of [...scene.npcs,...scene.interactables.filter(isCharacterInteraction)]) {
  test(`${scene.id} ${target.id}: reachable side approach from several starting points`,()=>{
    const heightAt=p=>characterHeight(characterDefinitions["npc.bai_mitko"],scene,p);
    const first=planCharacterApproach(scene,target,scene.playerStart,heightAt);
    assert.ok(first, "missing side approach: report exact obstacle before broadening geometry");
    const mask=scene.walkMask, cells=[];
    if(mask) for(let y=0;y<mask.height;y++)for(let x=0;x<mask.width;x++){
      const p={x:(x+.5)*(mask.worldWidth||1280)/mask.width,y:(y+.5)*(mask.worldHeight||720)/mask.height};
      if(isWalkable(scene,p))cells.push(p);
    }
    for(const from of [scene.playerStart,first.point,...[cells[0],cells.at(-1)].filter(Boolean)]) {
      const plan=planCharacterApproach(scene,target,from,heightAt);
      assert.ok(plan);assert.ok(isWalkable(scene,plan.point));assert.ok(findWalkPath(scene,from,plan.point).length);
      const body=characterInteractionBounds(scene,target);
      assert.equal(plan.facing,plan.point.x<body.x+body.w/2?"east":"west");
      if(plan.path.length){const end=plan.path.at(-1),lead=plan.path.at(-2);assert.deepEqual(end,plan.point);assert.equal(end.y,lead.y);assert.equal(Math.sign(end.x-lead.x),plan.facing==="east"?1:-1);}
      let previous=from;for(const waypoint of plan.path.slice(0,-1)){assert.ok(segmentDistance(plan.point,previous,waypoint)>4,'do not walk over the final stop and reverse back');previous=waypoint;}
    }
  });
}
test("interaction arrival clears vertical resting poses and preserves horizontal facing",()=>{
  const p=player();p.facing="north";p.idleHoldFrame={};p.directionalStopFrame={};
  Game.prototype.faceInteractionSide.call({player:p},"west");
  assert.equal(p.facing,"west");assert.equal(p.idleHoldFrame,null);assert.equal(p.directionalStopFrame,null);
});
test("queued NPC interaction waits for actual stop and latest free click cancels it",()=>{
  const g=Object.create(Game.prototype),scene=scenes.find(s=>s.id==="scene.chapter1.village_square");
  g.currentScene=scene;g.characterDefinitions=characterDefinitions;g.player=player();g.player.position={...scene.playerStart};
  g.selectedVerb="talk";g.movement=new MovementSystem(g.player);g.clearStatusMessage=()=>{};g.performTargetAction=t=>g.performed=t.id;
  const npc=scene.npcs[0];assert.equal(g.approachCharacter(npc),true);assert.equal(g.player.pendingInteraction.target,npc);
  g.resolvePendingInteraction();assert.equal(g.performed,undefined);
  for(let i=0;i<1000&&g.player.target;i++)g.movement.update(.05);
  g.resolvePendingInteraction();assert.equal(g.performed,npc.id);assert.ok(["east","west"].includes(g.player.facing));
  g.approachCharacter(scene.npcs[1]);g.handleWorldClick({x:330,y:600});assert.equal(g.player.pendingInteraction,null);
});
test("cadence integrates playback without phase jumps and leaves stationary transitions unchanged",()=>{
  const p=player(),g={player:p};p.animation="walk";p.walkPart="loop";p.target={x:1000,y:500};
  const animator=new AnimationPlayer({animations:{walk:{type:"strip",fps:20,frameCount:16,loop:true}}});animator.play("walk");
  let expected=0;
  for(let i=0;i<20;i++){p.walkCadenceRatio=walkRampTime(i*.02,.02)/.02;const dt=.02*Game.prototype.locomotionCadenceRatio.call(g);expected+=dt;animator.update(dt);assert.equal(animator.frameIndex,Math.floor(expected*20)%16);}
  p.walkPart="stop";assert.equal(Game.prototype.locomotionCadenceRatio.call(g),1);
  p.walkPart="start";p.walkMovementStartFrameByFacing={east:4};p.animator={frameIndex:0};assert.equal(Game.prototype.locomotionCadenceRatio.call(g),1);
});
test("speaker changes keep horizontal listening and approved actions take priority",()=>{
  const g=Object.create(Game.prototype);g.player=player();g.player.position={x:500,y:500};g.player.facing="north";
  const npc={id:"npc.test",rect:{x:100,y:100,w:100,h:300}};
  g.currentScene={npcs:[npc]};g.content={dialogues:{test:{npcId:npc.id}}};
  g.dialogue={current:{id:"test"},getNode:()=>({})};
  g.updateNpcDialogueSpeech(0);assert.equal(g.player.facing,"west");
  npc.rect.x=800;g.updateNpcDialogueSpeech(0);assert.equal(g.player.facing,"east");
  g.player.animation="action";npc.rect.x=100;g.updateNpcDialogueSpeech(0);assert.equal(g.player.facing,"east");
});
test("commission-table dialogue uses its actual character while retaining the original action target",()=>{
  const g=Object.create(Game.prototype);g.currentScene=scenes.find(s=>s.id==="scene.chapter1.election_booth");
  const target=g.currentScene.interactables.find(t=>t.useDialogueId),npc=g.currentScene.npcs.find(n=>n.id==="npc.mayor");
  g.content={dialogues:{[target.useDialogueId]:{npcId:npc.id}}};assert.equal(g.interactionCharacterTarget(target),npc);
});
test("Baba interaction uses visible actor placement and accepts its body click",()=>{
  const g=Object.create(Game.prototype);g.currentScene=scenes.find(s=>s.id.endsWith("village_square"));
  g.targetAvailable=()=>true;const baba=g.currentScene.npcs.find(n=>n.id==="npc.baba_stoyanka");
  const body=g.characterApproachBounds(baba);assert.equal(body.x,325);assert.equal(body.y,330);
  assert.equal(g.sceneTargetAt({x:360,y:400}),baba);
  const plan=planCharacterApproach(g.currentScene,baba,g.currentScene.playerStart,280);
  assert.deepEqual(plan.point,{x:442.5,y:477.5});assert.equal(plan.facing,"west");assert.ok(plan.point.x>body.x+body.w);
});
test("crowded destinations avoid other actors and retain clear authored stops when they leave",()=>{
  for(const [sceneId,targetId,expected] of [
    ["mayor_office","npc.mayor",{x:408,y:564}],
    ["village_square","hotspot.square.kiosk",{x:1077.5,y:655}],
    ["election_booth","npc.journalist",{x:228,y:564}],
    ["election_booth","npc.tony_fridge",{x:228,y:564}],
    ["election_booth","npc.baba_stoyanka",{x:740,y:564}]
  ]){
    const scene=scenes.find(s=>s.id.endsWith(sceneId)),t=[...scene.npcs,...scene.interactables].find(t=>t.id===targetId);
    const plan=planCharacterApproach(scene,t,scene.playerStart,p=>characterHeight(characterDefinitions['npc.bai_mitko'],scene,p));
    assert.deepEqual(plan.point,expected);assert.equal(plan.spatialException,true);
  }
  const s=scenes.find(s=>s.id.endsWith('village_square')),t=s.interactables.find(t=>t.id==='hotspot.square.kiosk');
  const clear={...s,npcs:s.npcs.filter(n=>n.id!=='npc.journalist')};
  assert.deepEqual(planCharacterApproach(clear,t,s.playerStart,280).point,{x:1022.5,y:607.5});
});
