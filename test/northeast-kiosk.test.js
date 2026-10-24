import test from 'node:test';
import {restorePhotoQuestSnapshot} from './helpers/photo-quest-preservation.js';
import {restoreActionCursorsSnapshot} from './helpers/action-cursors-preservation.js';
const scenesWithEntrances=chapter1.scenes;
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chapter1} from '../src/content/chapter1/index.js';
import {isWalkable,findWalkPath,nearestReachableWalkablePoint,walkPathDistance} from '../src/engine/SceneGeometry.js';
import {sceneZIndexForPoint} from '../src/engine/Renderer.js';
import {sceneLayerGeometry} from '../src/content/chapter1/sceneLayers.generated.js';
import {stripNortheastKiosk,restoreNortheastKioskSnapshot} from './helpers/northeast-kiosk-preservation.js';
const sha=value=>createHash('sha256').update(value).digest('hex');
const square=chapter1.scenes.find(s=>s.id==='scene.chapter1.village_square');
const fixture=JSON.parse(readFileSync('test/fixtures/northeast-kiosk-deltas.json'));

test('reviewed whole-square ground delta only removes blocked cells and retains the marked northeast limit',()=>{
 const source=JSON.parse(fixture.records['assets_src/chapter1/scenes/village_square/walk-geometry-v1.json'].before),old=source.raster.rows,now=restoreActionCursorsSnapshot('scenes',chapter1.scenes).find(s=>s.id===square.id).walkMask.rows;let removed=0;
 for(let row=0;row<now.length;row++)for(let col=0;col<now[row].length;col++){
  const x=(col+.5)*5,y=(row+.5)*5;
  if(x>=930&&y<465)assert.equal(now[row][col],'.');
  if(old[row][col]!==now[row][col]){removed++;assert.equal(old[row][col],'c');assert.equal(now[row][col],'.');}
 }
 assert.equal(removed,1221);
 for(const requested of [{x:960,y:430},{x:1000,y:400},{x:1279,y:300}]){
  const destination=nearestReachableWalkablePoint(square,{x:300,y:520},requested);
  assert.ok(destination&&destination.y>=465);assert.ok(findWalkPath(square,{x:300,y:520},destination).length);
 }
});

test('corner clearance preserves the narrow eastern fountain passage without a whole-fountain detour',()=>{
 const from={x:997.5,y:507.5},to={x:1077.5,y:655},route=findWalkPath(square,from,to);
 assert.ok(route.length);assert.ok(walkPathDistance(from,route)<400);
 let previous=from;for(const point of route){const steps=Math.ceil(Math.hypot(point.x-previous.x,point.y-previous.y));for(let i=1;i<=steps;i++)assert.ok(isWalkable(square,{x:previous.x+(point.x-previous.x)*i/steps,y:previous.y+(point.y-previous.y)*i/steps}));previous=point;}
 assert.ok(isWalkable(square,{x:970,y:580}));assert.ok(!isWalkable(square,{x:1020,y:570}));
 for(const point of [{x:965,y:475},{x:990,y:550},{x:1077.5,y:655},{x:735,y:600},{x:442.5,y:477.5},{x:300,y:520},{x:245,y:555}]){assert.ok(isWalkable(square,point),JSON.stringify(point));assert.ok(findWalkPath(square,{x:300,y:540},point).length);}
});

test('reported board/bin/seat/shrub/vendor clicks project to ground and every resulting route segment stays walkable',()=>{
 const start={x:300,y:540};
 for(const point of [{x:205,y:445},{x:270,y:425},{x:325,y:435},{x:430,y:410},{x:1150,y:640},{x:1200,y:650},{x:200,y:420},{x:360,y:450}]){
  assert.equal(isWalkable(square,point),false,JSON.stringify(point));
  const destination=nearestReachableWalkablePoint(square,start,point),route=findWalkPath(square,start,destination);assert.ok(destination&&route.length);
  let a=start;for(const b of route){const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*2));for(let i=0;i<=n;i++)assert.ok(isWalkable(square,{x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n}));a=b;}
 }
});

test('all remaining square ground is one connected component, with every scene return and NPC stop reachable',()=>{
 const m=square.walkMask,w=m.width,start={x:Math.floor(300/5),y:Math.floor(540/5)},queue=[start],seen=new Set([start.y*w+start.x]);
 for(let i=0;i<queue.length;i++){const p=queue[i];for(const[dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const x=p.x+dx,y=p.y+dy,k=y*w+x;if(x<0||y<0||x>=w||y>=m.height||m.rows[y][x]==='.'||seen.has(k))continue;seen.add(k);queue.push({x,y});}}
 assert.equal(seen.size,m.rows.join('').replaceAll('.','').length);
 for(const s of chapter1.scenes)for(const e of s.exits)if(e.targetSceneId===square.id){assert.ok(isWalkable(square,e.targetPosition),e.id);assert.ok(findWalkPath(square,{x:300,y:540},e.targetPosition).length,e.id);}
 assert.ok(findWalkPath(square,{x:300,y:550},{x:1000,y:480}).some(p=>p.x>550&&p.x<800&&p.y<478),'accepted rear fountain lane remains in the route');
});

test('existing original counter occludes the rear gait and actor remains visible on the front pavement',()=>{
 const counter=square.foregroundLayers.find(l=>l.id==='layer.square.kiosk_counter');assert.equal(counter.zIndex,1);assert.equal(counter.asset,'kioskCounterC05');
 assert.ok(sceneZIndexForPoint(square,{x:1000,y:570})>counter.zIndex);assert.ok(sceneZIndexForPoint(square,{x:1090,y:630})<counter.zIndex);
 const oldLayers=JSON.parse(fixture.records['assets_src/chapter1/scenes/village_square/layers.json'].before),now=JSON.parse(readFileSync('assets_src/chapter1/scenes/village_square/layers.json'));
 const restored=structuredClone(now);restored.layers.find(l=>l.id===counter.id).zIndex=30;assert.deepEqual(restored,oldLayers);
 assert.equal(sha(readFileSync('assets/chapter1/scenes/village_square/kiosk-counter-c05.png')),'98d13ad75e1693d61c4724ef3910702b338d039eb341633708cc5cdd22a0be84');
});

test('municipality and election returns use connected pavement; access gates and remaining scene contracts stay intact',()=>{
 const chapter1={scenes:restoreActionCursorsSnapshot('scenes',scenesWithEntrances)};
 const square=chapter1.scenes.find(s=>s.id==='scene.chapter1.village_square');
 const before=restoreNortheastKioskSnapshot('scenes',chapter1.scenes),original=before.find(s=>s.id===square.id),currentDoor=square.exits.find(e=>e.id==='exit.square.to_municipality');
 assert.deepEqual(currentDoor,original.exits.find(e=>e.id===currentDoor.id));
 const municipality=chapter1.scenes.find(s=>s.id==='scene.chapter1.municipality');assert.deepEqual(municipality.exits.find(e=>e.id==='exit.municipality.to_square').targetPosition,{x:965,y:475});
 const election=chapter1.scenes.find(s=>s.id==='scene.chapter1.election_booth');assert.deepEqual(election.exits.find(e=>e.id==='exit.election_booth.to_square').targetPosition,{x:300,y:540});
 const restored=structuredClone(restorePhotoQuestSnapshot('scenes',chapter1.scenes));restored.find(s=>s.id===square.id).anchors.municipalityDoor={x:965,y:450};restored.find(s=>s.id===square.id).walkMask=original.walkMask;restored.find(s=>s.id===square.id).foregroundLayers=original.foregroundLayers;restored.find(s=>s.id===municipality.id).exits.find(e=>e.id==='exit.municipality.to_square').targetPosition={x:965,y:450};restored.find(s=>s.id===election.id).exits.find(e=>e.id==='exit.election_booth.to_square').targetPosition={x:650,y:535};assert.deepEqual(JSON.parse(JSON.stringify(restored)),before);
});

test('new exact inverse restores every PR72 source byte and runtime snapshot and rejects unknown mutations',()=>{
 assert.equal(fixture.baseline,'4a0f85dbdf1d50f94079e14e5995206460698396');
 for(const[file,r]of Object.entries(fixture.records)){const bytes=readFileSync(file);assert.equal(stripNortheastKiosk(file,bytes),r.before);assert.throws(()=>stripNortheastKiosk(file,Buffer.concat([bytes,Buffer.from('tamper')])),/exact scene fix/);}
 assert.deepEqual(restoreNortheastKioskSnapshot('runtime',sceneLayerGeometry),fixture.snapshots.runtime.before);
});
