import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import{PNG}from'pngjs';
import{assetManifest}from'../src/content/art/assetManifest.js';import{wardrobeCloseup,wardrobeAccordion}from'../src/content/chapter1/wardrobe.js';import{chapter1}from'../src/content/chapter1/index.js';import{photoReward}from'../src/content/chapter1/photoQuest.js';import{stripWardrobeBindR21}from'./helpers/wardrobe-bind-r21-preservation.js';
test('exact owner-selected c04-A is bound without modifying its pixels or stretching its aspect',()=>{
 const p=assetManifest.scenes['scene.chapter1.apartment'][wardrobeCloseup.backgroundAsset],bytes=readFileSync(p),image=PNG.sync.read(bytes);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'ea2c927cba48abf778d7fe295f1c9843aca4ff7ed02ad5f0ce57566fbf23d642');assert.deepEqual(wardrobeCloseup.contentAspect,{width:image.width,height:image.height});
 const r=wardrobeCloseup.items[0].rect;assert.ok(r.x>=14&&r.x+r.w<=59);assert.ok(r.y>=59&&r.y+r.h<=75,'reserved lower-left cubby only');assert.equal(wardrobeCloseup.propMode,'wardrobe-puzzle-and-accordion-r08-context');
});
test('upper photo box stays decorative; wardrobe puzzle grants the school photo',()=>{
 const a=chapter1.scenes.find(s=>s.id==='scene.chapter1.apartment');assert.equal(wardrobeCloseup.items.length,2);assert.equal(wardrobeCloseup.items[0].target,wardrobeAccordion);assert.equal(a.interactables.some(t=>t.id==='hotspot.apartment.photo_cupboard'),false);assert.equal(wardrobeCloseup.items[1].target.puzzleId,'photo_cupboard');assert.ok(wardrobeCloseup.items[1].rect.y>=60);
 assert.ok(photoReward.effects.some(e=>e.itemId==='item.mitko_child_photo'));assert.equal(photoReward.effects.some(e=>e.itemId==='item.mitko_photo'),false);
 assert.notEqual(assetManifest.items['item.mitko_child_photo'].icon,assetManifest.items['item.mitko_photo'].icon);
});
test('r21 inverse preserves frozen r20 sources and rejects tampering',()=>{const f=JSON.parse(readFileSync('test/fixtures/wardrobe-bind-r21-deltas.json'));for(const[p,r]of Object.entries(f.records)){const s=readFileSync(p,'utf8');assert.equal(stripWardrobeBindR21(p,s,true),r.before);assert.throws(()=>stripWardrobeBindR21(p,s+'\n// unknown',true));}});
