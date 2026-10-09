import test from 'node:test';
import {stripKiroIdleVariationExtension} from './helpers/kiro-preservation.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DialogueSystem} from '../src/engine/DialogueSystem.js';
import {Renderer,sceneReactionBlendSamples} from '../src/engine/Renderer.js';
import {chapter1} from '../src/content/chapter1/index.js';
import {assetManifest} from '../src/content/art/assetManifest.js';
const baseline=JSON.parse(readFileSync('test/fixtures/baba-skeptical-approved-baseline.json'));
const scene=chapter1.scenes.find(s=>s.id==='scene.chapter1.village_square');
const layer=scene.foregroundLayers.find(l=>l.id==='layer.square.baba_stoyanka_seated');
const reaction=layer.reactionAnimations.skeptical_disapproval;
const dialogues=Object.fromEntries(chapter1.dialogues.map(d=>[d.id,d]));
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(){
 const effects=[],dialogue=new DialogueSystem(dialogues,null,e=>effects.push(e));
 const images=Object.fromEntries([reaction.asset,layer.talkAnimation.asset,layer.animation.asset,layer.asset].map(a=>[a,{}]));
 const loaded=new Set(Object.values(images)),draws=[];
 const game={lastTime:0,dialogue,content:{dialogues},speech:0,npcSpeechAnimationTime(){return dialogue.current?this.speech:null;},assets:{getSceneImage:(_s,a)=>images[a],isLoaded:i=>loaded.has(i)}};
 const renderer=Object.assign(Object.create(Renderer.prototype),{ctx:{drawImage:(...a)=>draws.push(a)},game});
 const draw=t=>{game.lastTime=t;renderer.drawSceneRasterLayer(scene,layer);return draws.at(-1);};
 dialogue.start('dialogue.baba_stoyanka');draw(0);
 const enter=()=>dialogue.choose(dialogues['dialogue.baba_stoyanka'].nodes.start.choices.find(c=>c.next==='promise'));
 return{game,dialogue,draw,images,loaded,effects,enter};
}
test('Baba promise plays all skeptical frames once, ignores redraw and returns to speech or idle',()=>{
 const f=fixture();f.enter();const entry=f.dialogue.entry;
 assert.equal(entry.reactionId,'skeptical_disapproval');const anchored=f.draw(10).slice(5);
 anchored.forEach((n,i)=>assert.ok(Math.abs(n-[325,330,389*122/636,122][i])<1e-10));
 for(let i=0;i<36;i++){
  const d=f.draw(10+(i+.01)*reaction.frameDurationMs);
  assert.equal(d[0],f.images[reaction.asset]);
  assert.equal(Math.floor(d[2]/reaction.frameHeight)*reaction.columns+Math.floor(d[1]/reaction.frameWidth),i);
  assert.deepEqual(d.slice(5),anchored);
 }
 assert.equal(f.draw(2900)[0],f.images[layer.talkAnimation.asset]);
 f.game.speech=null;assert.equal(f.draw(3000)[0],f.images[layer.animation.asset]);
 f.dialogue.getNode();assert.equal(f.dialogue.entry,entry);assert.equal(f.draw(3100)[0],f.images[layer.animation.asset]);
 f.enter();assert.notEqual(f.dialogue.entry,entry);assert.equal(f.draw(3200)[1],0);
 assert.deepEqual(f.effects,[]);
});
test('Baba skeptical pauses in menus, cancels on close and never replays a late-loaded asset',()=>{
 const f=fixture();f.enter();f.draw(10);f.game.menuOpen=true;assert.equal(f.draw(2010)[1],0);
 f.game.menuOpen=false;assert.equal(f.draw(2010+reaction.frameDurationMs*1.01)[1],389);
 f.dialogue.close();assert.equal(f.draw(2300)[0],f.images[layer.animation.asset]);
 f.dialogue.start('dialogue.baba_stoyanka');f.enter();f.loaded.delete(f.images[reaction.asset]);
 assert.equal(f.draw(2400)[0],f.images[layer.talkAnimation.asset]);f.loaded.add(f.images[reaction.asset]);
 assert.equal(f.draw(2500)[0],f.images[layer.talkAnimation.asset]);
 f.dialogue.start('dialogue.tony_fridge');f.dialogue.choose({next:'challenge_waiting'});
 assert.notEqual(f.draw(2600)[0],f.images[reaction.asset]);
});
test('Skeptical source and timing are bound; original approved assets, systems and localization are preserved',()=>{
 assert.equal(baseline.approvedBaseline,'a69ac4f2f8a164a6ac4859d9c6e8f61b2fb117dd');
 const pilotPath='assets_src/characters/baba_stoyanka/external_animation_v1/animation-pilot.json';
 // Retain the original baseline hash; remove only the reviewed opt-in idle extension.
 const preservedBytes=p=>{
  if(p==='src/engine/Game.js')return stripKiroIdleVariationExtension(p,readFileSync(p,'utf8'));
  if(p!=='src/engine/Renderer.js')return readFileSync(p);
  let source=stripKiroIdleVariationExtension(p,readFileSync(p,'utf8'));
  const hook="  sceneLayerIdleAnimation(scene, layer) {\n    const animation = layer.animation;\n    if (animation?.quietOnly !== true) return animation;\n    const npcId = animation.npcId;\n    const game = this.game;\n    if (!npcId || !scene.npcs?.some(npc => npc.id === npcId)\n      || game.paused || game.menuOpen || game.devHome || game.editMode\n      || game.content?.dialogues?.[game.dialogue?.current?.id]?.npcId === npcId\n      || game.npcSpeechBubble?.npcId === npcId\n      || game.npcSpeechAnimationTime?.(npcId) != null) return null;\n    return animation;\n  }\n\n";
  for(const [added,original]of [[hook,''],['    const idleAnimation = this.sceneLayerIdleAnimation(scene, layer);\n',''],['const baseAnimation = talking ? layer.talkAnimation : idleAnimation;','const baseAnimation = talking ? layer.talkAnimation : layer.animation;'],['const animation = reacting ? reaction : talking ? layer.talkAnimation : idleAnimation;','const animation = reacting ? reaction : talking ? layer.talkAnimation : layer.animation;']]){
   assert.equal(source.split(added).length,2,'exact reviewed quiet-idle extension required');source=source.replace(added,original);
  }
  return source;
 };
 for(const [p,expected]of Object.entries(baseline.files))assert.equal(sha(preservedBytes(p)),expected,`approved baseline changed: ${p}`);
 const pilot=JSON.parse(readFileSync(pilotPath));
 const candidate=pilot.animations.baba_skeptical_seated_1;delete pilot.animations.baba_skeptical_seated_1;
 assert.equal(sha(JSON.stringify(pilot)),baseline.semantic.pilot,'all prior Baba animation records must remain unchanged');
 assert.ok(['runtime_review','runtime_approved'].includes(candidate.status));assert.equal(candidate.review.candidateStatus,candidate.status);
 assert.equal(candidate.generation.creditsSpent,9);assert.equal(candidate.import.returnedTotalDurationSeconds,2.8333333333333335);
 assert.equal(candidate.import.timingOrigin,'derived_uniform_from_api_total_duration');
 const dir='assets_src/characters/baba_stoyanka/external_animation_v1/';
 for(const [file,hash]of [['nativeSourceFile','nativeSourceSha256'],['preservedPngFile','preservedPngSha256'],['provenanceFile','provenanceSha256'],['derivedAtlasMetadataFile','derivedAtlasMetadataSha256']])assert.equal(sha(readFileSync(dir+candidate.source[file])),candidate.source[hash]);
 assert.equal(sha(readFileSync(candidate.import.runtime.asset)),candidate.import.derivedOutputHashes[candidate.import.runtime.asset]);
 assert.equal(reaction.frameDurationMs,2.8333333333333335*1000/36);
 assert.equal(reaction.loop,false);assert.equal(reaction.interpolateFrames,true);assert.equal(reaction.transitionDurationMs,148);
 assert.deepEqual([layer.left,layer.top,layer.height,layer.zIndex],[325,330,122,90]);
 assert.equal(assetManifest.scenes[scene.id].babaStoyankaSkepticalSeated,candidate.import.runtime.asset);
 const fountain='src/content/chapter1/fountain.js';assert.equal(sha(readFileSync(fountain,'utf8').replace(', reactionId: "skeptical_disapproval"','')),baseline.source.fountain);
 const source='assets_src/chapter1/scenes/village_square/layers.json';const layers=JSON.parse(readFileSync(source));
 delete layers.layers.find(l=>l.id===layer.id).reactionAnimations.skeptical_disapproval;
 assert.equal(sha(JSON.stringify(layers)),baseline.semantic.layers,'prior layers/geometry and delighted reaction remain unchanged');
 // Normalize only the explicit mehana redesign mappings; keep the frozen Baba baseline intact.
 const manifest='src/content/art/assetManifest.js';
 const priorManifest=readFileSync(manifest,'utf8')
 .replace('      mehanaWaiterTalkingPolishing: "assets/chapter1/characters/mehana_waiter/kiro-talking-polishing-web-final-12d548cd.webp",\n','')
 .replace('      mehanaWaiterTalkingPolishingC07: "assets/chapter1/characters/mehana_waiter/kiro-talking-polishing-web-c07.webp",\n','')
 .replace('      mehanaWaiterListeningFinal: "assets/chapter1/characters/mehana_waiter/kiro-listening-final-frame08-d01.png",\n','')
 .replace('      mehanaWaiterTonyGlanceC05: "assets/chapter1/characters/mehana_waiter/kiro-tony-glance-keyframe-c05.webp",\n','')
 .replace('      mehanaWaiterListeningC07: "assets/chapter1/characters/mehana_waiter/kiro-listening-c07-frame00-d01.png",\n','')
 .replace('      mehanaWaiterSneakyGlassSwap: "assets/chapter1/characters/mehana_waiter/kiro-sneaky-glass-swap-web-c02.webp",\n','')
 .replace('      mehanaWaiterPolishingIdle: "assets/chapter1/characters/mehana_waiter/kiro-polishing-idle-web-c01.png",\n','')
 .replace('      babaStoyankaSkepticalSeated: "assets/chapter1/characters/baba_stoyanka/skeptical-seated-v1.webp",\n','')
 .replace('background: "assets/chapter1/scenes/mehana/background-redesign-v1.png"','background: "assets/chapter1/scenes/mehana/background.png"')
 .replace('mehana_waiter/idle-bartender-v2.png','mehana_waiter/idle-v1.png')
 .replace('table-group-left-redesign-v1.png','table-group-left-v2.png')
 .replace('table-group-right-redesign-v1.png','table-group-right-v2.png')
 .replace('      mehanaRearChairs: "assets/chapter1/scenes/mehana/rear-chairs-redesign-v1.png",\n','')
 .replace('      mehanaCounterFront: "assets/chapter1/scenes/mehana/counter-front-redesign-v1.png",\n','')
 .replace('      mehanaCellarHatch: "assets/chapter1/scenes/mehana/cellar-hatch-preserved-v1.png",\n','');
 assert.equal(sha(priorManifest),baseline.source.manifest,'all mappings outside the named mehana redesign must preserve the fixed approved baseline');
 const election=chapter1.scenes.find(s=>s.id==='scene.chapter1.election_booth');assert.ok(election.foregroundLayers.every(l=>!l.reactionAnimations));
});
test('Skeptical blending preserves duration, total opacity and entry/exit endpoints',()=>{
 const duration=36*reaction.frameDurationMs;
 for(let t=0;t<duration;t+=4.9){const s=sceneReactionBlendSamples(reaction,t);assert.ok(Math.abs(s.baseWeight+s.frames.reduce((n,f)=>n+f.weight,0)-1)<1e-12);assert.ok(s.frames.every(f=>f.frameIndex>=0&&f.frameIndex<36));}
 assert.equal(sceneReactionBlendSamples(reaction,0).baseWeight,1);assert.equal(sceneReactionBlendSamples(reaction,duration).baseWeight,1);
});
