import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PNG} from 'pngjs';
import {chapter1} from '../src/content/chapter1/index.js';import {characterDefinitions} from '../src/content/art/characters.js';import {sceneZIndexForPoint,actionHandOcclusionPolygon,animationRenderFrameIndex} from '../src/engine/Renderer.js';import {createHash} from 'node:crypto';
const spec=JSON.parse(readFileSync(new URL('../assets_src/chapter1/scenes/apartment/ad-r08/window-geometry-r06.json',import.meta.url))),scene=chapter1.scenes.find(s=>s.id==='scene.chapter1.apartment');
test('one right hinge and one free-edge midpoint define both handle states',()=>{
 assert.equal(spec.hingeSide,'right');assert.equal(spec.handle.edge,'free-left-stile');assert.equal(spec.handle.heightFraction,.5);
 for(const [state,quad]of [['closed',spec.closedQuad],['open',spec.openQuad]]){
  assert.deepEqual([quad[1],quad[2]],spec.hinge);const base=spec.handle[state+'Base'],tip=spec.handle[state+'Tip'];
  assert.equal(base[0]-quad[0][0],6);assert.equal(base[1],(quad[0][1]+quad[3][1])/2);assert.equal(tip[1],base[1]);assert.ok(tip[0]>base[0]&&tip[0]<quad[1][0]);
 }
});
test('native rigid sash has the approved opening and closing depth order',()=>{
 const close=scene.interactables.find(t=>t.id==='window.open').actions.use,open=scene.interactables.find(t=>t.id==='window').actions.use;
 assert.ok(close.approach.x>open.approach.x);
 assert.deepEqual(characterDefinitions['npc.bai_mitko'].render.sceneHeights[scene.id],{near:409,far:209});
 const sash=scene.foregroundLayers.find(l=>l.id==='layer.apartment.window_sash');assert.equal(sash,undefined);
 assert.equal(scene.interactionPresentation.asset,'windowNativeR17');
 assert.equal(open.windowPresentation.behindActor,true);assert.equal(close.windowPresentation.behindActor,false);
 assert.equal(open.handOcclusion,undefined);assert.equal(close.handOcclusion,undefined);
 assert.equal(close.animationFrame.reverseFrames,undefined);
 assert.equal(actionHandOcclusionPolygon(close,close.animationFrame,16),null);
});
test('handle-free sash contains only opaque wood and translucent glass',()=>{
 const image=PNG.sync.read(readFileSync('assets/chapter1/scenes/apartment/ad-r08/window-sash.png')),alpha=(x,y)=>image.data[(y*image.width+x)*4+3];
 assert.equal(image.width,1280);assert.equal(image.height,720);
 for(const p of [[200,200],[250,200],[330,200],[290,340],[300,60]])assert.equal(alpha(...p),0,JSON.stringify(p));
 assert.equal(alpha(261,220),255);assert.equal(alpha(313,245),255);assert.equal(alpha(290,220),spec.depth.glassAlpha);
 assert.equal(spec.handle.openVisible,false);assert.equal(alpha(277,199),spec.depth.glassAlpha,'Open lever region is plain glass, no visible handle');
 let opaque=0,translucent=0;for(let i=3;i<image.data.length;i+=4){if(image.data[i]===255)opaque++;else if(image.data[i]>0)translucent++;}
 assert.ok(opaque>1000&&opaque<6000);assert.ok(translucent>5000);assert.ok(opaque+translucent<15000);
});
test('owner-accepted closed handle and current character calibration are byte-preserved',()=>{
 const b=readFileSync('assets/chapter1/scenes/apartment/ad-r08/window-closed.png');
 assert.equal(createHash('sha256').update(b).digest('hex'),'8edd293ef4568dbaa10911b3e036943fdb6a2c96423b1dc95f40984a819b3ff8');
 assert.deepEqual(characterDefinitions['npc.bai_mitko'].render.sceneHeights[scene.id],{near:409,far:209});
});
