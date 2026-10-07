import test from 'node:test';
import assert from 'node:assert/strict';
import {Renderer} from '../src/engine/Renderer.js';
function fixture(){
 const animation={asset:'idle',npcId:'npc.sample',quietOnly:true,frameWidth:10,frameHeight:20,frameCount:2,columns:2,frameDurationMs:100,loop:true};
 const layer={id:'sample-layer',asset:'static',left:0,top:0,height:20,animation};
 const scene={id:'sample',npcs:[{id:'npc.sample'}]};
 const images=Object.fromEntries(['idle','static','talk','reaction'].map(k=>[k,{naturalWidth:20,naturalHeight:20}]));
 const loaded=new Set(Object.values(images)),calls=[];
 const game={lastTime:100,dialogue:{current:null},content:{dialogues:{own:{npcId:'npc.sample'},other:{npcId:'npc.other'}}},npcSpeechAnimationTime:()=>null,assets:{getSceneImage:(_s,k)=>images[k],isLoaded:i=>loaded.has(i)}};
 const renderer=Object.assign(Object.create(Renderer.prototype),{game,ctx:{drawImage:(...a)=>calls.push(a)}});
 const draw=()=>{renderer.drawSceneRasterLayer(scene,layer);return calls.at(-1)[0];};
 return {animation,layer,scene,images,loaded,game,renderer,draw};
}
test('opt-in quiet idle yields throughout its conversation and speech fade, then resumes',()=>{
 const f=fixture();assert.equal(f.draw(),f.images.idle);
 f.game.dialogue.current={id:'own',nodeId:'silent'};assert.equal(f.draw(),f.images.static);
 f.game.dialogue.current={id:'other'};assert.equal(f.draw(),f.images.idle);
 f.game.dialogue.current=null;
 for(const phase of ['in','visible','out']){f.game.npcSpeechBubble={npcId:'npc.sample',phase};assert.equal(f.draw(),f.images.static);}
 f.game.npcSpeechBubble={npcId:'npc.other'};assert.equal(f.draw(),f.images.idle);
 f.game.npcSpeechBubble=null;f.game.npcSpeechAnimationTime=()=>0;assert.equal(f.draw(),f.images.static);
 f.game.npcSpeechAnimationTime=()=>null;assert.equal(f.draw(),f.images.idle);
});
test('quiet idle uses static in nonplay states, missing candidate and invalid NPC binding',()=>{
 const f=fixture();
 for(const flag of ['paused','menuOpen','devHome','editMode']){f.game[flag]=true;assert.equal(f.draw(),f.images.static);f.game[flag]=false;}
 f.loaded.delete(f.images.idle);assert.equal(f.draw(),f.images.static);f.loaded.add(f.images.idle);
 f.animation.npcId='npc.missing';assert.equal(f.draw(),f.images.static);
 delete f.animation.npcId;assert.equal(f.draw(),f.images.static);
});
test('quiet idle preserves talk/reaction priority and leaves legacy idle behavior unchanged',()=>{
 const f=fixture();f.layer.talkAnimation={...f.animation,asset:'talk',quietOnly:undefined};
 f.game.dialogue.current={id:'own',nodeId:'start'};f.game.npcSpeechAnimationTime=()=>0;assert.equal(f.draw(),f.images.talk);
 const reaction={...f.animation,asset:'reaction',loop:false,quietOnly:undefined};
 f.layer.reactionAnimations={nod:reaction};f.game.dialogue.entry={session:f.game.dialogue.current,nodeId:'start',reactionId:'nod'};assert.equal(f.draw(),f.images.reaction);
 f.game.dialogue.current=null;f.game.dialogue.entry=null;f.game.npcSpeechAnimationTime=()=>null;f.loaded.delete(f.images.talk);
 delete f.animation.quietOnly;f.game.paused=true;f.game.npcSpeechBubble={npcId:'npc.sample'};assert.equal(f.draw(),f.images.idle);
});
