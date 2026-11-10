import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {assetManifest} from '../src/content/art/assetManifest.js';
import {fullPosterPanelR45} from '../src/content/chapter1/posterContestR45.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('selected P3 native paper uses exact accepted artwork and complete textured UVs/material maps',()=>{
 const a=assetManifest.items['item.campaign_pamphlets'],p=JSON.parse(readFileSync('assets/chapter1/items/campaign-poster-p3-r51/provenance.json'));
 assert.equal(hash(readFileSync(a.icon)),'f283129fff2c019592620da8dc70b0a9557416c2c9acb0a396091a353689920d');
 assert.equal(hash(readFileSync(a.model)),'8b79face6be36954409710d87d975df55fc15230e3307a57cd43772b98d9ccfa');
 assert.equal(hash(readFileSync(p.native)),p.nativeSHA256);assert.equal(hash(readFileSync(p.wallSource)),p.wallSourceSHA256);
 const bytes=readFileSync(a.model),g=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));assert.ok(!g.animations&&!g.skins&&!g.cameras);
 for(const m of g.materials){assert.ok(m.normalTexture);assert.ok(m.pbrMetallicRoughness.metallicRoughnessTexture);}
 const front=g.meshes.flatMap(m=>m.primitives).find(x=>g.materials[x.material].pbrMetallicRoughness.baseColorTexture);assert.ok(front.attributes.TEXCOORD_0!==undefined);
 assert.equal(a.inspection,'prop');assert.deepEqual(a.cameraDirection,[0,0,1]);assert.equal(a.inspectionFitScale,1.5);
});
test('posted P3 includes remeasured bottom corners and right painted strip while leaving wood outside clear',()=>{
 const a=assetManifest.scenes['scene.chapter1.village_square'],p=JSON.parse(readFileSync('assets/chapter1/scenes/village_square/poster-p3-r51/provenance.json')),bytes=readFileSync(a.mitkoPosterR45);assert.equal(hash(bytes),p.outputSHA256);assert.deepEqual(p.quad,[[1048,250],[1117,237],[1119,421],[1051,416]]);assert.deepEqual(fullPosterPanelR45.polygon,p.quad.map(([x,y])=>({x,y})));
 const png=PNG.sync.read(bytes);for(const[x,y]of [[1051,415],[1118,420],[1118,410],[1080,416],[1116,240]])assert.equal(png.data[(y*1280+x)*4+3],255);for(const[x,y]of [[1040,270],[1123,300],[1080,426]])assert.equal(png.data[(y*1280+x)*4+3],0);
});
