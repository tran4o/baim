import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {assetManifest} from '../src/content/art/assetManifest.js';
import {chapter1} from '../src/content/chapter1/index.js';
import {fullPosterPanelR45} from '../src/content/chapter1/posterContestR45.js';
import {INSPECTION_PROFILE} from '../src/engine/InspectionControls.js';
const sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>readFileSync(new URL('../'+p,import.meta.url));
test('R54 exact print is shared by inventory and packed native P3; accepted originals survive',()=>{
 const item=assetManifest.items['item.campaign_pamphlets'],front=read(item.icon),model=read(item.model);
 assert.equal(sha(front),'a3ad9cc276955a061f69f58734234fb2d685dc705f104cca030f416d8b294785');
 assert.equal(sha(model),'976bdb04dc353fdc07b446e9b53628dd256636178d18adde1941da86e446ce44');
 const size=model.readUInt32LE(12),doc=JSON.parse(model.subarray(20,20+size).toString()),bin=model.subarray(28+size);
 assert.ok(doc.images.some(image=>{const v=doc.bufferViews[image.bufferView];return sha(bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength))===sha(front);}));
 assert.equal(sha(read('assets_src/chapter1/items/campaign-poster-p3-r54/selected-p3.blend')),'b711afd12d1dfdfe08a82d7cc6caeda8f0d42252ab5ab7780a34bc34ca4929fb');
 assert.equal(sha(read('assets/chapter1/items/campaign-poster-p3-r51/poster.glb')),'8b79face6be36954409710d87d975df55fc15230e3307a57cd43772b98d9ccfa');
 assert.equal(item.inspectionDefaultZoom,1.5);assert.equal(item.inspectionFitScale,1.5);
 assert.equal(INSPECTION_PROFILE.maxZoom,1.5);assert.equal(INSPECTION_PROFILE.tiltLimit,Math.PI/12);
});
test('incumbent and manually posted poster fill the same existing panel without covering wood',()=>{
 assert.deepEqual(fullPosterPanelR45.polygon.map(p=>[p.x,p.y]),[[1048,250],[1117,237],[1119,421],[1051,416]]);
 const square=chapter1.scenes.find(s=>s.id==='scene.chapter1.village_square'),assets=assetManifest.scenes[square.id];
 const layers=square.foregroundLayers.filter(l=>['layer.square.incumbent_poster','layer.square.campaign_poster'].includes(l.id));
 assert.equal(layers.length,2);
 for(const layer of layers){assert.equal(layer.left,0);assert.equal(layer.top,0);const p=PNG.sync.read(read(assets[layer.asset]));assert.deepEqual([p.width,p.height],[1280,720]);assert.equal(p.data[(250*1280+1040)*4+3],0);assert.ok(p.data[(325*1280+1080)*4+3]>200);}
 assert.equal(layers.find(l=>l.id.endsWith('incumbent_poster')).hiddenWhenFlag,'campaignPosted');
 assert.equal(layers.find(l=>l.id.endsWith('campaign_poster')).visibleWhenFlag,'campaignPosted');
 assert.equal(sha(read('assets/chapter1/scenes/village_square/poster-r53/incumbent-source.png')),'6ad48f5cc4847809b6359b7583a667d45e55eec73ed2df63af8c9e275c70078e');
 assert.equal(chapter1.items.some(i=>/choni|incumbent/i.test(i.id)),false);
});
