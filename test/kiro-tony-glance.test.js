import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SceneNpcSpeech} from '../src/engine/SceneNpcSpeech.js';
import {chapter1} from '../src/content/chapter1/index.js';
import {assetManifest} from '../src/content/art/assetManifest.js';
const scene=chapter1.scenes.find(s=>s.id==='scene.chapter1.mehana');
const layer=scene.foregroundLayers.find(l=>l.id==='layer.mehana.waiter_idle');
const animation=layer.speechAnimation.nodeReactions.tony_weakness;
function fixture(){
 const controller=new SceneNpcSpeech();let entry={},line={token:{},elapsed:0},engaged=true,loaded=true;
 const update=(ms=0,options={})=>{if(!options.paused&&line)line.elapsed+=ms;controller.update(scene,ms,{speech:()=>line,conversation:()=>engaged,available:a=>a!==animation||loaded,reaction:()=>entry?{entry,animation}:null,...options});};
 return {controller,update,view:()=>structuredClone(controller.presentation(scene.id,layer)),
  newEntry:()=>{entry={};line={token:{},elapsed:0};},textToken:()=>{line={token:{},elapsed:line.elapsed};},
  missing:()=>{loaded=false;},load:()=>{loaded=true;},stop:()=>{line=null;},
  next:()=>{entry=null;line={token:{},elapsed:0};},close:()=>{entry=null;line=null;engaged=false;}};
}
test('Tony aside plays once per entry, resumes current speech time and holds listener after the line',()=>{
 const f=fixture();f.update();assert.equal(f.view().phase,'reacting');
 for(let i=1;i<64;i++){f.update(63);assert.equal(f.view().phase,'reacting');assert.equal(f.view().reaction.elapsed,i*63);}
 f.update(63);assert.equal(f.view().phase,'speaking');assert.equal(f.view().speechTime,4032);
 f.update(280);assert.equal(f.view().speechWeight,1);
 f.textToken();f.update();assert.equal(f.view().phase,'speaking');
 f.stop();f.update();f.update(280);assert.equal(f.view().phase,'listening');assert.equal(f.view().listeningWeight,1);
 f.update(20000);assert.equal(f.view().phase,'listening');f.newEntry();f.update();assert.equal(f.view().phase,'reacting');
});
test('Missing/evicted art and scene re-entry cannot late-replay a consumed Tony aside',()=>{
 const f=fixture();f.missing();f.update();assert.equal(f.view().phase,'speaking');f.load();f.update(500);assert.equal(f.view().phase,'speaking');
 f.newEntry();f.update();assert.equal(f.view().phase,'reacting');f.missing();f.update();assert.equal(f.view().phase,'speaking');f.load();f.update(500);assert.equal(f.view().phase,'speaking');
 f.controller.update({id:'other',foregroundLayers:[],npcs:[]},0);f.update();assert.equal(f.view().phase,'speaking');
 f.newEntry();f.update();assert.equal(f.view().phase,'reacting');
});
test('Pause/menu freezes the aside; next node, line ending and cancellation settle without resuming it',()=>{
 const f=fixture();f.update();f.update(200);const held=f.view();f.update(10000,{paused:true});assert.deepEqual(f.view(),held);
 f.next();f.update();assert.equal(f.view().phase,'speaking');assert.ok(f.view().samples.some(s=>s.animation===undefined||s.animation.asset===animation.asset));
 f.newEntry();f.update();f.stop();f.update();assert.equal(f.view().phase,'listening');f.update(280);assert.equal(f.view().listeningWeight,1);
 f.newEntry();f.update();f.close();f.update();assert.equal(f.view().phase,'returning');f.update(360);assert.equal(f.view().phase,'idle');
 const g=fixture();g.update(0,{canceled:true});g.update();assert.equal(g.view().phase,'listening');
});
test('c05 retains native timing/source bytes and registers padded art independently of actor scale',()=>{
 const p=JSON.parse(readFileSync('assets_src/characters/mehana_waiter/external_animation_v1/input/kiro-tony-glance-keyframe-c05-edea3548/provenance.json'));
 const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
 assert.equal(sha(p.sourceZip.path),p.sourceZip.sha256);assert.equal(sha(p.runtime.path),p.runtime.sha256);
 assert.equal(p.nativeDurationMs,4032);assert.equal(animation.frameCount*animation.frameDurationMs,4032);
 assert.equal(animation.loop,false);assert.equal(animation.dialogueId,'dialogue.mehana_waiter');
 assert.equal(assetManifest.scenes[scene.id][animation.asset],p.runtime.path);
 assert.deepEqual(animation.registrationBounds,{x:21,y:20,w:170,h:512});
 assert.deepEqual([layer.left,layer.top,layer.height,layer.zIndex],[727,222,265,50]);
});
