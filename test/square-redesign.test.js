import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {chapter1} from '../src/content/chapter1/index.js';
import {assetManifest} from '../src/content/art/assetManifest.js';
import {findTargetAt,isWalkable,findWalkPath,findSceneSpeaker} from '../src/engine/SceneGeometry.js';
import {Game} from '../src/engine/Game.js';
import {campaignBg,campaignEn} from '../src/content/localization/chapter1Campaign.js';
const square=chapter1.scenes.find(s=>s.id==='scene.chapter1.village_square');
test('approved c05 source and original scene/NPC assets remain unchanged',async()=>{
 const source='assets_src/chapter1/scenes/village_square/redesign-c05/square-redesign-static-c05.png';
 assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'),'e787244e68ac05e1b752931cca18d048ba9d4f444df417b8675ed6b1d3706df6');
 const meta=await sharp(assetManifest.scenes[square.id].background).metadata();assert.equal(meta.width,1280);assert.equal(meta.height,720);
 const c05=await sharp(source).resize(1280,720,{fit:'fill'}).ensureAlpha().raw().toBuffer();
 const original=await sharp('assets/chapter1/scenes/village_square/background.png').ensureAlpha().raw().toBuffer();
 const name=await sharp('assets_src/chapter1/scenes/village_square/redesign-c05/sign-name-mask-r01.png').ensureAlpha().raw().toBuffer();
 const sign=await sharp('assets_src/chapter1/scenes/village_square/redesign-c05/sign-restore-mask-r01.png').ensureAlpha().raw().toBuffer();
 const runtime=await sharp(assetManifest.scenes[square.id].background).ensureAlpha().raw().toBuffer();
 let preserved=0,edited=0;
 for(let y=0;y<720;y++)for(let x=0;x<1280;x++){
  const i=(y*1280+x)*4,inSign=sign[i+3]>0;
  if(inSign&&name[i+3]){edited++;continue;}
  const expected=inSign?original:c05;
  assert.ok(runtime.subarray(i,i+4).equals(expected.subarray(i,i+4)),`preserved scene/sign pixel ${x},${y}`);preserved++;
 }
 assert.ok(preserved>900000);assert.ok(edited>1500&&edited<4000);
});
test('basin blocks feet, all approach anchors have connected paths and targets remain exposed',()=>{
 for(const p of [{x:650,y:490},{x:650,y:530},{x:480,y:510},{x:880,y:520}])assert.equal(isWalkable(square,p),false,JSON.stringify(p));
 for(const p of [{x:650,y:610},{x:990,y:550},{x:976,y:625},{x:300,y:540},{x:245,y:555}]){
  assert.equal(isWalkable(square,p),true,JSON.stringify(p));assert.ok(findWalkPath(square,{x:300,y:540},p).length);
 }
 for(const [id,p]of Object.entries({
  'hotspot.square.fountain':{x:700,y:520},'hotspot.square.statue':{x:508,y:350},
  'hotspot.square.kiosk':{x:1180,y:390},'hotspot.square.poster_board':{x:1070,y:300},
  'npc.baba_stoyanka':{x:360,y:390},
  'npc.journalist':{x:970,y:380},'exit.square.to_mehana':{x:90,y:350},
  'exit.square.to_municipality':{x:890,y:300},'exit.square.to_apartment':{x:450,y:150}
 }))assert.equal(findTargetAt(square,p)?.id,id);
});
test('only kiosk display names change; stable dialogue and quest transaction IDs remain',()=>{
 assert.ok(chapter1.dialogues.some(d=>d.id==='dialogue.penka_kiosk'));
 assert.ok(square.interactables.some(t=>t.id==='hotspot.square.kiosk'&&t.dialogueId==='dialogue.penka_kiosk'));
 assert.equal(JSON.stringify(campaignBg).includes('Дочева'),false);assert.equal(JSON.stringify(campaignEn).includes('Docheva'),false);
 assert.ok(campaignBg['campaign.kiosk.start'].startsWith('Леля Пепа:'));assert.ok(campaignEn['campaign.kiosk.start'].startsWith('Aunt Pepa:'));
});
test('Pepa speaks through the stable kiosk target, stops at reading end and freezes while paused',()=>{
 const dialogue=chapter1.dialogues.find(d=>d.id==='dialogue.penka_kiosk');
 assert.equal(dialogue.npcId,'hotspot.square.kiosk');
 const speaker=findSceneSpeaker(square,dialogue.npcId);assert.equal(speaker.dialogueSpeaker,true);
 assert.equal(findSceneSpeaker(square,'hotspot.square.fountain'),undefined);
 const session={id:dialogue.id,nodeId:'start'};
 const g=Object.assign(Object.create(Game.prototype),{currentScene:square,content:{dialogues:{[dialogue.id]:dialogue}},dialogue:{current:session,getNode:()=>dialogue.nodes[session.nodeId]},state:{flags:{}},t:key=>campaignEn[key],speechBubbleVisibleSeconds:()=>1,effectContext:()=>({state:{flags:{}},inventory:{has:()=>false}})});
 g.updateNpcDialogueSpeech(0);assert.equal(g.npcSpeechAnimationTime(speaker.id),0);
 g.paused=true;g.updateNpcDialogueSpeech(5);assert.equal(g.npcSpeechAnimationTime(speaker.id),0);
 g.paused=false;g.updateNpcDialogueSpeech(2);assert.equal(g.npcSpeechAnimationTime(speaker.id),null);assert.equal(g.dialogue.current,session);
 session.nodeId='requirements';g.updateNpcDialogueSpeech(0);assert.equal(g.npcSpeechAnimationTime(speaker.id),0);
 g.dialogue.current=null;g.dialogue.getNode=()=>null;g.updateNpcDialogueSpeech(0);assert.equal(g.npcDialogueSpeech,null);
});
test('repaired shallow pool stays restricted to the recessed floor; only its stream animates',async()=>{
 assert.equal(square.effects.length,1);assert.equal(square.effects[0].type,"waterStream");
 const layer=square.foregroundLayers.find(l=>l.asset==='fountainShallowWater');assert.equal(layer.visibleWhenFlag,'fountainRepaired');assert.equal(layer.animation,undefined);
 const {data,info}=await sharp(assetManifest.scenes[square.id].fountainShallowWater).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let count=0;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]){count++;assert.ok(x>=554&&x<=861&&y>=465&&y<=507,`${x},${y}`);}
 assert.ok(count>3000);
});
