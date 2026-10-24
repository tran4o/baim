import {restoreNortheastKioskSnapshot} from './helpers/northeast-kiosk-preservation.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chapter1} from '../src/content/chapter1/index.js';
import {assetManifest} from '../src/content/art/assetManifest.js';
import {isWalkable,findWalkPath} from '../src/engine/SceneGeometry.js';
import {stripBottleArrivalWater,restoreBottleArrivalWaterSnapshot} from './helpers/bottle-arrival-water-preservation.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const parse=file=>{const b=readFileSync(file),n=b.readUInt32LE(12);return{json:JSON.parse(b.toString('utf8',20,20+n)),binary:b.subarray(28+n,28+n+b.readUInt32LE(20+n))};};
test('oil Examine maps to the unchanged accepted 200ml 3D model, while empty remains distinct',()=>{
 assert.equal(assetManifest.items['item.sunflower_oil'].model,'assets/chapter1/items/kiro-bottle/oil-200ml-r08.glb');
 assert.equal(sha(readFileSync(assetManifest.items['item.sunflower_oil'].model)),'ef5d72f082f9eab3b43883ef4063c823ab11746dbe1a3896ca6d974d46d180b1');
 assert.equal(sha(readFileSync(assetManifest.items['item.empty_rakia_bottle'].model)),'463324d8f33d79fb1482056e08d46e70b265f83d29ba9480b97174dcf4dbc4b0');
});
test('apartment exit lands on connected pavement; PR71 interior and municipality returns stay exact',()=>{
 const apartment=chapter1.scenes.find(s=>s.id==='scene.chapter1.apartment'),square=chapter1.scenes.find(s=>s.id==='scene.chapter1.village_square'),municipality=restoreNortheastKioskSnapshot('scenes',chapter1.scenes).find(s=>s.id==='scene.chapter1.municipality');
 const point=apartment.exits.find(e=>e.id==='exit.apartment.to_square').targetPosition;
 assert.deepEqual(point,{x:460,y:445});assert.ok(isWalkable(square,point));
 for(const to of [{x:350,y:570},{x:665,y:470},{x:970,y:550}])assert.ok(findWalkPath(square,point,to).length);
 assert.deepEqual(square.exits.find(e=>e.id==='exit.square.to_mehana').targetPosition,{x:150,y:585});
 assert.deepEqual(municipality.exits.find(e=>e.id==='exit.municipality.to_square').targetPosition,{x:965,y:450});
 assert.deepEqual(square.playerStart,{x:300,y:540});
});
test('water changes only the liquid primitive/material and appends bytes; cap, glass, label and transforms stay exact',()=>{
 const old=parse('assets/chapter1/items/kiro-bottle/fountain-water-c07.glb'),current=parse(assetManifest.items['item.fountain_water_bottle'].model),j=current.json;
 assert.ok(current.binary.subarray(0,old.binary.length).equals(old.binary));
 const mi=j.meshes.findIndex(m=>m.name.includes('water')),p=j.meshes[mi].primitives[0],oldP=old.json.meshes[mi].primitives[0];
 const a=j.accessors[p.attributes.POSITION],v=j.bufferViews[a.bufferView];let max=-Infinity,min=Infinity,atTop=0;
 for(let i=0;i<a.count;i++){const at=v.byteOffset+i*12,y=current.binary.readFloatLE(at+4);max=Math.max(max,y);min=Math.min(min,y);if(Math.abs(y-.153)<1e-7)atTop++;assert.ok(Number.isFinite(y));}
 assert.ok(Math.abs(max-.153)<1e-7);assert.ok(Math.abs(min-old.json.accessors[oldP.attributes.POSITION].min[1])<1e-7);assert.ok(atTop>100);
 assert.equal(assetManifest.items['item.fountain_water_bottle'].liquidColor,null,'retain embedded olive texture');
 j.meshes[mi].primitives[0]=oldP;j.materials[oldP.material]=old.json.materials[oldP.material];
 for(const key of ['accessors','bufferViews','images','textures'])j[key]=j[key].slice(0,old.json[key].length);
 j.buffers=old.json.buffers;assert.deepEqual(j,old.json);
});
test('new exact inverse restores PR71 bytes and full manifest and rejects unknown changes',()=>{
 const f=JSON.parse(readFileSync('test/fixtures/bottle-arrival-water-deltas.json'));
 assert.equal(f.baseline,'bef64202b11bc703f606786f5b4012306a24cdda');
 for(const[p,r]of Object.entries(f.records)){const data=readFileSync(p);assert.equal(stripBottleArrivalWater(p,data),r.before);assert.throws(()=>stripBottleArrivalWater(p,Buffer.concat([data,Buffer.from('tamper')])),/exact scene fix/);}
 assert.deepEqual(restoreBottleArrivalWaterSnapshot('manifest',assetManifest),f.snapshots.manifest.before);
});
