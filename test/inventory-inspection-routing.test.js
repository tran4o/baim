import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolveItemInspectionAsset } from '../src/engine/ItemInspectionAssets.js';
import { assetManifest } from '../src/content/art/assetManifest.js';
import { items } from '../src/content/chapter1/items.js';
import { createHash } from 'node:crypto';

test('inspection follows the exact current print slot and rejects absent editions', () => {
  const original = { icon: 'icon.png', model: 'original.glb', nativeSource: 'original.blend', inspection: 'prop',
    inspectionModels: { stampedIcon: { model: 'stamped.glb', nativeSource: 'stamped.blend' } } };
  assert.equal(resolveItemInspectionAsset(original).model, 'original.glb');
  assert.equal(resolveItemInspectionAsset(original, 'stampedIcon').model, 'stamped.glb');
  assert.equal(resolveItemInspectionAsset(original, 'stampedIcon').nativeSource, 'stamped.blend');
  assert.equal(resolveItemInspectionAsset(original, 'pepaIcon').model, null, 'never show the original diploma for an unmapped altered edition');
  assert.equal(original.model, 'original.glb', 'resolving an edition must not mutate the inventory manifest');
  const missingEditionNative = { ...original, inspectionModels: { stampedIcon: { model: 'other.glb' } } };
  assert.equal(resolveItemInspectionAsset(missingEditionNative, 'stampedIcon').model, null, 'a new edition cannot inherit an unrelated native provenance');
});

test('a static image or unprovenanced model cannot masquerade as native 3D inspection', () => {
  for (const asset of [{ icon: 'photo.png' }, { model: 'plane.glb' }, { model: 'prop.glb', nativeSource: 'picture.png' }, {}]) {
    assert.equal(resolveItemInspectionAsset(asset).model, null);
  }
});

test('every current collectible and icon-rule edition has an existing Blender source and embedded runtime model', () => {
  const provenance = JSON.parse(readFileSync('assets_src/chapter1/items/inventory-inspection-r56/model-provenance.json'));
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const checked = [];
  for (const item of items) for (const slot of new Set(['icon', ...(item.iconRules || []).map(rule => rule.slot)])) {
    const asset = resolveItemInspectionAsset(assetManifest.items[item.id], slot);
    assert.ok(asset.model, `${item.id}/${slot}: native model required`);
    assert.ok(asset.nativeSource.startsWith('assets_src/'), `${item.id}/${slot}: retain editable native under assets_src`);
    assert.ok(existsSync(asset.nativeSource), `${item.id}/${slot}: missing Blender source`);
    const bytes = readFileSync(asset.model);
    const source = provenance.states.find(state => state.id === item.id && state.slot === slot);
    assert.ok(source, `${item.id}/${slot}: source/export provenance required`);
    assert.equal(source.modelSHA256, sha(bytes));
    assert.equal(source.nativeSource, asset.nativeSource);
    assert.equal(source.nativeSHA256, sha(readFileSync(asset.nativeSource)));
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    assert.match(gltf.asset.generator, /Blender/i, `${item.id}/${slot}: actual Blender export provenance`);
    assert.ok(gltf.meshes?.length, `${item.id}/${slot}: missing geometry`);
    assert.ok(!gltf.animations?.length, 'inspection has no automatic object animation');
    assert.ok(!gltf.cameras?.length, 'shared viewer owns the camera');
    for (const image of gltf.images || []) assert.ok(image.bufferView >= 0, 'runtime textures are embedded');
    checked.push(`${item.id}/${slot}`);
  }
  assert.equal(items.length, 18);
  assert.equal(checked.length, 21);
  assert.equal(provenance.states.length, 21, 'no retired model stays in active provenance');
  assert.equal(assetManifest.items['item.glass_of_water'], undefined);
  assert.ok(provenance.states.every(state => state.id !== 'item.glass_of_water'));
  assert.ok(!existsSync('assets/chapter1/items/inventory-inspection-r56/glass_of_water-default.glb'));
});
